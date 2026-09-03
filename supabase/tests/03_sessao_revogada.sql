-- Prova que a revogação vale também para o token já emitido, que encerrar o
-- distrito alcança todos os aparelhos do servidor e que o ambiente declarado
-- no banco existe. Roda depois de 01 e 02, no mesmo Postgres descartável.
--
-- Sem credencial e sem dado real: contas example.invalid e cifra inventada.

\set ON_ERROR_STOP on

\set conta_e '''eeeeeeee-0000-4000-8000-000000000005'''
\set disp_e1 '''e1000000-0000-4000-8000-00000000000e'''
\set disp_e2 '''e2000000-0000-4000-8000-00000000000e'''
\set disp_e3 '''e3000000-0000-4000-8000-00000000000e'''
\set sessao_e1 '''e1a00000-0000-4000-8000-00000000000e'''
\set sessao_e2 '''e2a00000-0000-4000-8000-00000000000e'''

reset role;

insert into auth.users (id, email) values
  (:conta_e, 'conta.e.ficticia@example.invalid')
on conflict (id) do nothing;

set role authenticated;

-- ---------------------------------------------------------------------------
-- 1. Dois aparelhos da mesma conta, cada um com a própria sessão.
-- ---------------------------------------------------------------------------

set request.jwt.claims = '{"sub":"eeeeeeee-0000-4000-8000-000000000005","session_id":"e1a00000-0000-4000-8000-00000000000e"}';
select homologacao_testes.exigir(
  public.claim_device(:disp_e1, 'Computador Fictício E') = 'active',
  'E: o primeiro aparelho nasce ativo');
insert into public.password_key_envelopes (owner_id, ciphertext, iv, aad, salt, iterations)
  values (:conta_e, 'cifra-ficticia', 'iv-ficticio', 'aad-ficticio', 'sal-ficticio', 600000);
insert into public.recovery_key_envelopes (owner_id, ciphertext, iv, aad, salt)
  values (:conta_e, 'cifra-ficticia', 'iv-ficticio', 'aad-ficticio', 'sal-ficticio');
insert into public.device_key_envelopes (owner_id, device_id, ciphertext, iv, aad)
  values (:conta_e, :disp_e1, 'cifra-ficticia', 'iv-ficticio', 'aad-ficticio');

set request.jwt.claims = '{"sub":"eeeeeeee-0000-4000-8000-000000000005","session_id":"e2a00000-0000-4000-8000-00000000000e"}';
select homologacao_testes.exigir(
  public.claim_device(:disp_e2, 'Celular Fictício E') = 'active',
  'entrar com a senha em um segundo aparelho continua funcionando');

-- ---------------------------------------------------------------------------
-- 2. Um aparelho revoga o outro. O token do revogado continua válido até
--    expirar: é justamente essa janela que precisa estar fechada.
-- ---------------------------------------------------------------------------

set request.jwt.claims = '{"sub":"eeeeeeee-0000-4000-8000-000000000005","session_id":"e1a00000-0000-4000-8000-00000000000e"}';
select public.revoke_device(:disp_e2);

set request.jwt.claims = '{"sub":"eeeeeeee-0000-4000-8000-000000000005","session_id":"e2a00000-0000-4000-8000-00000000000e"}';

select homologacao_testes.exigir(
  (select count(*) from public.password_key_envelopes) = 0,
  'sessão revogada não lê mais o envelope de senha da conta');
select homologacao_testes.exigir(
  (select count(*) from public.recovery_key_envelopes) = 0,
  'sessão revogada não lê mais o envelope de recuperação da conta');
select homologacao_testes.exigir(
  (select count(*) from public.device_key_envelopes) = 0,
  'sessão revogada não lê mais os envelopes de chave dos outros aparelhos');
select homologacao_testes.exigir(
  (select count(*) from public.devices) = 0,
  'sessão revogada não lista mais os aparelhos da conta');

-- Apagar e sobrescrever também passam pela política: sem isto, um aparelho
-- revogado ainda poderia trancar o titular para fora de todo aparelho novo.
delete from public.password_key_envelopes;
delete from public.recovery_key_envelopes;
delete from public.device_key_envelopes;
reset role;
select homologacao_testes.exigir(
  (select count(*) from public.password_key_envelopes where owner_id = :conta_e) = 1
  and (select count(*) from public.recovery_key_envelopes where owner_id = :conta_e) = 1
  and (select count(*) from public.device_key_envelopes where owner_id = :conta_e) = 1,
  'a exclusão pedida pela sessão revogada não alcançou envelope nenhum');
set role authenticated;

select homologacao_testes.exigir_recusa(
  $cmd$select public.download_operations(0, 200)$cmd$,
  'sessão revogada não recebe operações');
select homologacao_testes.exigir_recusa(
  $cmd$select public.upload_operations('[]'::jsonb)$cmd$,
  'sessão revogada não envia operações');
