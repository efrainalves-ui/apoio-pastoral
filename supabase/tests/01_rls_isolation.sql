-- Prova, num Postgres descartável, que duas contas fictícias não alcançam os
-- dados uma da outra. Roda sobre o shim de auth e a migration já aplicada.
--
-- Não usa credencial, não fala com Supabase e não contém dado real: as duas
-- contas são endereços example.invalid e o conteúdo cifrado é inventado.

\set ON_ERROR_STOP on

\set conta_a '''aaaaaaaa-0000-4000-8000-000000000001'''
\set conta_b '''bbbbbbbb-0000-4000-8000-000000000002'''
\set disp_a  '''a0000000-0000-4000-8000-00000000000a'''
\set disp_b  '''b0000000-0000-4000-8000-00000000000b'''

create schema if not exists homologacao_testes;
grant usage on schema homologacao_testes to public;

-- Falha a suíte inteira quando a condição esperada não se confirma.
create or replace function homologacao_testes.exigir(condicao boolean, descricao text)
returns void
language plpgsql
as $$
begin
  if condicao is not true then
    raise exception 'FALHOU: %', descricao;
  end if;
  raise notice 'ok: %', descricao;
end;
$$;

-- Falha a suíte quando um comando que deveria ser recusado é aceito.
-- Erros de escrita do próprio teste (sintaxe, tabela ou coluna inexistente)
-- são repropagados: eles não são uma recusa do banco.
create or replace function homologacao_testes.exigir_recusa(comando text, descricao text)
returns void
language plpgsql
as $$
begin
  execute comando;
  raise exception 'FALHOU: % — o comando foi aceito e deveria ter sido recusado', descricao;
exception
  when others then
    if sqlstate in ('42601', '42P01', '42703', '42883', '42P02') then
      raise;
    end if;
    if sqlerrm like 'FALHOU:%' then
      raise;
    end if;
    raise notice 'ok (recusado, SQLSTATE %): %', sqlstate, descricao;
end;
$$;

-- ---------------------------------------------------------------------------
-- Duas contas fictícias e um dispositivo fictício para cada uma.
-- ---------------------------------------------------------------------------

insert into auth.users (id, email) values
  (:conta_a, 'conta.a.ficticia@example.invalid'),
  (:conta_b, 'conta.b.ficticia@example.invalid')
on conflict (id) do nothing;

-- Conta A monta os próprios registros.
set role authenticated;
set request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-000000000001"}';

insert into public.devices (id, owner_id, label, status)
  values (:disp_a, :conta_a, 'Computador Fictício A', 'active');
insert into public.device_key_envelopes (owner_id, device_id, ciphertext, iv, aad)
  values (:conta_a, :disp_a, 'cifra-ficticia-a', 'iv-a', 'aad-a');
insert into public.recovery_key_envelopes (owner_id, ciphertext, iv, aad, salt)
  values (:conta_a, 'cifra-recuperacao-a', 'iv-a', 'aad-a', 'sal-a');
insert into public.encrypted_operations
  (id, owner_id, device_id, record_id, operation, base_version, record_version, schema_version, ciphertext, iv, aad)
  values ('a1000000-0000-4000-8000-00000000000a', :conta_a, :disp_a,
          'a2000000-0000-4000-8000-00000000000a', 'upsert', 0, 1, 1, 'cifra-operacao-a', 'iv-a', 'aad-a');

-- Conta B monta os seus.
set request.jwt.claims = '{"sub":"bbbbbbbb-0000-4000-8000-000000000002"}';

insert into public.devices (id, owner_id, label, status)
  values (:disp_b, :conta_b, 'Celular Fictício B', 'active');
insert into public.device_key_envelopes (owner_id, device_id, ciphertext, iv, aad)
  values (:conta_b, :disp_b, 'cifra-ficticia-b', 'iv-b', 'aad-b');

-- ---------------------------------------------------------------------------
-- Controle positivo: sem ele, um "zero linhas" em toda parte passaria à toa.
-- ---------------------------------------------------------------------------

select homologacao_testes.exigir(
  (select count(*) from public.devices) = 1,
  'B enxerga o próprio dispositivo');
