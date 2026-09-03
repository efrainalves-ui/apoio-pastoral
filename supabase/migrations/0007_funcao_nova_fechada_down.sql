begin;

create or replace function public.app_schema_version()
returns integer
language sql
immutable
security invoker
set search_path = ''
as $$ select 6 $$;

drop event trigger if exists fechar_funcao_nova;
drop function if exists public.protecao_de_funcao_nova();
drop function if exists public.revogar_execute_publico_em_funcao_nova();

commit;
