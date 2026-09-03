begin;

do $$
declare
  papel text;
begin
  foreach papel in array array['postgres', 'supabase_admin', current_user]
  loop
    if exists (select 1 from pg_roles where rolname = papel) then
      execute format('alter default privileges for role %I in schema public grant execute on functions to public', papel);
      execute format('alter default privileges for role %I in schema public grant all on tables to anon, authenticated', papel);
    end if;
  end loop;
end;
$$;

create or replace function public.app_schema_version()
returns integer
language sql
immutable
security invoker
set search_path = ''
as $$ select 4 $$;

revoke execute on function public.app_schema_version(), public.app_environment() from anon;

commit;
