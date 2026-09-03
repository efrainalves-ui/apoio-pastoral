begin;

-- ---------------------------------------------------------------------------
-- 1. Conferir o ambiente antes de enviar e-mail e senha.
--
-- A trava de ambiente existia, mas só depois de autenticar: as funções que
-- dizem qual é o esquema e qual é o ambiente só respondiam a quem já tinha
-- entrado. Uma build apontada para o projeto errado, então, mandava e-mail e
-- senha para o serviço errado e só descobria o engano depois — com a
-- credencial do titular já entregue a um projeto que não era o dela.
--
-- As duas funções passam a responder também a quem ainda não entrou. Nenhuma
-- das duas revela nada: uma devolve um número de versão fixo, a outra a
-- palavra `homologacao` ou `producao`, que é justamente o que a build precisa
-- comparar antes de confiar a senha a alguém.
-- ---------------------------------------------------------------------------

grant execute on function public.app_schema_version(), public.app_environment() to anon;

create or replace function public.app_schema_version()
returns integer
language sql
immutable
security invoker
set search_path = ''
as $$ select 5 $$;

-- ---------------------------------------------------------------------------
-- 2. Privilégio padrão de função, dito de novo e de forma explícita.
--
-- A prova no CI mostrou que a forma sem `for role` não impediu o EXECUTE que o
-- PostgreSQL concede a PUBLIC em função nova. A entrada de privilégio padrão
-- pertence ao papel que cria o objeto, então ela é declarada aqui para cada
-- papel que de fato cria função neste projeto — o dono da migration e, no
-- Supabase, o papel administrativo do painel.
--
-- Isto é cinto e suspensório, não a garantia principal. Quem garante é a
-- conferência de `01_rls_isolation.sql`: nenhuma função de `public` pode ficar
-- ao alcance de PUBLIC ou de `anon`, e é ela que reprova quando alguém cria
-- uma função e esquece o `revoke`.
-- ---------------------------------------------------------------------------

do $$
declare
  papel text;
begin
  foreach papel in array array['postgres', 'supabase_admin', current_user]
  loop
    if exists (select 1 from pg_roles where rolname = papel) then
      execute format('alter default privileges for role %I in schema public revoke execute on functions from public', papel);
      execute format('alter default privileges for role %I in schema public revoke all on tables from anon, authenticated', papel);
    end if;
  end loop;
end;
$$;

commit;
