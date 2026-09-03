begin;

-- Devolve os privilégios padrão ao estado que a migration 0003 deixou.
alter default privileges in schema public
  grant all on tables to anon, authenticated;
alter default privileges in schema public
  grant all on sequences to anon, authenticated;
alter default privileges in schema public
  grant execute on functions to public;
alter default privileges in schema public
  revoke truncate, references, trigger on tables from anon, authenticated;
alter default privileges in schema public
  revoke execute on functions from public, anon;

grant execute on function public.prevent_revoked_device_reactivation() to public;

create or replace function public.app_schema_version()
returns integer
language sql
immutable
security invoker
set search_path = ''
as $$ select 3 $$;

drop function if exists public.app_environment();
drop table if exists public.service_environment;
drop function if exists public.revoke_all_devices();

drop policy if exists password_envelopes_owner_all on public.password_key_envelopes;
create policy password_envelopes_owner_all on public.password_key_envelopes
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists recovery_envelopes_owner_all on public.recovery_key_envelopes;
create policy recovery_envelopes_owner_all on public.recovery_key_envelopes
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists device_envelopes_owner_all on public.device_key_envelopes;
create policy device_envelopes_owner_all on public.device_key_envelopes
  for all
  using (
    auth.uid() = owner_id
    and exists (
      select 1 from public.devices d
      where d.id = device_id and d.owner_id = auth.uid()
    )
  )
  with check (
    auth.uid() = owner_id
    and exists (
      select 1 from public.devices d
      where d.id = device_id and d.owner_id = auth.uid() and d.status = 'active'
    )
  );

drop policy if exists devices_owner_select on public.devices;
create policy devices_owner_select on public.devices
  for select using (auth.uid() = owner_id);

create or replace function public.active_device_id()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  dispositivo uuid;
  situacao text;
begin
  if auth.uid() is null then
    raise exception 'sessao nao autenticada';
  end if;
  dispositivo := public.current_device_id();
  if dispositivo is null then
    raise exception 'esta sessao ainda nao esta ligada a um aparelho autorizado';
  end if;
  select d.status into situacao from public.devices d
    where d.id = dispositivo and d.owner_id = auth.uid();
  if situacao is distinct from 'active' then
    raise exception 'aparelho sem autorizacao ativa';
  end if;
  return dispositivo;
end;
$$;

drop function if exists public.session_is_authorized();
drop function if exists public.session_is_not_revoked();

commit;
