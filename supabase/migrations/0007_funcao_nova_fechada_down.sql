begin;

create or replace function public.app_schema_version()
returns integer
language sql
immutable
security invoker
set search_path = ''
as $$ select 6 $$;

drop function if exists public.protecao_de_funcao_nova();
drop function if exists public.funcoes_publicas_abertas();

commit;
