begin;

-- O envelope já está cifrado pela senha do titular. Guardá-lo no serviço
-- permite abrir o mesmo cofre em uma nova instalação sem transformar a chave
-- de recuperação no caminho normal de entrada.
create table public.password_key_envelopes (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  ciphertext text not null,
  iv text not null,
  aad text not null,
  salt text not null,
  kdf text not null default 'PBKDF2-SHA-256' check (kdf = 'PBKDF2-SHA-256'),
  iterations integer not null check (iterations >= 600000),
  key_version integer not null default 1 check (key_version > 0),
  updated_at timestamptz not null default now()
);

alter table public.password_key_envelopes enable row level security;

create policy password_envelopes_owner_all on public.password_key_envelopes
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- Não depender dos privilégios padrão do schema public: TRUNCATE, TRIGGER e
-- REFERENCES não são protegidos pela RLS e não pertencem ao navegador.
revoke all on public.password_key_envelopes from public, anon, authenticated;
grant select, insert, update, delete on public.password_key_envelopes to authenticated;

commit;
