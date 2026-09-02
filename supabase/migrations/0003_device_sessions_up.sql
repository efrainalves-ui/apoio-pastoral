begin;

-- ---------------------------------------------------------------------------
-- 1. Ordem de ingestão decidida pelo servidor.
--
-- Até aqui o cursor de download era `created_at`, um valor escrito pelo próprio
-- cliente. Um aparelho com o relógio adiantado empurrava o cursor dos outros
-- para o futuro, e um aparelho que ficou offline enviava operações com carimbo
-- antigo que ninguém mais baixava. Nos dois casos o pastor perdia dados sem
-- ver erro nenhum. A ordem passa a ser `seq`, atribuída aqui dentro.
-- ---------------------------------------------------------------------------

alter table public.encrypted_operations
  add column seq bigint generated always as identity,
  add column server_created_at timestamptz not null default now(),
  add column mac text,
  add column mac_version integer not null default 1 check (mac_version > 0);

create unique index encrypted_operations_seq_key on public.encrypted_operations(seq);
create index encrypted_operations_owner_seq_idx on public.encrypted_operations(owner_id, seq);

comment on column public.encrypted_operations.created_at is
  'Carimbo declarado pelo aparelho. Informativo: nunca ordena o download.';
comment on column public.encrypted_operations.seq is
  'Ordem de chegada atribuída pelo servidor. É o único cursor de download.';
comment on column public.encrypted_operations.mac is
  'Autenticação dos metadados da operação, verificada pelo aparelho que recebe.';

-- ---------------------------------------------------------------------------
-- 2. Sessão do serviço amarrada a um aparelho.
--
-- O JWT do Supabase traz `session_id`. Amarrar sessão e aparelho é o que
-- impede um cliente de simplesmente afirmar ser outro aparelho: o servidor
-- deixa de acreditar no `device_id` enviado no corpo da requisição e passa a
-- descobri-lo pela sessão autenticada.
-- ---------------------------------------------------------------------------

