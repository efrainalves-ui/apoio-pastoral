begin;

-- ---------------------------------------------------------------------------
-- 1. A revogação passa a valer também para o token que já foi emitido.
--
-- Até aqui, revogar apagava o vínculo de sessão e barrava sincronizar. Mas as
-- tabelas de envelope continuavam com a política antiga, `auth.uid() =
-- owner_id` e nada mais. Um aparelho revogado, com o token de acesso ainda
-- vivo na memória (até uma hora), continuava podendo:
--
--   * ler o envelope de senha e o de recuperação da conta;
--   * apagar os envelopes de chave de todos os outros aparelhos;
--   * sobrescrever o envelope de senha, trancando o titular para fora de
--     qualquer aparelho novo.
--
-- A regra de produto continua igual: e-mail e senha certos entram normalmente
-- em um aparelho novo. Por isso o predicado abaixo libera a sessão que ainda
-- não reivindicou aparelho nenhum — ela acabou de provar a senha — e barra
-- apenas a sessão revogada e a sessão presa a um aparelho sem autorização.
-- ---------------------------------------------------------------------------

-- Sessão que não foi revogada e não pertence a um aparelho revogado. É o
-- mínimo para a tela de Segurança: um aparelho ainda aguardando confirmação
-- precisa enxergar a própria linha para descobrir que foi liberado.
create function public.session_is_not_revoked()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
     and public.current_session_id() is not null
     and not exists (
       select 1 from public.revoked_sessions r
       where r.session_id = public.current_session_id()
     )
     and not exists (
       select 1
       from public.device_sessions s
       join public.devices d on d.id = s.device_id
       where s.session_id = public.current_session_id()
         and s.owner_id = auth.uid()
         and d.status = 'revoked'
     );
$$;

-- Chave só chega a aparelho com autorização ativa. Uma sessão que ainda não
-- reivindicou aparelho nenhum passa: é a entrada com e-mail e senha em um
-- aparelho novo, em que o envelope é buscado antes de o aparelho existir.
create function public.session_is_authorized()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.session_is_not_revoked()
     and not exists (
       select 1
       from public.device_sessions s
       join public.devices d on d.id = s.device_id
       where s.session_id = public.current_session_id()
         and s.owner_id = auth.uid()
         and d.status is distinct from 'active'
     );
$$;

drop policy devices_owner_select on public.devices;
create policy devices_owner_select on public.devices
  for select using (auth.uid() = owner_id and public.session_is_not_revoked());

drop policy device_envelopes_owner_all on public.device_key_envelopes;
create policy device_envelopes_owner_all on public.device_key_envelopes
  for all
  using (
    auth.uid() = owner_id
    and public.session_is_authorized()
    and exists (
      select 1 from public.devices d
      where d.id = device_id and d.owner_id = auth.uid()
    )
  )
  with check (
    auth.uid() = owner_id
    and public.session_is_authorized()
    and exists (
      select 1 from public.devices d
      where d.id = device_id and d.owner_id = auth.uid() and d.status = 'active'
    )
  );

drop policy recovery_envelopes_owner_all on public.recovery_key_envelopes;
create policy recovery_envelopes_owner_all on public.recovery_key_envelopes
  for all
  using (auth.uid() = owner_id and public.session_is_authorized())
  with check (auth.uid() = owner_id and public.session_is_authorized());

drop policy password_envelopes_owner_all on public.password_key_envelopes;
create policy password_envelopes_owner_all on public.password_key_envelopes
  for all
  using (auth.uid() = owner_id and public.session_is_authorized())
  with check (auth.uid() = owner_id and public.session_is_authorized());

-- A mesma conferência dentro das funções de sincronização. Hoje a revogação já
-- apaga o vínculo, então `current_device_id()` devolveria nulo; a lista de
-- sessões revogadas entra aqui para o bloqueio não depender de um único passo
-- ter acontecido.
create or replace function public.active_device_id()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  dispositivo uuid;
  situacao text;
begin
  if auth.uid() is null then
    raise exception 'sessao nao autenticada';
  end if;
  if exists (select 1 from public.revoked_sessions r where r.session_id = public.current_session_id()) then
    raise exception 'sessao revogada';
  end if;
  dispositivo := public.current_device_id();
  if dispositivo is null then
    raise exception 'esta sessao ainda nao esta ligada a um aparelho autorizado';
  end if;
  select d.status into situacao from public.devices d
    where d.id = dispositivo and d.owner_id = auth.uid();
  if situacao is distinct from 'active' then
    raise exception 'aparelho sem autorizacao ativa';
  end if;
  return dispositivo;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Encerrar distrito revoga tudo, e quem sabe quais aparelhos existem é o
