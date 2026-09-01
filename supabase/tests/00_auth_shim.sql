-- Reproduz localmente, sem Supabase, a parte do ambiente Supabase de que a
-- migration depende: os papéis anon/authenticated/service_role, a tabela
-- auth.users e a função auth.uid().
--
-- Existe apenas para provar as políticas de RLS num Postgres descartável do CI.
-- Nunca é aplicado no projeto Supabase de homologação: lá o próprio Supabase
-- fornece esse ambiente.

begin;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end;
$$;

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key,
  email text not null unique
);

-- Mesma leitura de identidade usada pelo Supabase: o "sub" do JWT da sessão.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claims', true)::json ->> 'sub', '')::uuid;
$$;

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;

-- O Supabase concede privilégios padrão em toda tabela nova de public. Sem
-- reproduzir isso aqui, o teste de isolamento não teria como perceber que a
-- migration precisa revogá-los: no Postgres cru a tabela nasceria sem nada, e
-- um TRUNCATE ao alcance de authenticated passaria despercebido até a nuvem.
-- MAINTAIN fica de fora porque só existe a partir do PostgreSQL 17.
alter default privileges in schema public
  grant truncate, references, trigger on tables to anon, authenticated, service_role;

commit;
