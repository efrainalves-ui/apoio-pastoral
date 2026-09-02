begin;

alter default privileges in schema public
  grant truncate, references, trigger on tables to anon, authenticated;
alter default privileges in schema public
  grant execute on functions to public;

drop function if exists public.app_schema_version();
drop function if exists public.download_operations(bigint, integer);
drop function if exists public.upload_operations(jsonb);
drop function if exists public.revoke_device(uuid);
drop function if exists public.approve_device(uuid);
drop function if exists public.active_device_id();
drop function if exists public.current_device_id();
drop function if exists public.claim_device(uuid, text);
drop function if exists public.current_session_id();

drop table if exists public.revoked_sessions;
drop table if exists public.device_sessions;

alter table public.devices drop column if exists approved_by;

drop index if exists public.encrypted_operations_owner_seq_idx;
drop index if exists public.encrypted_operations_seq_key;
alter table public.encrypted_operations
  drop column if exists mac_version,
  drop column if exists mac,
  drop column if exists server_created_at,
  drop column if exists seq;

grant select, insert on public.encrypted_operations to authenticated;
grant insert, update on public.devices to authenticated;

commit;