create table public.device_sessions (
  session_id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid not null references public.devices(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index device_sessions_device_idx on public.device_sessions(device_id);

-- Sessão de aparelho revogado. Apagar a linha em auth.sessions derruba a
-- renovação, mas o token de acesso que o aparelho já tem na memória continua
-- válido até expirar. Esta lista fecha essa janela: a sessão revogada não
-- reivindica aparelho nenhum, nem com identificador novo.
create table public.revoked_sessions (
  session_id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid not null,
  revoked_at timestamptz not null default now()
);

alter table public.devices add column approved_by uuid references public.devices(id);

-- ---------------------------------------------------------------------------
-- 3. Identidade da sessão e do aparelho de quem chama.
-- ---------------------------------------------------------------------------

create function public.current_session_id()
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select nullif(current_setting('request.jwt.claims', true)::json ->> 'session_id', '')::uuid;
$$;

create function public.current_device_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.device_id
  from public.device_sessions s
  where s.session_id = public.current_session_id()
    and s.owner_id = auth.uid();
$$;

-- Aparelho da sessão que só devolve valor quando ele está ativo. Toda operação
-- de sincronização passa por aqui: a autorização deixa de ser um campo que o
-- cliente escreve e vira uma consulta do servidor.
create function public.active_device_id()
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

-- ---------------------------------------------------------------------------
-- 4. Registro do aparelho e vínculo com a sessão.
--
-- Entrar com e-mail e senha em um aparelho novo funciona: a senha é a prova, e
-- o aparelho nasce ativo. O que não funciona é contornar uma revogação — a
-- sessão do aparelho revogado não reivindica nem o mesmo identificador nem um
-- novo, então voltar exige provar a senha outra vez, do zero.
-- ---------------------------------------------------------------------------

create function public.claim_device(p_device_id uuid, p_label text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  conta uuid := auth.uid();
  sessao uuid := public.current_session_id();
  atual public.devices%rowtype;
  ja_ligado uuid;
  situacao text;
begin
  if conta is null then
    raise exception 'sessao nao autenticada';
  end if;
  if sessao is null then
    raise exception 'sessao sem identificacao';
  end if;
  if p_device_id is null or p_label is null or char_length(p_label) not between 1 and 80 then
    raise exception 'dados de aparelho invalidos';
  end if;

  if exists (select 1 from public.revoked_sessions r where r.session_id = sessao) then
    raise exception 'sessao revogada';
  end if;

  select * into atual from public.devices d where d.id = p_device_id;

  if found then
    if atual.owner_id <> conta then
      raise exception 'este aparelho pertence a outra conta';
    end if;
    if atual.status = 'revoked' then
      raise exception 'aparelho revogado';
    end if;
    situacao := atual.status;
    update public.devices set last_seen_at = now() where id = p_device_id;
  else
    situacao := 'active';
    insert into public.devices (id, owner_id, label, status, created_at, last_seen_at)
      values (p_device_id, conta, p_label, situacao, now(), now());
  end if;

  select s.device_id into ja_ligado from public.device_sessions s where s.session_id = sessao;
  if ja_ligado is not null and ja_ligado <> p_device_id then
    raise exception 'esta sessao ja pertence a outro aparelho';
  end if;

  insert into public.device_sessions (session_id, owner_id, device_id)
    values (sessao, conta, p_device_id)
  on conflict (session_id) do update set last_seen_at = now();

  return situacao;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Confirmação e revogação.
--
-- Quem confirma é sempre outro aparelho já ativo, descoberto pela sessão. Um
-- aparelho pendente não confirma a si mesmo nem passando o próprio id.
-- ---------------------------------------------------------------------------

create function public.approve_device(p_device_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  conta uuid := auth.uid();
  autor uuid := public.active_device_id();
  alterados integer;
begin
  if autor = p_device_id then
    raise exception 'um aparelho nao confirma a si mesmo';
  end if;
  update public.devices
    set status = 'active', approved_by = autor, last_seen_at = now()
    where id = p_device_id and owner_id = conta and status = 'pending';
  get diagnostics alterados = row_count;
  if alterados = 0 then
    raise exception 'nenhum aparelho pendente com esse identificador nesta conta';
  end if;
end;
$$;

-- Revogar derruba também as sessões daquele aparelho: sem o vínculo, o token
-- que ele ainda tiver na memória não fala por aparelho nenhum, e o refresh
-- deixa de renovar. O que já foi baixado continua no aparelho — isso nenhuma
-- revogação alcança, e está documentado assim para o pastor.
create function public.revoke_device(p_device_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  conta uuid := auth.uid();
  autor uuid := public.active_device_id();
  alterados integer;
begin
  update public.devices
    set status = 'revoked', revoked_at = now()
    where id = p_device_id and owner_id = conta and status <> 'revoked';
  get diagnostics alterados = row_count;
  if alterados = 0 then
    raise exception 'nenhum aparelho ativo com esse identificador nesta conta';
  end if;

  delete from public.device_key_envelopes e where e.device_id = p_device_id and e.owner_id = conta;

  insert into public.revoked_sessions (session_id, owner_id, device_id)
    select s.session_id, conta, p_device_id from public.device_sessions s
    where s.device_id = p_device_id and s.owner_id = conta
  on conflict (session_id) do nothing;

  if to_regclass('auth.refresh_tokens') is not null then
    execute 'delete from auth.refresh_tokens t where t.session_id in (select s.session_id from public.device_sessions s where s.device_id = $1 and s.owner_id = $2)'
      using p_device_id, conta;
  end if;
  if to_regclass('auth.sessions') is not null then
    execute 'delete from auth.sessions x where x.id in (select s.session_id from public.device_sessions s where s.device_id = $1 and s.owner_id = $2)'
      using p_device_id, conta;
  end if;

  delete from public.device_sessions s where s.device_id = p_device_id and s.owner_id = conta;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Envio e recebimento pelas funções, nunca pela tabela.
-- ---------------------------------------------------------------------------

create function public.upload_operations(p_ops jsonb)
returns setof uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  conta uuid := auth.uid();
  dispositivo uuid := public.active_device_id();
begin
  if jsonb_typeof(p_ops) <> 'array' then
    raise exception 'lote invalido';
  end if;
  if jsonb_array_length(p_ops) > 200 then
    raise exception 'lote grande demais';
  end if;

  return query
  insert into public.encrypted_operations
    (id, owner_id, device_id, record_id, operation, base_version, record_version,
     schema_version, ciphertext, iv, aad, key_version, mac, mac_version, created_at, server_created_at)
  select
    (op ->> 'id')::uuid,
    conta,
    dispositivo,
    (op ->> 'record_id')::uuid,
    op ->> 'operation',
    (op ->> 'base_version')::integer,
    (op ->> 'record_version')::integer,
    (op ->> 'schema_version')::integer,
    op ->> 'ciphertext',
    op ->> 'iv',
    op ->> 'aad',
    coalesce((op ->> 'key_version')::integer, 1),
    op ->> 'mac',
    coalesce((op ->> 'mac_version')::integer, 1),
    coalesce((op ->> 'created_at')::timestamptz, now()),
    now()
  from jsonb_array_elements(p_ops) as op
  on conflict (id) do nothing
  returning id;
end;
$$;

create function public.download_operations(p_after bigint, p_limit integer)
returns table (
  seq bigint,
  id uuid,
  owner_id uuid,
  device_id uuid,
  record_id uuid,
  operation text,
  base_version integer,
  record_version integer,
  schema_version integer,
  ciphertext text,
  iv text,
  aad text,
  key_version integer,
  mac text,
  mac_version integer,
  created_at timestamptz,
  server_created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  conta uuid := auth.uid();
begin
  perform public.active_device_id();
  return query
  select o.seq, o.id, o.owner_id, o.device_id, o.record_id, o.operation, o.base_version,
         o.record_version, o.schema_version, o.ciphertext, o.iv, o.aad, o.key_version,
         o.mac, o.mac_version, o.created_at, o.server_created_at
  from public.encrypted_operations o
  where o.owner_id = conta and o.seq > coalesce(p_after, 0)
  order by o.seq
  limit least(coalesce(p_limit, 200), 500);
end;
$$;

-- Versão do esquema, para o aplicativo recusar um ambiente desatualizado.
create function public.app_schema_version()
returns integer
language sql
immutable
security invoker
set search_path = ''
as $$ select 3 $$;

-- ---------------------------------------------------------------------------
-- 7. Privilégios: as tabelas de sincronização saem do alcance direto.
-- ---------------------------------------------------------------------------

alter table public.device_sessions enable row level security;
create policy device_sessions_owner_select on public.device_sessions
  for select using (auth.uid() = owner_id);

alter table public.revoked_sessions enable row level security;
create policy revoked_sessions_owner_select on public.revoked_sessions
  for select using (auth.uid() = owner_id);

revoke all on public.device_sessions, public.revoked_sessions from public, anon, authenticated;
grant select on public.device_sessions, public.revoked_sessions to authenticated;

-- `devices` continua legível para a tela de Segurança listar os aparelhos, mas
-- criar e alterar linha passou a ser exclusividade das funções acima.
revoke insert, update on public.devices from public, anon, authenticated;

-- Enviar e receber operações agora é só pelas funções: assim o servidor decide
-- o dispositivo, a ordem e o carimbo, e nada disso vem do corpo da requisição.
revoke all on public.encrypted_operations from public, anon, authenticated;

revoke all on function public.current_session_id(), public.current_device_id(),
  public.active_device_id(), public.claim_device(uuid, text), public.approve_device(uuid),
  public.revoke_device(uuid), public.upload_operations(jsonb),
  public.download_operations(bigint, integer), public.app_schema_version()
  from public, anon;

grant execute on function public.claim_device(uuid, text), public.approve_device(uuid),
  public.revoke_device(uuid), public.upload_operations(jsonb),
  public.download_operations(bigint, integer), public.app_schema_version()
  to authenticated;

-- Privilégios padrão do Supabase valem para toda tabela futura de public.
-- Revogá-los aqui evita depender de o próximo `create table` lembrar disso.
alter default privileges in schema public
  revoke truncate, references, trigger on tables from anon, authenticated;
alter default privileges in schema public
  revoke execute on functions from public, anon;

commit;
