-- Prova que as barreiras de aparelho vivem no servidor, e não na boa vontade
-- do aplicativo: autoaprovação, contorno com identificador novo, sessão que se
-- passa por outro aparelho, ordem de chegada e recebimento de aparelho
-- revogado. Roda depois de 01, no mesmo Postgres descartável.
--
-- Nenhuma credencial, nenhum dado real: contas example.invalid e cifra
-- inventada.

\set ON_ERROR_STOP on

\set conta_c '''cccccccc-0000-4000-8000-000000000003'''
\set conta_d '''dddddddd-0000-4000-8000-000000000004'''
\set disp_c1 '''c1000000-0000-4000-8000-00000000000c'''
\set disp_c2 '''c2000000-0000-4000-8000-00000000000c'''
\set disp_c3 '''c3000000-0000-4000-8000-00000000000c'''
\set disp_d1 '''d1000000-0000-4000-8000-00000000000d'''

reset role;

insert into auth.users (id, email) values
  (:conta_c, 'conta.c.ficticia@example.invalid'),
  (:conta_d, 'conta.d.ficticia@example.invalid')
on conflict (id) do nothing;

set role authenticated;

-- ---------------------------------------------------------------------------
-- 1. Entrar com a senha em um aparelho novo funciona; o servidor é quem diz.
-- ---------------------------------------------------------------------------

set request.jwt.claims = '{"sub":"cccccccc-0000-4000-8000-000000000003","session_id":"c1a00000-0000-4000-8000-00000000000c"}';
select homologacao_testes.exigir(
  public.claim_device(:disp_c1, 'Computador Fictício C') = 'active',
  'C: o primeiro aparelho nasce ativo');

set request.jwt.claims = '{"sub":"cccccccc-0000-4000-8000-000000000003","session_id":"c2a00000-0000-4000-8000-00000000000c"}';
select homologacao_testes.exigir(
  public.claim_device(:disp_c2, 'Celular Fictício C') = 'active',
  'entrar com a senha em um segundo aparelho funciona sem depender do primeiro');

-- ---------------------------------------------------------------------------
-- 2. Uma sessão não se passa por outro aparelho.
-- ---------------------------------------------------------------------------

select homologacao_testes.exigir_recusa(
  format($cmd$select public.claim_device(%L, 'Computador Fictício C')$cmd$, :disp_c1),
  'uma sessão já ligada a um aparelho não passa a valer por outro');

-- ---------------------------------------------------------------------------
-- 3. Sem autoaprovação: quem confirma um aparelho pendente é outro, ativo.
--
-- Nenhum caminho normal cria aparelho pendente hoje, mas a barreira precisa
-- valer de qualquer forma: um dia pode existir, e quem contorna não avisa.
-- ---------------------------------------------------------------------------

reset role;
insert into public.devices (id, owner_id, label, status)
  values ('c5000000-0000-4000-8000-00000000000c', :conta_c, 'Aparelho Pendente Fictício', 'pending');
set role authenticated;

set request.jwt.claims = '{"sub":"cccccccc-0000-4000-8000-000000000003","session_id":"c5a00000-0000-4000-8000-00000000000c"}';
select homologacao_testes.exigir(
  public.claim_device('c5000000-0000-4000-8000-00000000000c', 'Aparelho Pendente Fictício') = 'pending',
  'aparelho pendente continua pendente ao ligar a sessão');
select homologacao_testes.exigir_recusa(
  $cmd$select public.approve_device('c5000000-0000-4000-8000-00000000000c')$cmd$,
  'aparelho pendente não confirma a si mesmo');
select homologacao_testes.exigir_recusa(
  $cmd$select public.upload_operations(jsonb_build_array(jsonb_build_object(
    'id', 'c9000000-0000-4000-8000-00000000000c',
    'record_id', 'c8000000-0000-4000-8000-00000000000c',
    'operation', 'upsert', 'base_version', 0, 'record_version', 1, 'schema_version', 1,
    'ciphertext', 'x', 'iv', 'x', 'aad', 'x')))$cmd$,
  'aparelho pendente não envia');
select homologacao_testes.exigir_recusa(
  $cmd$select * from public.download_operations(0, 500)$cmd$,
  'aparelho pendente não recebe');

set request.jwt.claims = '{"sub":"cccccccc-0000-4000-8000-000000000003","session_id":"c1a00000-0000-4000-8000-00000000000c"}';
select public.approve_device('c5000000-0000-4000-8000-00000000000c');
select homologacao_testes.exigir(
  (select status from public.devices where id = 'c5000000-0000-4000-8000-00000000000c') = 'active',
  'aparelho ativo confirma o pendente');
