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

psql_run() {
  psql --no-psqlrc --quiet -v ON_ERROR_STOP=1 "$@"
}

contar_tabelas() {
  psql_run --tuples-only --no-align -c \
    "select count(*) from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r';"
}

echo "==> 1/6 Preparando o ambiente auth que o Supabase fornece"
psql_run -f "$testes/00_auth_shim.sql"

echo "==> 2/6 Aplicando as migrations de homologação"
psql_run -f "$migrations/0001_marco_zero_up.sql"
psql_run -f "$migrations/0002_password_key_envelopes_up.sql"

tabelas="$(contar_tabelas)"
if [ "$tabelas" -ne 5 ]; then
  echo "FALHOU: esperava 5 tabelas em public depois das migrations, encontrei $tabelas" >&2
  exit 1
fi
echo "    5 tabelas criadas"

echo "==> 3/6 Provando o isolamento entre duas contas fictícias"
psql_run -f "$testes/01_rls_isolation.sql"

echo "==> 4/6 Revertendo as migrations"
psql_run -f "$migrations/0002_password_key_envelopes_down.sql"
psql_run -f "$migrations/0001_marco_zero_down.sql"

tabelas="$(contar_tabelas)"
if [ "$tabelas" -ne 0 ]; then
  echo "FALHOU: a reversão deixou $tabelas tabela(s) para trás em public" >&2
  exit 1
fi

restos="$(psql_run --tuples-only --no-align -c \
  "select count(*) from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'prevent_revoked_device_reactivation';")"
if [ "$restos" -ne 0 ]; then
  echo "FALHOU: a reversão deixou a função de trigger para trás" >&2
  exit 1
fi
echo "    reversão limpa"

echo "==> 5/6 Reaplicando as migrations sobre a base revertida"
psql_run -f "$migrations/0001_marco_zero_up.sql"
psql_run -f "$migrations/0002_password_key_envelopes_up.sql"

tabelas="$(contar_tabelas)"
if [ "$tabelas" -ne 5 ]; then
  echo "FALHOU: a reaplicação recriou $tabelas tabela(s) em vez de 5" >&2
  exit 1
fi

echo "==> 6/6 Reprovando o isolamento sobre a base reaplicada"
psql_run -f "$testes/01_rls_isolation.sql"

echo
echo "Migration aplicável, reversível e reaplicável; isolamento entre contas comprovado."
