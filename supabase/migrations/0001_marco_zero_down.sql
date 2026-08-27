begin;

drop table if exists public.encrypted_operations;
drop table if exists public.recovery_key_envelopes;
drop table if exists public.device_key_envelopes;
drop table if exists public.devices;
drop function if exists public.prevent_revoked_device_reactivation();

commit;