select homologacao_testes.exigir(
  (select approved_by from public.devices where id = 'c5000000-0000-4000-8000-00000000000c') = :disp_c1,
  'fica registrado qual aparelho confirmou');
select homologacao_testes.exigir_recusa(
  $cmd$select public.approve_device('c5000000-0000-4000-8000-00000000000c')$cmd$,
  'confirmar de novo um aparelho que já está ativo é recusado');
select homologacao_testes.exigir_recusa(
  format($cmd$select public.approve_device(%L)$cmd$, :disp_c1),
  'um aparelho não confirma a si mesmo nem estando ativo');

-- ---------------------------------------------------------------------------
-- 5. Ordem de chegada é do servidor, não do relógio do aparelho.
-- ---------------------------------------------------------------------------

select public.upload_operations(jsonb_build_array(
  jsonb_build_object('id', 'c0100000-0000-4000-8000-00000000000c', 'record_id', 'c0a00000-0000-4000-8000-00000000000c',
    'operation', 'upsert', 'base_version', 0, 'record_version', 1, 'schema_version', 1,
    'ciphertext', 'primeira', 'iv', 'x', 'aad', 'x', 'created_at', '2999-01-01T00:00:00Z'),
  jsonb_build_object('id', 'c0200000-0000-4000-8000-00000000000c', 'record_id', 'c0b00000-0000-4000-8000-00000000000c',
    'operation', 'upsert', 'base_version', 0, 'record_version', 1, 'schema_version', 1,
    'ciphertext', 'segunda', 'iv', 'x', 'aad', 'x', 'created_at', '2000-01-01T00:00:00Z')));

select homologacao_testes.exigir(
  (select array_agg(ciphertext order by seq) from public.download_operations(0, 500))
    = array['primeira', 'segunda'],
  'a ordem de entrega segue a chegada no servidor, não o carimbo do aparelho');

select homologacao_testes.exigir(
  (select count(*) from public.download_operations(
     (select max(seq) from public.download_operations(0, 500)), 500)) = 0,
  'o cursor do servidor não deixa operação para trás nem repete');

-- Um aparelho que ficou offline manda depois, com carimbo antigo: quem já
-- passou daquele ponto ainda recebe, porque a ordem é a da chegada.
drop table if exists cursor_c;
create temp table cursor_c as select max(seq) as seq from public.download_operations(0, 500);

select public.upload_operations(jsonb_build_array(
  jsonb_build_object('id', 'c0300000-0000-4000-8000-00000000000c', 'record_id', 'c0c00000-0000-4000-8000-00000000000c',
    'operation', 'upsert', 'base_version', 0, 'record_version', 1, 'schema_version', 1,
    'ciphertext', 'atrasada', 'iv', 'x', 'aad', 'x', 'created_at', '2001-01-01T00:00:00Z')));

select homologacao_testes.exigir(
  (select count(*) from public.download_operations((select seq from cursor_c), 500)) = 1,
  'operação enviada com atraso ainda chega a quem já tinha sincronizado');

-- ---------------------------------------------------------------------------
-- 6. Reenvio do mesmo lote não duplica nada.
-- ---------------------------------------------------------------------------

select public.upload_operations(jsonb_build_array(
  jsonb_build_object('id', 'c0100000-0000-4000-8000-00000000000c', 'record_id', 'c0a00000-0000-4000-8000-00000000000c',
    'operation', 'upsert', 'base_version', 0, 'record_version', 1, 'schema_version', 1,
    'ciphertext', 'reescrita', 'iv', 'x', 'aad', 'x')));

select homologacao_testes.exigir(
  (select count(*) from public.download_operations(0, 500)) = 3,
  'reenviar o mesmo identificador não cria linha nova');
select homologacao_testes.exigir(
  (select ciphertext from public.download_operations(0, 500) where id = 'c0100000-0000-4000-8000-00000000000c') = 'primeira',
  'reenvio não reescreve o conteúdo cifrado já gravado');

-- ---------------------------------------------------------------------------
-- 7. Contorno com identificador novo depois da revogação.
-- ---------------------------------------------------------------------------

set request.jwt.claims = '{"sub":"cccccccc-0000-4000-8000-000000000003","session_id":"c2a00000-0000-4000-8000-00000000000c"}';
select public.revoke_device(:disp_c1);

set request.jwt.claims = '{"sub":"cccccccc-0000-4000-8000-000000000003","session_id":"c1a00000-0000-4000-8000-00000000000c"}';
select homologacao_testes.exigir_recusa(
  $cmd$select * from public.download_operations(0, 500)$cmd$,
  'a sessão do aparelho revogado perde o vínculo e não recebe mais');