select homologacao_testes.exigir_recusa(
  format($cmd$select public.claim_device(%L, 'Aparelho novo do revogado')$cmd$, :disp_e3),
  'sessão revogada não reivindica um identificador novo');

-- ---------------------------------------------------------------------------
-- 3. O aparelho que continua ativo não perdeu nada.
-- ---------------------------------------------------------------------------

set request.jwt.claims = '{"sub":"eeeeeeee-0000-4000-8000-000000000005","session_id":"e1a00000-0000-4000-8000-00000000000e"}';
select homologacao_testes.exigir(
  (select count(*) from public.password_key_envelopes) = 1,
  'o aparelho ativo continua lendo o envelope de senha');
select homologacao_testes.exigir(
  (select count(*) from public.devices) = 2,
  'o aparelho ativo continua enxergando a lista de aparelhos');

-- ---------------------------------------------------------------------------
-- 3b. Aparelho aguardando confirmação: enxerga a própria linha, para descobrir
--     que foi liberado, mas não alcança chave nenhuma enquanto espera.
-- ---------------------------------------------------------------------------

reset role;
insert into public.devices (id, owner_id, label, status)
  values ('e9000000-0000-4000-8000-00000000000e', :conta_e, 'Aparelho Fictício E aguardando', 'pending');
insert into public.device_sessions (session_id, owner_id, device_id)
  values ('e9a00000-0000-4000-8000-00000000000e', :conta_e, 'e9000000-0000-4000-8000-00000000000e');
set role authenticated;
set request.jwt.claims = '{"sub":"eeeeeeee-0000-4000-8000-000000000005","session_id":"e9a00000-0000-4000-8000-00000000000e"}';

select homologacao_testes.exigir(
  (select status from public.devices where id = 'e9000000-0000-4000-8000-00000000000e') = 'pending',
  'o aparelho que aguarda enxerga a própria situação');
select homologacao_testes.exigir(
  (select count(*) from public.password_key_envelopes) = 0,
  'o aparelho que aguarda não alcança o envelope de senha da conta');

reset role;
delete from public.device_sessions where session_id = 'e9a00000-0000-4000-8000-00000000000e';
delete from public.devices where id = 'e9000000-0000-4000-8000-00000000000e';
set role authenticated;
set request.jwt.claims = '{"sub":"eeeeeeee-0000-4000-8000-000000000005","session_id":"e1a00000-0000-4000-8000-00000000000e"}';

-- ---------------------------------------------------------------------------
-- 4. Encerrar distrito: um comando revoga todos os aparelhos do servidor,
--    inclusive os que este aparelho nunca conheceu.
-- ---------------------------------------------------------------------------

reset role;
insert into public.devices (id, owner_id, label, status)
  values (:disp_e3, :conta_e, 'Aparelho Fictício E que só o servidor conhece', 'active');
set role authenticated;

select homologacao_testes.exigir(
  public.revoke_all_devices() = 2,
  'revogar tudo alcança o aparelho ativo desconhecido e o próprio aparelho');
reset role;
select homologacao_testes.exigir(
  (select count(*) from public.devices where owner_id = :conta_e and status <> 'revoked') = 0,
  'nenhum aparelho da conta continua ativo depois do encerramento');
set role authenticated;

select homologacao_testes.exigir(
  public.claim_device('e4000000-0000-4000-8000-00000000000e', 'Computador Fictício E novo') = 'active',
  'a sessão que encerrou o distrito registra a autorização nova');

-- ---------------------------------------------------------------------------
-- 5. Ambiente declarado no banco.
-- ---------------------------------------------------------------------------

select homologacao_testes.exigir(
  public.app_environment() is null,
  'sem a linha de ambiente o banco não declara nada e o aplicativo falha fechado');

select homologacao_testes.exigir_recusa(
  $cmd$insert into public.service_environment (environment) values ('homologacao')$cmd$,
  'o navegador não escreve o ambiente declarado');

reset role;
insert into public.service_environment (environment) values ('homologacao');
set role authenticated;
select homologacao_testes.exigir(
  public.app_environment() = 'homologacao',
  'com a linha escrita pelo responsável, o banco declara o ambiente');
select homologacao_testes.exigir(
  public.app_schema_version() = 7,
  'a versão do esquema acompanha esta migration');

reset role;
select homologacao_testes.exigir_recusa(
  $cmd$insert into public.service_environment (environment) values ('producao')$cmd$,
  'o banco guarda um único ambiente declarado');
select homologacao_testes.exigir_recusa(
  $cmd$insert into public.service_environment (id, environment) values (false, 'producao')$cmd$,
  'não existe um segundo ambiente escondido em outra linha');

-- ---------------------------------------------------------------------------
-- 5b. Expurgo do histórico de um registro apagado.
--
-- Trocar o envelope por uma lápide resolve o presente. Sem apagar o passado,
-- cada versão anterior continuava guardada, cifrada com a mesma chave que o
-- titular usa todo dia — e o pastor tinha acabado de dizer à pessoa que os
-- dados dela foram apagados.
-- ---------------------------------------------------------------------------

