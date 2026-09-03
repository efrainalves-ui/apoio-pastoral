begin;

-- ---------------------------------------------------------------------------
-- Revogar todos os aparelhos passa a ser idempotente.
--
-- A versão anterior começava por `active_device_id()`, e isso a tornava
-- irrepetível justamente quando repetir era necessário. Depois de um
-- encerramento interrompido, o aparelho que chamou já está revogado e sem
-- vínculo de sessão: a segunda chamada levantava exceção, e quem chamava não
-- tinha como distinguir "já foi revogado" de "a rede caiu". As duas coisas
-- chegavam como o mesmo erro, e a retomada tinha de adivinhar.
--
-- Agora a função exige apenas uma sessão que não foi revogada, revoga o que
-- ainda estiver ativo e devolve quantos foram. Zero significa "não havia nada
-- para revogar", que é uma resposta — e uma exceção volta a significar o que
-- deveria significar sempre: alguma coisa deu errado de verdade.
-- ---------------------------------------------------------------------------

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

  -- O aparelho de quem chama fica por último: revogá-lo antes tiraria, no meio
  -- do caminho, a autorização de que os outros passos dependem.
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

comment on function public.revoke_all_devices() is
  'Revoga todos os aparelhos ativos da conta e devolve quantos foram. Repetir é seguro e devolve zero: é assim que quem chama distingue "já feito" de falha.';

create or replace function public.app_schema_version()
returns integer
language sql
immutable
security invoker
set search_path = ''
as $$ select 8 $$;

commit;
