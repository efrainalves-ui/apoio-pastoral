begin;

-- A mesma regra da subida: desfaz só onde a migration tinha poder para fazer.
do $$
declare
  papel text;
begin
  foreach papel in array array['postgres', 'supabase_admin', current_user]
  loop
    if exists (select 1 from pg_roles where rolname = papel)
       and pg_has_role(current_user, papel, 'USAGE') then
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
