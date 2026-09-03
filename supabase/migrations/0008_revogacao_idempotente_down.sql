begin;

create or replace function public.app_schema_version()
returns integer
language sql
immutable
security invoker
set search_path = ''
as $$ select 7 $$;

create or replace function public.revoke_all_devices()
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

commit;
