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
\set sessao_a '''a5000000-0000-4000-8000-00000000000a'''
\set sessao_b '''b5000000-0000-4000-8000-00000000000b'''

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
set request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","session_id":"a5000000-0000-4000-8000-00000000000a"}';

-- O aparelho entra pela função: `devices` não aceita mais escrita direta.
select homologacao_testes.exigir(
  public.claim_device(:disp_a, 'Computador Fictício A') = 'active',
  'o primeiro aparelho de uma conta nasce ativo');
insert into public.device_key_envelopes (owner_id, device_id, ciphertext, iv, aad)
  values (:conta_a, :disp_a, 'cifra-ficticia-a', 'iv-a', 'aad-a');
insert into public.recovery_key_envelopes (owner_id, ciphertext, iv, aad, salt)
  values (:conta_a, 'cifra-recuperacao-a', 'iv-a', 'aad-a', 'sal-a');
insert into public.password_key_envelopes (owner_id, ciphertext, iv, aad, salt, iterations)
  values (:conta_a, 'cifra-senha-a', 'iv-a', 'aad-a', 'sal-a', 600000);
select homologacao_testes.exigir(
  (select count(*) from public.upload_operations(jsonb_build_array(jsonb_build_object(
     'id', 'a1000000-0000-4000-8000-00000000000a',
     'record_id', 'a2000000-0000-4000-8000-00000000000a',
     'operation', 'upsert', 'base_version', 0, 'record_version', 1, 'schema_version', 1,
     'ciphertext', 'cifra-operacao-a', 'iv', 'iv-a', 'aad', 'aad-a', 'mac', 'mac-a', 'mac_version', 2)))) = 1,
  'A envia a própria operação cifrada pela função de envio');

-- Conta B monta os seus.
set request.jwt.claims = '{"sub":"bbbbbbbb-0000-4000-8000-000000000002","session_id":"b5000000-0000-4000-8000-00000000000b"}';

select homologacao_testes.exigir(
  public.claim_device(:disp_b, 'Celular Fictício B') = 'active',
  'o primeiro aparelho da conta B também nasce ativo');
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
  (select count(*) from public.password_key_envelopes) = 0,
  'B não lê o envelope de senha de A');
select homologacao_testes.exigir_recusa(
  $cmd$select * from public.encrypted_operations$cmd$,
  'nenhuma conta lê a tabela de operações direto: o recebimento é só pela função');
select homologacao_testes.exigir(
  (select count(*) from public.download_operations(0, 500)) = 0,
  'B não recebe operações cifradas de A ao sincronizar');

-- ---------------------------------------------------------------------------
-- 2. Alteração: B não altera nem apaga o que é de A.
-- ---------------------------------------------------------------------------

select homologacao_testes.exigir_recusa(
  $cmd$update public.devices set label = 'sequestrado por B'$cmd$,
  'nenhuma conta altera a tabela de aparelhos direto');

select homologacao_testes.exigir_recusa(
  format($cmd$insert into public.devices (id, owner_id, label, status)
               values ('c0000000-0000-4000-8000-00000000000c', %L, 'Forjado por B', 'active')$cmd$, :conta_a),
  'B não cria dispositivo em nome de A');

select homologacao_testes.exigir_recusa(
  format($cmd$select public.approve_device(%L)$cmd$, :disp_a),
  'B não confirma o aparelho de A');
select homologacao_testes.exigir_recusa(
  format($cmd$select public.revoke_device(%L)$cmd$, :disp_a),
  'B não revoga o aparelho de A');

select homologacao_testes.exigir_recusa(
  format($cmd$insert into public.recovery_key_envelopes (owner_id, ciphertext, iv, aad, salt)
               values (%L, 'x', 'x', 'x', 'x')$cmd$, :conta_a),
  'B não substitui o envelope de recuperação de A');

select homologacao_testes.exigir_recusa(
  format($cmd$insert into public.password_key_envelopes (owner_id, ciphertext, iv, aad, salt, iterations)
               values (%L, 'x', 'x', 'x', 'x', 600000)$cmd$, :conta_a),
  'B não substitui o envelope de senha de A');

select homologacao_testes.exigir_recusa(
  $cmd$delete from public.encrypted_operations$cmd$,
  'nenhuma conta apaga operações cifradas');
