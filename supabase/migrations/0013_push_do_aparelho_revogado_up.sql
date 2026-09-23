begin;

-- ---------------------------------------------------------------------------
-- 0013 — Revogar um aparelho cala também as notificações dele.
--
-- A revogação derrubava a sessão e o recebimento das operações cifradas, mas
-- deixava a inscrição de push de pé. `push_subscriptions` só é apagada em
-- cascata quando a linha de `devices` some, e revogar não apaga a linha:
-- marca `status = 'revoked'`. Resultado: o aparelho que o pastor tirou da
-- conta continuava recebendo "Você tem um lembrete" — e, com o cofre ainda
-- aberto na memória, até o título.
--
-- Pior, a função de envio roda como `service_role`, que passa por cima da RLS:
-- as políticas de 0010 exigem aparelho ativo para inscrever, mas não têm voz
-- nenhuma sobre o que o servidor lê na hora de entregar.
--
-- Aqui:
--   1. `revoke_device` e `revoke_all_devices` apagam a inscrição do aparelho
--      revogado, junto com o envelope de chave e as sessões;
--   2. `lembretes_push_inscricoes_ativas` é por onde a função de envio passa a
--      ler — ela devolve só inscrição de aparelho ativo, e é a única porta que
--      o servidor tem para essa tabela;
--   3. `lembretes_push_disponivel` diz ao aplicativo se este banco tem as
--      tabelas e funções das notificações, para uma build nova contra um banco
--      antigo não oferecer um recurso que não existe.
--
-- Limpa também as inscrições que ficaram para trás de revogações anteriores.
--
-- Não muda app_schema_version: nenhuma build existente depende do que mudou
-- aqui, e a anterior continua falando com este banco.
-- ---------------------------------------------------------------------------

-- 1. A revogação leva a inscrição junto -------------------------------------

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
  -- Sem esta linha, o aparelho revogado continuava sendo avisado.
  delete from public.push_subscriptions p where p.device_id = p_device_id and p.owner_id = conta;

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
    delete from public.push_subscriptions p where p.device_id = alvo and p.owner_id = conta;

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

comment on function public.revoke_device(uuid) is
  'Revoga um aparelho da conta e leva junto o envelope de chave, as sessões e a inscrição de notificação.';
comment on function public.revoke_all_devices() is
  'Revoga todos os aparelhos ativos da conta e devolve quantos foram. Repetir é seguro e devolve zero.';

-- Rastro das revogações feitas antes desta migration.
delete from public.push_subscriptions p
  using public.devices d
  where d.id = p.device_id and d.status <> 'active';

-- 2. A porta do servidor para as inscrições ---------------------------------

-- A função de envio roda como `service_role` e passa por cima da RLS. Em vez
-- de confiar que ela se lembre de filtrar, o filtro passa a ser a única porta:
-- o privilégio direto em `push_subscriptions` é devolvido, e o servidor só
-- enxerga inscrição de aparelho ativo.
create or replace function public.lembretes_push_inscricoes_ativas(p_owner_id uuid, p_device_id uuid default null)
returns table (id uuid, endpoint text, p256dh text, auth_secret text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.endpoint, p.p256dh, p.auth_secret
    from public.push_subscriptions p
    join public.devices d on d.id = p.device_id
   where p.owner_id = p_owner_id
     and d.owner_id = p_owner_id
     and d.status = 'active'
     and (p_device_id is null or p.device_id = p_device_id);
$$;

-- Apagar a inscrição que o serviço de push recusou (404/410) continua sendo do
-- servidor, e só isso: por id, dentro da própria conta.
create or replace function public.lembretes_push_esquecer_inscricao(p_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_subscriptions p where p.id = p_id;
$$;

revoke all on function public.lembretes_push_inscricoes_ativas(uuid, uuid) from public, anon, authenticated;
revoke all on function public.lembretes_push_esquecer_inscricao(uuid) from public, anon, authenticated;
grant execute on function public.lembretes_push_inscricoes_ativas(uuid, uuid) to service_role;
grant execute on function public.lembretes_push_esquecer_inscricao(uuid) to service_role;

-- O servidor não fala mais direto com a tabela: a porta é a função acima.
revoke select, delete on public.push_subscriptions from service_role;

comment on function public.lembretes_push_inscricoes_ativas(uuid, uuid) is
  'Inscrições de notificação de aparelhos ATIVOS da conta. Única leitura dessa tabela pelo servidor: aparelho revogado não é avisado.';

-- 3. O aplicativo confere se este banco tem notificações --------------------

-- Uma build nova contra um banco sem estas migrations oferecia "Ativar
-- notificações" e falhava na hora de gravar, sem dizer por quê. Agora o
-- aplicativo pergunta antes; a ausência da própria função já é a resposta.
create or replace function public.lembretes_push_disponivel()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select to_regclass('public.push_subscriptions') is not null
     and to_regclass('public.notification_schedule') is not null
     and to_regprocedure('public.lembretes_push_inscricoes_ativas(uuid, uuid)') is not null;
$$;

revoke all on function public.lembretes_push_disponivel() from public, anon;
grant execute on function public.lembretes_push_disponivel() to authenticated, service_role;

comment on function public.lembretes_push_disponivel() is
  'Diz se este banco tem as tabelas e funções das notificações. O aplicativo não oferece o recurso sem isto.';

commit;
