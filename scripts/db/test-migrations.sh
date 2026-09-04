#!/usr/bin/env bash
# Aplica, prova e reverte a migration de homologação num Postgres descartável.
#
# Não usa credencial de nuvem, não fala com Supabase e não lê nenhum .env.
# Espera apenas um Postgres local acessível pelas variáveis padrão do psql
# (PGHOST, PGPORT, PGUSER, PGDATABASE) ou por DATABASE_URL.
#
# Uso local, com um Postgres descartável em contêiner:
#   docker run --rm -d --name apoio-pg -p 5432:5432 \
#     -e POSTGRES_HOST_AUTH_METHOD=trust postgres:16-alpine
#   PGHOST=localhost PGUSER=postgres PGDATABASE=postgres \
#     ./scripts/db/test-migrations.sh
#   docker rm -f apoio-pg

set -euo pipefail

raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migrations="$raiz/supabase/migrations"
testes="$raiz/supabase/tests"

# Conexão administrativa: só prepara o ambiente que o Supabase fornece pronto.
psql_run() {
  psql --no-psqlrc --quiet -v ON_ERROR_STOP=1 "$@"
}

# Conexão do papel que aplica migrations, com as fronteiras do Supabase
# gerenciado: sem superusuário e sem ser membro de `supabase_admin`.
#
# É por aqui que passam as migrations e as provas. Antes tudo rodava como
# superusuário, e por isso duas coisas impossíveis na nuvem passavam verdes
# aqui: `alter default privileges for role supabase_admin` e
# `create event trigger`. A homologação parou na 0005 por causa disso.
psql_migracao() {
  PGUSER=apoio_migracao PGPASSWORD='' psql --no-psqlrc --quiet -v ON_ERROR_STOP=1 "$@"
}

contar_tabelas() {
  psql_run --tuples-only --no-align -c \
    "select count(*) from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r';"
}

echo "==> 1/7 Preparando o ambiente auth que o Supabase fornece"
psql_run -f "$testes/00_auth_shim.sql"

echo "==> 2/7 Conferindo que a simulação tem as fronteiras do Supabase gerenciado"
# Sem esta guarda a simulação degrada em silêncio: bastaria alguém dar
# superusuário ao papel para o CI voltar a aprovar o que a nuvem recusa.
fronteiras="$(psql_migracao --tuples-only --no-align -c \
  "select current_user = 'apoio_migracao'
      and not (select r.rolsuper from pg_roles r where r.rolname = current_user)
      and not pg_has_role(current_user, 'supabase_admin', 'USAGE')
      and exists (select 1 from pg_roles where rolname = 'supabase_admin');")"
if [ "$fronteiras" != "t" ]; then
  echo "FALHOU: o papel das migrations nao reproduz as fronteiras do Supabase gerenciado" >&2
  exit 1
fi
echo "    papel sem superusuario e fora de supabase_admin"

echo "==> 3/7 Aplicando as migrations de homologação"
psql_migracao -f "$migrations/0000_plataforma_fechada_up.sql"
psql_migracao -f "$migrations/0001_marco_zero_up.sql"
psql_migracao -f "$migrations/0002_password_key_envelopes_up.sql"
psql_migracao -f "$migrations/0003_device_sessions_up.sql"
psql_migracao -f "$migrations/0004_sessao_revogada_e_ambiente_up.sql"
psql_migracao -f "$migrations/0005_ambiente_antes_da_senha_up.sql"
psql_migracao -f "$migrations/0006_expurgo_de_historico_up.sql"
psql_migracao -f "$migrations/0007_funcao_nova_fechada_up.sql"
psql_migracao -f "$migrations/0008_revogacao_idempotente_up.sql"
psql_migracao -f "$migrations/0009_sessoes_fora_de_alcance_up.sql"

tabelas="$(contar_tabelas)"
if [ "$tabelas" -ne 8 ]; then
  echo "FALHOU: esperava 8 tabelas em public depois das migrations, encontrei $tabelas" >&2
  exit 1
fi
echo "    8 tabelas criadas"

echo "==> 4/7 Provando o isolamento entre duas contas fictícias"
psql_migracao -f "$testes/01_rls_isolation.sql"
psql_migracao -f "$testes/02_device_barriers.sql"
psql_migracao -f "$testes/03_sessao_revogada.sql"

echo "==> 5/7 Revertendo as migrations"
psql_migracao -f "$migrations/0009_sessoes_fora_de_alcance_down.sql"
psql_migracao -f "$migrations/0008_revogacao_idempotente_down.sql"
psql_migracao -f "$migrations/0007_funcao_nova_fechada_down.sql"
psql_migracao -f "$migrations/0006_expurgo_de_historico_down.sql"
psql_migracao -f "$migrations/0005_ambiente_antes_da_senha_down.sql"
psql_migracao -f "$migrations/0004_sessao_revogada_e_ambiente_down.sql"
psql_migracao -f "$migrations/0003_device_sessions_down.sql"
psql_migracao -f "$migrations/0002_password_key_envelopes_down.sql"
psql_migracao -f "$migrations/0001_marco_zero_down.sql"
psql_migracao -f "$migrations/0000_plataforma_fechada_down.sql"

tabelas="$(contar_tabelas)"
if [ "$tabelas" -ne 0 ]; then
  echo "FALHOU: a reversão deixou $tabelas tabela(s) para trás em public" >&2
  exit 1
fi

restos="$(psql_run --tuples-only --no-align -c \
  "select count(*) from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('prevent_revoked_device_reactivation', 'claim_device', 'approve_device',
                       'revoke_device', 'upload_operations', 'download_operations',
                       'current_session_id', 'current_device_id', 'active_device_id',
                       'app_schema_version', 'session_is_authorized', 'session_is_not_revoked',
                       'protecao_de_funcao_nova', 'purge_record_history',
                       'funcoes_publicas_abertas',
                       'revoke_all_devices',
                       'app_environment');")"
if [ "$restos" -ne 0 ]; then
  echo "FALHOU: a reversão deixou $restos função(ões) das migrations para trás" >&2
  exit 1
fi
echo "    reversão limpa"

echo "==> 6/7 Reaplicando as migrations sobre a base revertida"
psql_migracao -f "$migrations/0000_plataforma_fechada_up.sql"
psql_migracao -f "$migrations/0001_marco_zero_up.sql"
psql_migracao -f "$migrations/0002_password_key_envelopes_up.sql"
psql_migracao -f "$migrations/0003_device_sessions_up.sql"
psql_migracao -f "$migrations/0004_sessao_revogada_e_ambiente_up.sql"
psql_migracao -f "$migrations/0005_ambiente_antes_da_senha_up.sql"
psql_migracao -f "$migrations/0006_expurgo_de_historico_up.sql"
psql_migracao -f "$migrations/0007_funcao_nova_fechada_up.sql"
psql_migracao -f "$migrations/0008_revogacao_idempotente_up.sql"
psql_migracao -f "$migrations/0009_sessoes_fora_de_alcance_up.sql"

tabelas="$(contar_tabelas)"
if [ "$tabelas" -ne 8 ]; then
  echo "FALHOU: a reaplicação recriou $tabelas tabela(s) em vez de 8" >&2
  exit 1
fi

echo "==> 7/7 Reprovando o isolamento sobre a base reaplicada"
psql_migracao -f "$testes/01_rls_isolation.sql"
psql_migracao -f "$testes/02_device_barriers.sql"
psql_migracao -f "$testes/03_sessao_revogada.sql"

echo
echo "Migration aplicável, reversível e reaplicável; isolamento entre contas comprovado."
