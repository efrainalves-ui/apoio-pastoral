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
-- 2. Privilégio padrão, declarado só onde esta migration tem poder.
--
-- A entrada de privilégio padrão pertence ao papel que cria o objeto, então
-- ela precisa ser declarada por papel. A versão anterior perguntava se o papel
-- **existia** — e foi por isso que a homologação parou aqui.
--
-- No Supabase gerenciado o papel que aplica migrations é `postgres`, que não é
-- superusuário e não é membro de `supabase_admin`. `supabase_admin` existe, a
-- condição antiga dava verdadeiro, e o `alter default privileges for role
-- supabase_admin` era recusado com "permission denied to change default
-- privileges", abortando a migration inteira. Existir não é poder: quem
-- responde isso é `pg_has_role`.
--
-- O que fica coberto é o que importa na prática: o papel desta migration, que
-- no Supabase gerenciado é o mesmo papel do editor SQL do painel. Objeto criado
-- por `supabase_admin` — o provisionamento do próprio Supabase — está fora do
-- alcance de qualquer migration, e isso está dito por extenso em
-- `docs/SECURITY_MODEL.md`.
--
-- Isto é cinto e suspensório, não a garantia principal. Quem garante é a
-- conferência de `01_rls_isolation.sql` e a auditoria de
-- `public.protecao_de_funcao_nova()`, criada na 0007: nenhuma função de
-- `public` pode ficar ao alcance de PUBLIC ou de `anon`.
-- ---------------------------------------------------------------------------

do $$
declare
  papel text;
  cobertos text[] := '{}';
  ignorados text[] := '{}';
begin
  foreach papel in array array['postgres', 'supabase_admin', current_user]
  loop
    if not exists (select 1 from pg_roles where rolname = papel) then
      continue;
    end if;
    if not pg_has_role(current_user, papel, 'USAGE') then
      ignorados := ignorados || papel;
      continue;
    end if;
    execute format('alter default privileges for role %I in schema public revoke execute on functions from public', papel);
    execute format('alter default privileges for role %I in schema public revoke all on tables from anon, authenticated', papel);
    cobertos := cobertos || papel;
  end loop;

  -- O aviso é parte da prova: quem aplica precisa enxergar quais papéis
  -- ficaram de fora, em vez de supor que a proteção alcançou todos.
  raise notice 'privilegios padrao declarados para: %; fora do alcance desta migration: %',
    coalesce(array_to_string(cobertos, ', '), 'nenhum'),
    coalesce(nullif(array_to_string(ignorados, ', '), ''), 'nenhum');

  if cobertos = '{}' then
    raise exception 'a migration nao conseguiu declarar privilegios padrao para papel nenhum';
  end if;
end;
$$;

commit;
