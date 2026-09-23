-- Prova que revogar um aparelho cala também as notificações dele, e que o
-- servidor não tem como avisar um aparelho revogado nem por engano.
--
-- Roda depois de 01 a 05, no mesmo Postgres descartável. Nenhuma credencial e
-- nenhum dado real: contas example.invalid, endereços de entrega e chaves
-- inventados, contas e aparelhos próprios desta prova.

\set ON_ERROR_STOP on

\set conta_g '''73737373-0000-4000-8000-000000000073'''
\set disp_g1 '''73d10000-0000-4000-8000-000000000073'''
\set disp_g2 '''73d20000-0000-4000-8000-000000000073'''

reset role;

insert into auth.users (id, email) values (:conta_g, 'conta.revogacao.g@example.invalid')
on conflict (id) do nothing;

set role authenticated;

-- ---------------------------------------------------------------------------
-- 1. Dois aparelhos da mesma conta, cada um com sua inscrição.
-- ---------------------------------------------------------------------------

set request.jwt.claims = '{"sub":"73737373-0000-4000-8000-000000000073","session_id":"73a10000-0000-4000-8000-000000000073"}';
select homologacao_testes.exigir(public.claim_device(:disp_g1, 'Celular Fictício G1') = 'active', 'G1: aparelho ativo');
insert into public.push_subscriptions (owner_id, device_id, endpoint, p256dh, auth_secret)
values (:conta_g, :disp_g1, 'https://push.example.invalid/g1', repeat('1', 87), repeat('1', 22));

-- O segundo aparelho da mesma conta nasce pendente e é confirmado pelo primeiro.
set request.jwt.claims = '{"sub":"73737373-0000-4000-8000-000000000073","session_id":"73a20000-0000-4000-8000-000000000073"}';
select homologacao_testes.exigir(public.claim_device(:disp_g2, 'Celular Fictício G2') = 'pending', 'G2: aparelho pendente');

set request.jwt.claims = '{"sub":"73737373-0000-4000-8000-000000000073","session_id":"73a10000-0000-4000-8000-000000000073"}';
select public.approve_device(:disp_g2);

set request.jwt.claims = '{"sub":"73737373-0000-4000-8000-000000000073","session_id":"73a20000-0000-4000-8000-000000000073"}';
insert into public.push_subscriptions (owner_id, device_id, endpoint, p256dh, auth_secret)
values (:conta_g, :disp_g2, 'https://push.example.invalid/g2', repeat('2', 87), repeat('2', 22));

select homologacao_testes.exigir((select count(*) from public.push_subscriptions where owner_id = :conta_g) = 2,
  'G: as duas inscrições estão registradas');

-- ---------------------------------------------------------------------------
-- 2. O servidor só enxerga inscrição de aparelho ativo.
-- ---------------------------------------------------------------------------

reset role;
set role service_role;
select homologacao_testes.exigir(
  (select count(*) from public.lembretes_push_inscricoes_ativas(:conta_g)) = 2,
  'servidor: dois aparelhos ativos para avisar');

-- O privilégio direto na tabela foi devolvido: a função é a única porta.
select homologacao_testes.exigir_recusa(
  'select count(*) from public.push_subscriptions',
  'servidor não lê a tabela de inscrições direto');

-- ---------------------------------------------------------------------------
-- 3. Revogar G2 pelo G1 apaga a inscrição de G2, e só a dele.
-- ---------------------------------------------------------------------------

reset role;
set role authenticated;
set request.jwt.claims = '{"sub":"73737373-0000-4000-8000-000000000073","session_id":"73a10000-0000-4000-8000-000000000073"}';
select public.revoke_device(:disp_g2);

select homologacao_testes.exigir(
  (select count(*) from public.push_subscriptions where device_id = :disp_g2) = 0,
  'revogar apaga a inscrição do aparelho revogado');
select homologacao_testes.exigir(
  (select count(*) from public.push_subscriptions where device_id = :disp_g1) = 1,
  'revogar não toca na inscrição do aparelho que continua ativo');

reset role;
set role service_role;
select homologacao_testes.exigir(
  (select count(*) from public.lembretes_push_inscricoes_ativas(:conta_g)) = 1,
  'servidor: o aparelho revogado não está mais na lista de avisos');

-- ---------------------------------------------------------------------------
-- 4. Mesmo que uma inscrição sobre de uma revogação antiga, o servidor não a vê.
-- ---------------------------------------------------------------------------

reset role;
insert into public.push_subscriptions (owner_id, device_id, endpoint, p256dh, auth_secret)
values (:conta_g, :disp_g2, 'https://push.example.invalid/g2-resto', repeat('3', 87), repeat('3', 22));

set role service_role;
select homologacao_testes.exigir(
  (select count(*) from public.lembretes_push_inscricoes_ativas(:conta_g)) = 1,
  'servidor: inscrição órfã de aparelho revogado continua fora da lista');
select homologacao_testes.exigir(
  (select count(*) from public.lembretes_push_inscricoes_ativas(:conta_g, :disp_g2)) = 0,
  'servidor: nem pedindo o aparelho revogado pelo nome');

-- ---------------------------------------------------------------------------
-- 5. Revogar tudo não deixa inscrição nenhuma de pé.
-- ---------------------------------------------------------------------------

reset role;
set role authenticated;
set request.jwt.claims = '{"sub":"73737373-0000-4000-8000-000000000073","session_id":"73a10000-0000-4000-8000-000000000073"}';
select public.revoke_all_devices();

reset role;
select homologacao_testes.exigir(
  (select count(*) from public.push_subscriptions where owner_id = :conta_g and device_id = :disp_g1) = 0,
  'revogar todos apaga também a inscrição do aparelho que chamou');

-- ---------------------------------------------------------------------------
-- 6. O aplicativo consegue perguntar se este banco tem notificações.
-- ---------------------------------------------------------------------------

set role authenticated;
set request.jwt.claims = '{"sub":"73737373-0000-4000-8000-000000000073","session_id":"73a10000-0000-4000-8000-000000000073"}';
select homologacao_testes.exigir(public.lembretes_push_disponivel(), 'o banco declara que tem notificações');

reset role;