select homologacao_testes.exigir_recusa(
  $cmd$update public.encrypted_operations set ciphertext = 'reescrito'$cmd$,
  'nenhuma conta reescreve operações cifradas');
select homologacao_testes.exigir_recusa(
  $cmd$insert into public.encrypted_operations
        (id, owner_id, device_id, record_id, operation, base_version, record_version, schema_version, ciphertext, iv, aad)
        values ('b9000000-0000-4000-8000-00000000000b', auth.uid(), 'b0000000-0000-4000-8000-00000000000b',
                'b8000000-0000-4000-8000-00000000000b', 'upsert', 0, 1, 1, 'x', 'x', 'x')$cmd$,
  'nem a própria conta escreve na tabela de operações sem passar pela função');

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

-- A função ignora `owner_id` e `device_id` vindos do cliente: quem manda é a
-- sessão autenticada. B tenta se passar por A e a linha nasce em nome de B.
select public.upload_operations(jsonb_build_array(jsonb_build_object(
  'id', 'b1000000-0000-4000-8000-00000000000b',
  'owner_id', :conta_a, 'device_id', :disp_a,
  'record_id', 'b2000000-0000-4000-8000-00000000000b',
  'operation', 'upsert', 'base_version', 0, 'record_version', 1, 'schema_version', 1,
  'ciphertext', 'x', 'iv', 'x', 'aad', 'x')));

set role postgres;
select homologacao_testes.exigir(
  (select owner_id from public.encrypted_operations where id = 'b1000000-0000-4000-8000-00000000000b') = :conta_b,
  'operação enviada por B fica em nome de B mesmo declarando a conta de A');
select homologacao_testes.exigir(
  (select device_id from public.encrypted_operations where id = 'b1000000-0000-4000-8000-00000000000b') = :disp_b,
  'operação enviada por B fica no aparelho de B mesmo declarando o de A');
set role authenticated;

-- ---------------------------------------------------------------------------
-- 5. O dispositivo revogado da própria conta A não volta a funcionar.
-- ---------------------------------------------------------------------------

set request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","session_id":"a6000000-0000-4000-8000-00000000000a"}';

-- Um segundo aparelho de A, para revogar o primeiro de um lugar legítimo.
select homologacao_testes.exigir(
  public.claim_device('a7000000-0000-4000-8000-00000000000a', 'Celular Fictício A') = 'active',
  'entrar com a senha em outro aparelho da mesma conta funciona');
select public.revoke_device(:disp_a);
select homologacao_testes.exigir(
  (select status from public.devices where id = :disp_a) = 'revoked',
  'A consegue revogar o próprio dispositivo a partir de outro aparelho ativo');

set request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","session_id":"a5000000-0000-4000-8000-00000000000a"}';

select homologacao_testes.exigir_recusa(
  format($cmd$update public.devices set status = 'active' where id = %L$cmd$, :disp_a),
  'dispositivo revogado não é reativado');
select homologacao_testes.exigir_recusa(
  format($cmd$select public.claim_device(%L, 'Computador Fictício A')$cmd$, :disp_a),
  'dispositivo revogado não recupera o vínculo com a sessão');

select homologacao_testes.exigir_recusa(
  format($cmd$delete from public.devices where id = %L$cmd$, :disp_a),
  'dispositivo revogado não é apagado e recriado para contornar a revogação');

select homologacao_testes.exigir_recusa(
  $cmd$select public.upload_operations(jsonb_build_array(jsonb_build_object(
    'id', 'a3000000-0000-4000-8000-00000000000a',
    'record_id', 'a4000000-0000-4000-8000-00000000000a',
    'operation', 'upsert', 'base_version', 1, 'record_version', 2, 'schema_version', 1,
    'ciphertext', 'x', 'iv', 'x', 'aad', 'x')))$cmd$,
  'dispositivo revogado não envia mais');

select homologacao_testes.exigir_recusa(
  format($cmd$insert into public.device_key_envelopes (owner_id, device_id, ciphertext, iv, aad)
               values (%L, %L, 'x', 'x', 'x')$cmd$, :conta_a, :disp_a),
  'dispositivo revogado não recebe nova chave');