set role authenticated;
set request.jwt.claims = '{"sub":"eeeeeeee-0000-4000-8000-000000000005","session_id":"e1a00000-0000-4000-8000-00000000000e"}';

select public.upload_operations(jsonb_build_array(
  jsonb_build_object('id', 'f1000000-0000-4000-8000-00000000000f', 'record_id', 'fa000000-0000-4000-8000-00000000000f',
    'operation', 'upsert', 'base_version', 0, 'record_version', 1, 'schema_version', 1,
    'ciphertext', 'versao-antiga-ficticia', 'iv', 'iv', 'aad', 'aad', 'mac', 'mac', 'mac_version', 3),
  jsonb_build_object('id', 'f2000000-0000-4000-8000-00000000000f', 'record_id', 'fa000000-0000-4000-8000-00000000000f',
    'operation', 'upsert', 'base_version', 1, 'record_version', 2, 'schema_version', 1,
    'ciphertext', 'versao-intermediaria-ficticia', 'iv', 'iv', 'aad', 'aad', 'mac', 'mac', 'mac_version', 3),
  jsonb_build_object('id', 'f3000000-0000-4000-8000-00000000000f', 'record_id', 'fa000000-0000-4000-8000-00000000000f',
    'operation', 'delete', 'base_version', 2, 'record_version', 3, 'schema_version', 1,
    'ciphertext', 'lapide-ficticia', 'iv', 'iv', 'aad', 'aad', 'mac', 'mac', 'mac_version', 3)
));

select homologacao_testes.exigir(
  (select count(*) from public.download_operations(0, 500)) = 3,
  'as três versões do registro chegaram ao serviço');

select homologacao_testes.exigir(
  public.purge_record_history(array['fa000000-0000-4000-8000-00000000000f']::uuid[]) = 2,
  'o expurgo apaga as versões anteriores do registro');

select homologacao_testes.exigir(
  (select count(*) from public.download_operations(0, 500)) = 1,
  'sobra apenas uma operação daquele registro');
select homologacao_testes.exigir(
  (select o.operation from public.download_operations(0, 500) o) = 'delete',
  'a que sobra é a lápide, que os outros aparelhos ainda precisam receber');
select homologacao_testes.exigir(
  not exists (select 1 from public.download_operations(0, 500) o where o.ciphertext like 'versao-%'),
  'nenhuma versão anterior continua recuperável no serviço');

select homologacao_testes.exigir(
  public.purge_record_history(array[]::uuid[]) = 0,
  'expurgo sem registro nenhum não faz nada');

-- As provas de privilégio a seguir criam objetos, e quem cria é o dono.
reset role;

-- ---------------------------------------------------------------------------
-- 6. Privilégios de toda tabela futura de public.
-- ---------------------------------------------------------------------------

create table public.tabela_futura_ficticia (id uuid primary key);
select homologacao_testes.exigir(
  not exists (
    select 1
    from unnest(array['anon', 'authenticated']) as papel,
         unnest(array['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger']) as direito
    where has_table_privilege(papel, 'public.tabela_futura_ficticia', direito)
  ),
  'uma tabela criada depois desta migration não nasce ao alcance do navegador');
drop table public.tabela_futura_ficticia;

-- Função nova também nasce fechada, agora por gatilho de evento. O aviso abaixo
-- mostra por que ela não podia depender do privilégio padrão: para tabelas o
-- `alter default privileges` deixa entrada em `pg_default_acl`; para funções,
-- não deixa nenhuma, e o EXECUTE de PUBLIC vinha do padrão embutido.
do $$
declare
  padrao text;
begin
  select coalesce(string_agg(format('%s:%s', d.defaclobjtype, d.defaclacl::text), ' | '), 'nenhum')
    into padrao
  from pg_default_acl d
  join pg_namespace n on n.oid = d.defaclnamespace
  where n.nspname = 'public';
  raise notice 'diagnóstico: privilégios padrão em public = %', padrao;
end;
$$;

create function public.funcao_futura_ficticia() returns integer language sql immutable as $$ select 1 $$;
select homologacao_testes.exigir(
  not has_function_privilege('authenticated', 'public.funcao_futura_ficticia()', 'execute')
  and not has_function_privilege('anon', 'public.funcao_futura_ficticia()', 'execute'),
  'uma função criada sem revoke nenhum já nasce fora do alcance do navegador');
select homologacao_testes.exigir(
  not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as a
    where n.nspname = 'public' and p.proname = 'funcao_futura_ficticia' and a.grantee = 0),
  'e PUBLIC não aparece na lista de privilégios dela');
drop function public.funcao_futura_ficticia();

delete from public.service_environment;
set request.jwt.claims = '{}';

\echo 'Revogação, encerramento de distrito, ambiente e privilégios futuros comprovados no servidor.'
