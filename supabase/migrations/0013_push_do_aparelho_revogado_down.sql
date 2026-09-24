-- Reverte 0013: a revogação volta a deixar a inscrição de notificação de pé,
-- e o servidor volta a falar direto com `push_subscriptions`.
--
-- As inscrições apagadas aqui não voltam: quem foi revogado precisa ativar as
-- notificações outra vez, o que é o comportamento certo de qualquer forma.

begin;

drop function if exists public.lembretes_push_disponivel();
drop function if exists public.lembretes_push_esquecer_inscricao(uuid);
drop function if exists public.lembretes_push_inscricoes_ativas(uuid, uuid);

-- O que 0012 concedia e 0013 tirou.
grant select, delete on public.push_subscriptions to service_role;

-- Volta às versões de 0003 e 0008, sem a linha das inscrições.
create or replace function public.revoke_device(p_device_id uuid)
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
  perform autor;
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
      and s.session_id is distinct from public.current_session_id()
  on conflict (session_id) do nothing;

  if to_regclass('auth.refresh_tokens') is not null then
    execute 'delete from auth.refresh_tokens t where t.session_id in (select s.session_id from public.device_sessions s where s.device_id = $1 and s.owner_id = $2 and s.session_id is distinct from $3)'
      using p_device_id, conta, public.current_session_id();
  end if;
  if to_regclass('auth.sessions') is not null then
    execute 'delete from auth.sessions x where x.id in (select s.session_id from public.device_sessions s where s.device_id = $1 and s.owner_id = $2 and s.session_id is distinct from $3)'
      using p_device_id, conta, public.current_session_id();
  end if;

  delete from public.device_sessions s where s.device_id = p_device_id and s.owner_id = conta;
end;
$$;

create or replace function public.revoke_all_devices()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  conta uuid := auth.uid();
  sessao uuid := public.current_session_id();
  atual uuid;
  alvo uuid;
  total integer := 0;
begin
  if conta is null then
    raise exception 'sessao nao autenticada';
  end if;
  if not public.session_is_not_revoked() then
    raise exception 'sessao revogada';
  end if;

  atual := public.current_device_id();

  for alvo in
    select d.id from public.devices d
    where d.owner_id = conta and d.status <> 'revoked'
    order by (d.id is not distinct from atual), d.id
  loop
    update public.devices set status = 'revoked', revoked_at = now()
      where id = alvo and owner_id = conta;

    delete from public.device_key_envelopes e where e.device_id = alvo and e.owner_id = conta;

    insert into public.revoked_sessions (session_id, owner_id, device_id)
      select s.session_id, conta, alvo from public.device_sessions s
      where s.device_id = alvo and s.owner_id = conta
        and s.session_id is distinct from sessao
    on conflict (session_id) do nothing;

    if to_regclass('auth.refresh_tokens') is not null then
      execute 'delete from auth.refresh_tokens t where t.session_id in (select s.session_id from public.device_sessions s where s.device_id = $1 and s.owner_id = $2 and s.session_id is distinct from $3)'
        using alvo, conta, sessao;
    end if;
    if to_regclass('auth.sessions') is not null then
      execute 'delete from auth.sessions x where x.id in (select s.session_id from public.device_sessions s where s.device_id = $1 and s.owner_id = $2 and s.session_id is distinct from $3)'
        using alvo, conta, sessao;
    end if;

    delete from public.device_sessions s where s.device_id = alvo and s.owner_id = conta;
    total := total + 1;
  end loop;

  return total;
end;
$$;

commit;