-- O recebimento também é barrado no servidor: a sessão do aparelho revogado
-- perdeu o vínculo, então a função de download não sabe por qual aparelho ela
-- fala e recusa. Antes isso dependia só de uma trava do aplicativo.
select homologacao_testes.exigir_recusa(
  $cmd$select * from public.download_operations(0, 500)$cmd$,
  'dispositivo revogado não recebe mais');

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
  $cmd$select * from public.password_key_envelopes$cmd$, 'anônimo não lê envelopes de senha');
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

-- TRUNCATE não passa pela RLS: quem o tiver apaga as linhas de todas as contas.
-- TRIGGER permite anexar um gatilho à tabela e desviar linhas alheias. Nenhum
-- dos dois pode sobrar para authenticated, nem nas tabelas de hoje nem nas que
-- vierem depois.
select homologacao_testes.exigir(
  not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and (has_table_privilege('authenticated', c.oid, 'TRUNCATE')
        or has_table_privilege('authenticated', c.oid, 'TRIGGER')
        or has_table_privilege('authenticated', c.oid, 'REFERENCES'))),
  'authenticated não trunca, não referencia e não cria gatilho em nenhuma tabela de public');

-- Uma view em public pode ler as tabelas por baixo da RLS; hoje o aplicativo
-- não usa nenhuma, e uma view nova precisa ser uma decisão consciente.
select homologacao_testes.exigir(
  not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('v', 'm')),
  'nenhuma view em public contorna a RLS das tabelas');

-- Função security definer roda com os privilégios do dono e ignora a RLS de
-- quem chamou. Se um dia existir uma, ela precisa ao menos fixar o search_path.
select homologacao_testes.exigir(
  not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) as cfg where cfg like 'search_path=%')),
  'nenhuma função security definer em public sem search_path fixo');

-- Uma função em public é chamável pela API. Nenhuma pode ficar ao alcance de
-- quem não entrou na conta, e as que rodam como dono precisam ser exatamente
-- as que este projeto escreveu de propósito.
-- PUBLIC aparece em `aclexplode` com grantee 0, que não tem linha em pg_roles:
-- o `join` derrubava exatamente o caso do padrão do PostgreSQL, que concede
-- EXECUTE a PUBLIC em toda função nova. Era o caso que mais importava pegar.
select homologacao_testes.exigir(
  not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as a
    left join pg_roles r on r.oid = a.grantee
    where n.nspname = 'public' and a.grantee = 0),
  'PUBLIC não executa nenhuma função de public');

-- Duas funções respondem a quem ainda não entrou, e só elas: são o que permite
-- à build conferir com qual serviço está falando antes de mandar e-mail e
-- senha. Uma devolve um número de versão, a outra a palavra `homologacao` ou
-- `producao`. Qualquer terceira função aberta a anon reprova aqui.
select homologacao_testes.exigir(
  (select coalesce(array_agg(distinct p.proname order by p.proname), '{}')
   from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as a
   join pg_roles r on r.oid = a.grantee
   where n.nspname = 'public' and r.rolname = 'anon')
  = array['app_environment', 'app_schema_version']::name[],
  'anon executa apenas as duas funções que identificam o serviço');

-- Por nome, e não por contagem: uma função definidora nova precisa ser uma
-- decisão consciente, escrita aqui. Contar só avisaria que o número mudou.
select homologacao_testes.exigir(
  (select coalesce(array_agg(p.proname order by p.proname), '{}')
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef)
  = array[
      'active_device_id', 'app_environment', 'approve_device', 'claim_device',
      'current_device_id', 'download_operations', 'funcoes_publicas_abertas',
      'protecao_de_funcao_nova', 'purge_record_history',
      'revoke_all_devices', 'revoke_device', 'session_is_authorized',
      'session_is_not_revoked', 'upload_operations'
    ]::name[],
  'só as funções previstas rodam com os privilégios do dono');

-- O aplicativo não usa armazenamento de arquivos: todo anexo continuaria fora
-- do cofre cifrado, então nenhum bucket pode existir.
do $$
declare
  total integer;
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'ok: %', 'armazenamento não existe neste ambiente';
    return;
  end if;
  execute 'select count(*) from storage.buckets' into total;
  if total <> 0 then
    raise exception 'FALHOU: nenhum bucket de armazenamento exposto';
  end if;
  raise notice 'ok: %', 'nenhum bucket de armazenamento exposto';
end;
$$;

\echo 'Isolamento entre contas ficticias comprovado.'
