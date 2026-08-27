begin;

create table public.devices (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 80),
  status text not null check (status in ('pending', 'active', 'revoked')),
  public_key jsonb,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz,
  revoked_at timestamptz
);

create table public.device_key_envelopes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid not null references public.devices(id) on delete cascade,
  ciphertext text not null,
  iv text not null,
  aad text not null,
  key_version integer not null default 1 check (key_version > 0),
  created_at timestamptz not null default now(),
  unique (owner_id, device_id, key_version)
);

create table public.recovery_key_envelopes (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  ciphertext text not null,
  iv text not null,
  aad text not null,
  salt text not null,
  kdf text not null default 'HKDF-SHA-256' check (kdf = 'HKDF-SHA-256'),
  key_version integer not null default 1 check (key_version > 0),
  updated_at timestamptz not null default now()
);

create table public.encrypted_operations (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid not null references public.devices(id),
  record_id uuid not null,
  operation text not null check (operation in ('upsert', 'delete')),
  base_version integer not null check (base_version >= 0),
  record_version integer not null check (record_version > 0),
  schema_version integer not null check (schema_version > 0),
  ciphertext text not null,
  iv text not null,
  aad text not null,
  key_version integer not null default 1 check (key_version > 0),
  created_at timestamptz not null default now()
);

create index encrypted_operations_owner_created_idx
  on public.encrypted_operations(owner_id, created_at, id);

create function public.prevent_revoked_device_reactivation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.status = 'revoked' and new.status <> 'revoked' then
    raise exception 'revoked devices cannot be reactivated';
  end if;
  return new;
end;
$$;

create trigger devices_prevent_reactivation
before update on public.devices
for each row execute function public.prevent_revoked_device_reactivation();

alter table public.devices enable row level security;
alter table public.device_key_envelopes enable row level security;
alter table public.recovery_key_envelopes enable row level security;
alter table public.encrypted_operations enable row level security;

create policy devices_owner_select on public.devices
  for select using (auth.uid() = owner_id);
create policy devices_owner_insert on public.devices
  for insert with check (auth.uid() = owner_id);
create policy devices_owner_update on public.devices
  for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
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
create policy recovery_envelopes_owner_all on public.recovery_key_envelopes
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy encrypted_operations_owner_select on public.encrypted_operations
  for select using (auth.uid() = owner_id);
create policy encrypted_operations_active_device_insert on public.encrypted_operations
  for insert with check (
    auth.uid() = owner_id
    and exists (
      select 1 from public.devices d
      where d.id = device_id and d.owner_id = auth.uid() and d.status = 'active'
    )
  );

revoke all on public.devices, public.device_key_envelopes, public.recovery_key_envelopes, public.encrypted_operations from anon;
grant select, insert, update on public.devices to authenticated;
grant select, insert, update, delete on public.device_key_envelopes, public.recovery_key_envelopes to authenticated;
grant select, insert on public.encrypted_operations to authenticated;

commit;