select homologacao_testes.exigir(
  (select count(*) from public.device_key_envelopes) = 1,
  'B enxerga o próprio envelope de dispositivo');

-- ---------------------------------------------------------------------------
-- 1. Leitura: B não lê nada da conta A.
-- ---------------------------------------------------------------------------

select homologacao_testes.exigir(
  (select count(*) from public.devices where owner_id = :conta_a) = 0,
  'B não lê dispositivos de A');
select homologacao_testes.exigir(
  (select count(*) from public.device_key_envelopes where owner_id = :conta_a) = 0,
  'B não lê envelopes de dispositivo de A');
select homologacao_testes.exigir(
  (select count(*) from public.recovery_key_envelopes) = 0,
  'B não lê o envelope de recuperação de A, logo não restaura o cofre de A');
select homologacao_testes.exigir(
  (select count(*) from public.encrypted_operations) = 0,
  'B não recebe operações cifradas de A ao sincronizar');

-- ---------------------------------------------------------------------------
-- 2. Alteração: B não altera nem apaga o que é de A.
-- ---------------------------------------------------------------------------

with tentativa as (
  update public.devices set label = 'sequestrado por B'
  where id = :disp_a
  returning 1
)
select homologacao_testes.exigir(
  count(*) = 0,
  'update de B não alcança nenhuma linha de A') from tentativa;

select homologacao_testes.exigir_recusa(
  format($cmd$insert into public.devices (id, owner_id, label, status)
               values ('c0000000-0000-4000-8000-00000000000c', %L, 'Forjado por B', 'active')$cmd$, :conta_a),
  'B não cria dispositivo em nome de A');

select homologacao_testes.exigir_recusa(
  format($cmd$insert into public.recovery_key_envelopes (owner_id, ciphertext, iv, aad, salt)
               values (%L, 'x', 'x', 'x', 'x')$cmd$, :conta_a),
  'B não substitui o envelope de recuperação de A');

select homologacao_testes.exigir_recusa(
  $cmd$delete from public.encrypted_operations$cmd$,
  'nenhuma conta apaga operações cifradas');
select homologacao_testes.exigir_recusa(
  $cmd$update public.encrypted_operations set ciphertext = 'reescrito'$cmd$,
  'nenhuma conta reescreve operações cifradas');

-- ---------------------------------------------------------------------------
-- 3. Vínculo de dispositivo: B não pendura nada no dispositivo de A.
-- ---------------------------------------------------------------------------

select homologacao_testes.exigir_recusa(
  format($cmd$insert into public.device_key_envelopes (owner_id, device_id, ciphertext, iv, aad)
               values (%L, %L, 'x', 'x', 'x')$cmd$, :conta_b, :disp_a),
  'B não vincula chave ao dispositivo de A');

select homologacao_testes.exigir_recusa(
  format($cmd$insert into public.device_key_envelopes (owner_id, device_id, ciphertext, iv, aad)
               values (%L, %L, 'x', 'x', 'x')$cmd$, :conta_a, :disp_a),
  'B não cria envelope em nome de A nem para o dispositivo de A');

-- ---------------------------------------------------------------------------
-- 4. Sincronização: B não injeta operação na conta A.
-- ---------------------------------------------------------------------------

select homologacao_testes.exigir_recusa(
  format($cmd$insert into public.encrypted_operations
               (id, owner_id, device_id, record_id, operation, base_version, record_version, schema_version, ciphertext, iv, aad)
               values ('b1000000-0000-4000-8000-00000000000b', %L, %L,
                       'b2000000-0000-4000-8000-00000000000b', 'upsert', 0, 1, 1, 'x', 'x', 'x')$cmd$,
         :conta_a, :disp_a),
  'B não grava operação na conta de A');

select homologacao_testes.exigir_recusa(
  format($cmd$insert into public.encrypted_operations
               (id, owner_id, device_id, record_id, operation, base_version, record_version, schema_version, ciphertext, iv, aad)
               values ('b3000000-0000-4000-8000-00000000000b', %L, %L,
                       'b4000000-0000-4000-8000-00000000000b', 'upsert', 0, 1, 1, 'x', 'x', 'x')$cmd$,
         :conta_b, :disp_a),
  'B não sincroniza usando o dispositivo de A');

