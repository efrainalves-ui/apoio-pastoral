-- Reproduz localmente, sem Supabase, a parte do ambiente Supabase de que a
-- migration depende: os papéis anon/authenticated/service_role, a tabela
-- auth.users, a função auth.uid() — e, desde a homologação que parou na 0005,
-- **as fronteiras de permissão do Supabase gerenciado**.
--
-- Essa última parte é a que faltava, e custou uma rodada de homologação. O CI
-- aplicava as migrations como superusuário; a nuvem as aplica como `postgres`,
-- que não é superusuário e não é membro de `supabase_admin`. Tudo que exigia
-- superusuário passava aqui e era recusado lá: `alter default privileges for
-- role supabase_admin` e `create event trigger`. Um teste que roda com mais
-- poder do que a produção não está testando a produção.
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

-- ---------------------------------------------------------------------------
-- As fronteiras de permissão do Supabase gerenciado.
--
--   `supabase_admin`  — superusuário da plataforma. Existe, e o papel das
--                       migrations **não é membro dele**. É essa combinação
--                       exata que derrubou a 0005 na nuvem.
--   `apoio_migracao`  — o papel que aplica as migrations e roda as provas.
--                       Sem superusuário, sem herança, do tamanho do
--                       `postgres` de um projeto Supabase.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'supabase_admin') then
    create role supabase_admin superuser nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'apoio_migracao') then
    create role apoio_migracao login noinherit nosuperuser nocreatedb nocreaterole;
  end if;
end;
$$;

-- O papel das migrations troca para anon/authenticated nas provas de RLS, como
-- o PostgREST faz. `noinherit` obriga o `set role` explícito: sem isso, um
-- privilégio herdado mascararia justamente a recusa que a prova quer ver.
grant anon, authenticated, service_role to apoio_migracao;

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

-- O que o `postgres` de um projeto Supabase tem, e nada além disso.
grant usage, create on schema public to apoio_migracao;
grant usage on schema auth to apoio_migracao;
grant select, insert, update, delete, references on auth.users to apoio_migracao;
do $$
begin
  -- As provas criam o schema `homologacao_testes` com seus próprios auxiliares.
  execute format('grant create on database %I to apoio_migracao', current_database());
end;
$$;

-- O Supabase concede privilégios padrão em toda tabela nova de public. Sem
-- reproduzir isso aqui, o teste de isolamento não teria como perceber que a
-- migration precisa revogá-los: no Postgres cru a tabela nasceria sem nada, e
-- um TRUNCATE ao alcance de authenticated passaria despercebido até a nuvem.
-- MAINTAIN fica de fora porque só existe a partir do PostgreSQL 17.
--
-- `for role apoio_migracao` não é detalhe: privilégio padrão vale para os
-- objetos criados por um papel específico. Declarado sem `for role`, ele valia
-- para o superusuário que roda este arquivo e não alcançava nenhuma tabela das
-- migrations — a prova ficava verde sem provar nada.
alter default privileges for role apoio_migracao in schema public
  grant truncate, references, trigger on tables to anon, authenticated, service_role;

commit;
