begin;

-- ---------------------------------------------------------------------------
-- Notificações dos lembretes.
--
-- O conteúdo do lembrete continua só no cofre cifrado. O serviço guarda o
-- mínimo para entregar um aviso genérico ("Você tem um lembrete"):
--
--   * push_subscriptions: o endereço de entrega de cada aparelho, ligado à
--     conta e ao aparelho que o registrou;
--   * notification_schedule: quando avisar, com uma chave opaca calculada no
--     aparelho (HMAC com chave derivada do cofre), e o estado do envio.
--
-- Nenhuma coluna guarda título, observação, pessoa, igreja ou área.
--
-- Não muda app_schema_version: as duas tabelas são novas e nada do que já
-- existe depende delas. Uma build anterior continua falando com o banco.
-- ---------------------------------------------------------------------------

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid not null references public.devices(id) on delete cascade,
  endpoint text not null check (char_length(endpoint) between 12 and 1000 and endpoint like 'https://%'),
  p256dh text not null check (char_length(p256dh) between 40 and 200),
  auth_secret text not null check (char_length(auth_secret) between 16 and 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (device_id),
  unique (endpoint)
);

create table public.notification_schedule (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  occurrence_key text not null check (occurrence_key ~ '^[0-9a-f]{64}$'),
  fire_at timestamptz not null,
  state text not null default 'pending' check (state in ('pending', 'sending', 'sent', 'failed')),
  attempts smallint not null default 0 check (attempts between 0 and 10),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, occurrence_key)
);

create index notification_schedule_due on public.notification_schedule (state, fire_at);

alter table public.push_subscriptions enable row level security;
alter table public.notification_schedule enable row level security;

-- Cada conta enxerga só o que é seu, e só com sessão autorizada. Inscrever e
-- trocar a inscrição vale apenas para aparelho ativo da própria conta. A
-- conferência lê `devices`, que o cliente já alcança pela própria política, em
-- vez de chamar uma função que não é concedida a `authenticated`.
create policy push_subscriptions_owner_select on public.push_subscriptions
  for select using (auth.uid() = owner_id and public.session_is_authorized());
create policy push_subscriptions_device_insert on public.push_subscriptions
  for insert with check (auth.uid() = owner_id and public.session_is_authorized() and exists (select 1 from public.devices d where d.id = device_id and d.owner_id = auth.uid() and d.status = 'active'));
create policy push_subscriptions_device_update on public.push_subscriptions
  for update using (auth.uid() = owner_id and public.session_is_authorized() and exists (select 1 from public.devices d where d.id = device_id and d.owner_id = auth.uid() and d.status = 'active'))
  with check (auth.uid() = owner_id and exists (select 1 from public.devices d where d.id = device_id and d.owner_id = auth.uid() and d.status = 'active'));
-- Sair remove a inscrição; um aparelho revogado não remove a dos outros.
create policy push_subscriptions_owner_delete on public.push_subscriptions
  for delete using (auth.uid() = owner_id and public.session_is_authorized());

create policy notification_schedule_owner_select on public.notification_schedule
  for select using (auth.uid() = owner_id and public.session_is_authorized());
create policy notification_schedule_owner_insert on public.notification_schedule
  for insert with check (auth.uid() = owner_id and public.session_is_authorized() and state = 'pending' and attempts = 0 and sent_at is null);
-- O aparelho só mexe no que ainda não saiu: o estado do envio é do servidor.
create policy notification_schedule_pending_update on public.notification_schedule
  for update using (auth.uid() = owner_id and public.session_is_authorized() and state = 'pending')
  with check (auth.uid() = owner_id and state = 'pending');
create policy notification_schedule_pending_delete on public.notification_schedule
  for delete using (auth.uid() = owner_id and public.session_is_authorized() and state = 'pending');

revoke all on public.push_subscriptions, public.notification_schedule from public, anon, authenticated;

grant select, delete on public.push_subscriptions to authenticated;
grant insert (owner_id, device_id, endpoint, p256dh, auth_secret) on public.push_subscriptions to authenticated;
grant update (endpoint, p256dh, auth_secret, updated_at) on public.push_subscriptions to authenticated;

grant select, delete on public.notification_schedule to authenticated;
grant insert (owner_id, occurrence_key, fire_at) on public.notification_schedule to authenticated;
grant update (fire_at, updated_at) on public.notification_schedule to authenticated;

comment on table public.push_subscriptions is
  'Endereço de entrega de notificação por aparelho. Sem conteúdo de lembrete.';
comment on table public.notification_schedule is
  'Quando avisar, com chave opaca calculada no aparelho e estado do envio. O aviso enviado é sempre genérico.';

commit;