select homologacao_testes.exigir_recusa(
  format($cmd$select public.claim_device(%L, 'Computador Fictício C')$cmd$, :disp_c1),
  'o aparelho revogado não recupera o vínculo');

-- O contorno óbvio: a mesma sessão gera outro identificador de aparelho. É
-- exatamente o que a lista de sessões revogadas existe para barrar. Voltar
-- exige provar a senha de novo, o que cria outra sessão.
select homologacao_testes.exigir_recusa(
  format($cmd$select public.claim_device(%L, 'Computador Fictício C de novo')$cmd$, :disp_c3),
  'a sessão revogada não contorna a revogação com um identificador novo');
select homologacao_testes.exigir(
  (select count(*) from public.devices where id = :disp_c3) = 0,
  'o aparelho contornado nem chega a ser criado');

-- ---------------------------------------------------------------------------
-- 8. Revogação apaga o envelope e o vínculo de sessão do aparelho.
-- ---------------------------------------------------------------------------

reset role;
select homologacao_testes.exigir(
  (select count(*) from public.device_sessions where device_id = :disp_c1) = 0,
  'revogar apaga o vínculo entre a sessão e o aparelho');
select homologacao_testes.exigir(
  (select count(*) from public.device_key_envelopes where device_id = :disp_c1) = 0,
  'revogar apaga o envelope de chave daquele aparelho');
set role authenticated;

-- ---------------------------------------------------------------------------
-- 9. Conta D não alcança nada da conta C por nenhuma das funções.
-- ---------------------------------------------------------------------------

set request.jwt.claims = '{"sub":"dddddddd-0000-4000-8000-000000000004","session_id":"d1a00000-0000-4000-8000-00000000000d"}';
select homologacao_testes.exigir(
  public.claim_device(:disp_d1, 'Computador Fictício D') = 'active',
  'D registra o próprio aparelho');
select homologacao_testes.exigir(
  (select count(*) from public.download_operations(0, 500)) = 0,
  'D não recebe nenhuma operação de C');
select homologacao_testes.exigir_recusa(
  format($cmd$select public.claim_device(%L, 'Sequestro')$cmd$, :disp_c2),
  'D não assume o aparelho de C');
select homologacao_testes.exigir_recusa(
  format($cmd$select public.revoke_device(%L)$cmd$, :disp_c2),
  'D não revoga o aparelho de C');
-- As duas tabelas de sessão saíram do alcance direto do cliente na migration
-- 0009. Antes, a política deixava o dono ler as próprias linhas, e este teste
-- conferia a contagem: o problema é que um aparelho revogado, com o token
-- ainda vivo, lia por HTTP quantos aparelhos a conta tinha, quais foram
-- derrubados e quando. Agora nem o dono lê — só as funções `security definer`.
select homologacao_testes.exigir_recusa(
  $cmd$select count(*) from public.device_sessions$cmd$,
  'D não alcança a tabela de sessões de aparelho');
select homologacao_testes.exigir_recusa(
  $cmd$select count(*) from public.revoked_sessions$cmd$,
  'D não alcança a tabela de sessões revogadas');

-- ---------------------------------------------------------------------------
-- 10. Limites do lote e da página.
-- ---------------------------------------------------------------------------

select homologacao_testes.exigir_recusa(
  $cmd$select public.upload_operations('{"nao":"e uma lista"}'::jsonb)$cmd$,
  'lote que não é lista é recusado');

select homologacao_testes.exigir(
  (select count(*) from public.download_operations(0, 100000)) = 0,
  'pedido de página gigante é aceito, mas o servidor decide o teto');

reset role;
set request.jwt.claims = '{}';

\echo 'Barreiras de aparelho comprovadas no servidor.'

-- ---------------------------------------------------------------------------
-- 11. Encerrar distrito: o próprio aparelho revoga tudo, inclusive a si mesmo,
--     e segue com uma autorização nova. A sessão que revoga não é barrada.
-- ---------------------------------------------------------------------------

set role authenticated;
set request.jwt.claims = '{"sub":"dddddddd-0000-4000-8000-000000000004","session_id":"d1a00000-0000-4000-8000-00000000000d"}';

select public.revoke_device(:disp_d1);
select homologacao_testes.exigir(
  (select status from public.devices where id = :disp_d1) = 'revoked',
  'D revoga o próprio aparelho ao encerrar o distrito');
select homologacao_testes.exigir(
  public.claim_device('d2000000-0000-4000-8000-00000000000d', 'Computador Fictício D novo') = 'active',
  'a mesma sessão registra a autorização nova depois de encerrar');
select homologacao_testes.exigir(
  (select count(*) from public.download_operations(0, 500)) = 0,
  'a autorização nova funciona e a conta está vazia');

reset role;
set request.jwt.claims = '{}';
