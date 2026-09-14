-- Prova que inscrições e horários de aviso ficam presos à conta dona: uma conta
-- não lê, não altera e não apaga os da outra, e o aparelho não escreve o estado
-- de envio. Roda depois de 01, 02 e 03, no mesmo Postgres descartável.
--
-- Nenhuma credencial, nenhum dado real: contas example.invalid, endereço de
-- entrega e chaves inventados. Contas, aparelhos e sessões próprios: os da 03
-- terminam revogados, e reaproveitá-los faria esta prova falhar pelo motivo errado.

\set ON_ERROR_STOP on

\set conta_e '''71717171-0000-4000-8000-000000000071'''
\set conta_f '''72727272-0000-4000-8000-000000000072'''
\set disp_e '''71d00000-0000-4000-8000-000000000071'''
\set disp_f '''72d00000-0000-4000-8000-000000000072'''
\set chave_e '''aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'''

reset role;

insert into auth.users (id, email) values
  (:conta_e, 'conta.lembrete.e@example.invalid'),
  (:conta_f, 'conta.lembrete.f@example.invalid')
on conflict (id) do nothing;

set role authenticated;

-- ---------------------------------------------------------------------------
-- 1. Cada conta registra o próprio aparelho e a própria inscrição.
-- ---------------------------------------------------------------------------

set request.jwt.claims = '{"sub":"72727272-0000-4000-8000-000000000072","session_id":"72a00000-0000-4000-8000-000000000072"}';
select homologacao_testes.exigir(public.claim_device(:disp_f, 'Celular Fictício F') = 'active', 'F: aparelho ativo');
insert into public.push_subscriptions (owner_id, device_id, endpoint, p256dh, auth_secret)
values (:conta_f, :disp_f, 'https://push.example.invalid/f', repeat('f', 87), repeat('f', 22));
insert into public.notification_schedule (owner_id, occurrence_key, fire_at)
values (:conta_f, repeat('b', 64), now() + interval '1 day');

set request.jwt.claims = '{"sub":"71717171-0000-4000-8000-000000000071","session_id":"71a00000-0000-4000-8000-000000000071"}';
select homologacao_testes.exigir(public.claim_device(:disp_e, 'Celular Fictício E') = 'active', 'E: aparelho ativo');
insert into public.push_subscriptions (owner_id, device_id, endpoint, p256dh, auth_secret)
values (:conta_e, :disp_e, 'https://push.example.invalid/e', repeat('e', 87), repeat('e', 22));
select homologacao_testes.exigir((select count(*) from public.push_subscriptions) = 1, 'E enxerga só a própria inscrição');

insert into public.notification_schedule (owner_id, occurrence_key, fire_at)
values (:conta_e, :chave_e, now() + interval '1 hour');
select homologacao_testes.exigir((select count(*) from public.notification_schedule) = 1, 'E enxerga só os próprios horários');

-- ---------------------------------------------------------------------------
-- 2. Barreiras entre contas e contra o aparelho mexer no envio.
-- ---------------------------------------------------------------------------

select homologacao_testes.exigir_recusa(
  format($cmd$insert into public.push_subscriptions (owner_id, device_id, endpoint, p256dh, auth_secret) values (%L, %L, 'https://push.example.invalid/x', repeat('x', 87), repeat('x', 22))$cmd$, :conta_f, :disp_f),
  'E não inscreve um aparelho em nome de F');

select homologacao_testes.exigir_recusa(
  format($cmd$insert into public.push_subscriptions (owner_id, device_id, endpoint, p256dh, auth_secret) values (%L, %L, 'https://push.example.invalid/y', repeat('y', 87), repeat('y', 22))$cmd$, :conta_e, :disp_f),
  'E não inscreve o aparelho de F na própria conta');

select homologacao_testes.exigir_recusa(
  format($cmd$insert into public.notification_schedule (owner_id, occurrence_key, fire_at) values (%L, repeat('c', 64), now())$cmd$, :conta_f),
  'E não agenda aviso na conta de F');

select homologacao_testes.exigir_recusa(
  format($cmd$insert into public.notification_schedule (owner_id, occurrence_key, fire_at) values (%L, %L, now())$cmd$, :conta_e, :chave_e),
  'a mesma ocorrência não é agendada duas vezes');

select homologacao_testes.exigir_recusa(
  $cmd$update public.notification_schedule set state = 'sent'$cmd$,
  'o aparelho não escreve o estado de envio');

select homologacao_testes.exigir_recusa(
  format($cmd$insert into public.notification_schedule (owner_id, occurrence_key, fire_at) values (%L, 'titulo do lembrete', now())$cmd$, :conta_e),
  'a chave da ocorrência não aceita texto legível');

update public.notification_schedule set fire_at = now() + interval '2 days' where owner_id = :conta_f;
delete from public.notification_schedule where owner_id = :conta_f;
delete from public.push_subscriptions where owner_id = :conta_f;

reset role;
select homologacao_testes.exigir(
  (select count(*) from public.notification_schedule where owner_id = :conta_f and fire_at < now() + interval '36 hours') = 1,
  'E não altera nem apaga os horários de F');
select homologacao_testes.exigir(
  (select count(*) from public.push_subscriptions where owner_id = :conta_f) = 1,
  'E não apaga a inscrição de F');

set role anon;
select homologacao_testes.exigir_recusa('select count(*) from public.push_subscriptions', 'anon não lê inscrições');
select homologacao_testes.exigir_recusa('select count(*) from public.notification_schedule', 'anon não lê horários');

-- ---------------------------------------------------------------------------
-- 3. Sair remove a própria inscrição.
-- ---------------------------------------------------------------------------

set role authenticated;
set request.jwt.claims = '{"sub":"71717171-0000-4000-8000-000000000071","session_id":"71a00000-0000-4000-8000-000000000071"}';
delete from public.push_subscriptions where device_id = :disp_e;
select homologacao_testes.exigir((select count(*) from public.push_subscriptions) = 0, 'E remove a própria inscrição ao sair');

reset role;
