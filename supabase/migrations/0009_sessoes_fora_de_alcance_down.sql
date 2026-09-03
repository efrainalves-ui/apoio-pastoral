begin;

-- Volta ao estado da 0003/0004: leitura direta liberada e política sem a
-- conferência de sessão revogada. Só faz sentido para desfazer uma aplicação
-- errada — a proteção que ela remove é a que a 0009 existe para dar.

drop policy device_sessions_owner_select on public.device_sessions;
create policy device_sessions_owner_select on public.device_sessions
  for select using (auth.uid() = owner_id);

drop policy revoked_sessions_owner_select on public.revoked_sessions;
create policy revoked_sessions_owner_select on public.revoked_sessions
  for select using (auth.uid() = owner_id);

grant select on public.device_sessions, public.revoked_sessions to authenticated;

comment on table public.device_sessions is null;
comment on table public.revoked_sessions is null;

create or replace function public.app_schema_version()
returns integer
language sql
immutable
security invoker
set search_path = ''
as $$ select 8 $$;

commit;
