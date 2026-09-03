begin;

create or replace function public.app_schema_version()
returns integer
language sql
immutable
security invoker
set search_path = ''
as $$ select 5 $$;

drop function if exists public.purge_record_history(uuid[]);

commit;