-- ---------------------------------------------------------------------------
-- 5. O dispositivo revogado da própria conta A não volta a funcionar.
-- ---------------------------------------------------------------------------

set request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-000000000001"}';

with revogacao as (
  update public.devices set status = 'revoked', revoked_at = now()
  where id = :disp_a
  returning 1
)
select homologacao_testes.exigir(
  count(*) = 1,
  'A consegue revogar o próprio dispositivo') from revogacao;

select homologacao_testes.exigir_recusa(
  format($cmd$update public.devices set status = 'active' where id = %L$cmd$, :disp_a),
  'dispositivo revogado não é reativado');

select homologacao_testes.exigir_recusa(
  format($cmd$delete from public.devices where id = %L$cmd$, :disp_a),
  'dispositivo revogado não é apagado e recriado para contornar a revogação');

select homologacao_testes.exigir_recusa(
  format($cmd$insert into public.encrypted_operations
               (id, owner_id, device_id, record_id, operation, base_version, record_version, schema_version, ciphertext, iv, aad)
               values ('a3000000-0000-4000-8000-00000000000a', %L, %L,
                       'a4000000-0000-4000-8000-00000000000a', 'upsert', 1, 2, 1, 'x', 'x', 'x')$cmd$,
         :conta_a, :disp_a),
  'dispositivo revogado não sincroniza mais');

select homologacao_testes.exigir_recusa(
  format($cmd$insert into public.device_key_envelopes (owner_id, device_id, ciphertext, iv, aad)
               values (%L, %L, 'x', 'x', 'x')$cmd$, :conta_a, :disp_a),
  'dispositivo revogado não recebe nova chave');

-- A RLS separa contas, não aparelhos: o dispositivo revogado continua usando a
-- sessão da própria conta, então o banco ainda entrega a ele as operações
-- cifradas já gravadas. Bloquear o recebimento é responsabilidade do
-- aplicativo, em assertRemoteDeviceStillActive. Esta asserção fixa o limite
-- real do banco para que ninguém remova aquela trava supondo que a RLS cobre
-- também o recebimento.
select homologacao_testes.exigir(
  (select count(*) from public.encrypted_operations where owner_id = :conta_a) = 1,
  'a RLS barra o envio do dispositivo revogado, mas o recebimento é barrado pelo aplicativo');

-- ---------------------------------------------------------------------------
-- 6. Visitante anônimo não alcança nenhuma tabela.
-- ---------------------------------------------------------------------------

set request.jwt.claims = '{}';
reset role;
set role anon;

select homologacao_testes.exigir_recusa(
  $cmd$select * from public.devices$cmd$, 'anônimo não lê dispositivos');
select homologacao_testes.exigir_recusa(
  $cmd$select * from public.device_key_envelopes$cmd$, 'anônimo não lê envelopes de dispositivo');
select homologacao_testes.exigir_recusa(
  $cmd$select * from public.recovery_key_envelopes$cmd$, 'anônimo não lê envelopes de recuperação');
select homologacao_testes.exigir_recusa(
  $cmd$select * from public.encrypted_operations$cmd$, 'anônimo não lê operações cifradas');

reset role;

-- ---------------------------------------------------------------------------
-- 7. Verificações estruturais: valem também para qualquer tabela futura.
-- ---------------------------------------------------------------------------

select homologacao_testes.exigir(
  not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity is false),
  'toda tabela exposta em public tem RLS habilitada');

select homologacao_testes.exigir(
  not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and not exists (select 1 from pg_policy p where p.polrelid = c.oid)),
  'toda tabela exposta em public tem ao menos uma política');

select homologacao_testes.exigir(
  not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    cross join lateral aclexplode(c.relacl) as a
    join pg_roles r on r.oid = a.grantee
    where n.nspname = 'public' and c.relkind = 'r' and r.rolname = 'anon'),
  'anon não tem nenhum privilégio em public');

\echo 'Isolamento entre contas ficticias comprovado.'