--    servidor.
--
-- Cada aparelho só guarda a si mesmo localmente. O encerramento percorria a
-- lista local e, por isso, revogava apenas o aparelho em que o pastor estava:
-- os outros continuavam sincronizando. Esta função revoga a conta inteira
-- dentro de uma transação, com o aparelho que chamou por último, para não
-- perder a autorização no meio do caminho.
-- ---------------------------------------------------------------------------

create function public.revoke_all_devices()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  conta uuid := auth.uid();
  atual uuid := public.active_device_id();
  alvo uuid;
  total integer := 0;
begin
  for alvo in
    select d.id from public.devices d
    where d.owner_id = conta and d.status <> 'revoked'
    order by (d.id = atual), d.id
  loop
    perform public.revoke_device(alvo);
    total := total + 1;
  end loop;
  return total;
end;
$$;

comment on function public.revoke_all_devices() is
  'Revoga todos os aparelhos ativos da conta. A sessão que chama continua valendo e pode registrar uma autorização nova, que é o encerramento de distrito.';

-- ---------------------------------------------------------------------------
-- 3. O ambiente declarado passa a existir também no banco.
--
-- A build já conferia endereço, chave e projeto declarado. Faltava o outro
-- lado: nada impedia uma build de produção conversar com o banco de
-- homologação, ou o contrário. A linha abaixo é escrita uma única vez, à mão,
-- por quem provisiona o projeto:
--
--   insert into public.service_environment (environment) values ('homologacao');
--
-- Sem essa linha o aplicativo se recusa a sincronizar. Falhar fechado é o
-- comportamento certo: um ambiente sem identidade declarada é exatamente o
-- caso em que dado real acaba no lugar errado.
-- ---------------------------------------------------------------------------

create table public.service_environment (
  id boolean primary key default true check (id),
  environment text not null check (environment in ('homologacao', 'producao')),
  set_at timestamptz not null default now()
);

alter table public.service_environment enable row level security;

-- O ambiente declarado sai apenas por `app_environment()`, que roda como dono.
-- A tabela em si não é alcançável pelo navegador: além de não ter privilégio
-- nenhum, esta política nega tudo de forma explícita. Se um dia alguém
-- conceder SELECT por engano, a RLS ainda barra — e uma tabela com RLS ligada
-- e nenhuma política parece esquecimento, não decisão.
create policy service_environment_sem_acesso_direto on public.service_environment
  for all using (false) with check (false);

create function public.app_environment()
returns text
language sql
stable
security definer
set search_path = ''
as $$ select e.environment from public.service_environment e limit 1 $$;

create or replace function public.app_schema_version()
returns integer
language sql
immutable
security invoker
set search_path = ''
as $$ select 4 $$;

-- ---------------------------------------------------------------------------
-- 4. Privilégios: o que o navegador alcança fica explícito, hoje e amanhã.
--
-- O Supabase concede privilégios padrão a anon e authenticated em toda tabela
-- nova de public. A migration anterior revogava só TRUNCATE, REFERENCES e
-- TRIGGER: uma tabela criada depois nasceria com SELECT, INSERT, UPDATE e
-- DELETE ao alcance do navegador e, sem RLS ligada, sem barreira nenhuma.
-- Aqui o padrão passa a ser nada, e cada objeto recebe o que precisa, na mão.
-- ---------------------------------------------------------------------------

revoke all on public.service_environment from public, anon, authenticated;

revoke all on function public.session_is_not_revoked(), public.session_is_authorized(),
  public.revoke_all_devices(), public.app_environment() from public, anon;
-- `session_is_authorized` aparece dentro das políticas, e a expressão de uma
-- política roda com os privilégios de quem consulta: sem este EXECUTE, toda
-- leitura de envelope falharia por permissão em vez de por autorização.
grant execute on function public.session_is_not_revoked(), public.session_is_authorized(),
  public.revoke_all_devices(), public.app_environment() to authenticated;

alter default privileges in schema public
  revoke all on tables from anon, authenticated;
alter default privileges in schema public
  revoke all on sequences from anon, authenticated;
alter default privileges in schema public
  revoke execute on functions from public, anon, authenticated;

commit;
