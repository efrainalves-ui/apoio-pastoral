-- Prova que a configuração do envio (chaves VAPID e segredo do agendamento, no
-- Vault) só é alcançável pelo servidor: nem anon nem authenticated executam as
-- funções que a leem ou gravam, e PUBLIC não herda execução.
--
-- Confere o privilégio no catálogo, e não tentando executar: o Postgres de teste
-- não tem o schema vault, e uma chamada recusada por falta dele passaria aqui
-- pelo motivo errado.

\set ON_ERROR_STOP on

reset role;

-- 0012: o servidor alcança só as duas tabelas das notificações, e só o que o envio usa.
select homologacao_testes.exigir(has_table_privilege('service_role', 'public.push_subscriptions', 'select'), 'o servidor lê as inscrições');
select homologacao_testes.exigir(has_table_privilege('service_role', 'public.push_subscriptions', 'delete'), 'o servidor apaga a inscrição recusada');
select homologacao_testes.exigir(not has_table_privilege('service_role', 'public.push_subscriptions', 'insert'), 'o servidor não cria inscrição');
select homologacao_testes.exigir(has_column_privilege('service_role', 'public.notification_schedule', 'state', 'update'), 'o servidor marca o envio');
select homologacao_testes.exigir(not has_column_privilege('service_role', 'public.notification_schedule', 'occurrence_key', 'update'), 'o servidor não troca a chave da ocorrência');
select homologacao_testes.exigir(not has_column_privilege('service_role', 'public.notification_schedule', 'owner_id', 'update'), 'o servidor não troca o dono do horário');
select homologacao_testes.exigir(not has_table_privilege('service_role', 'public.encrypted_operations', 'select'), 'o servidor continua sem ler as operações cifradas');

select homologacao_testes.exigir(not has_function_privilege('anon', 'public.lembretes_push_config()', 'execute'), 'anon não lê a configuração do envio');
select homologacao_testes.exigir(not has_function_privilege('authenticated', 'public.lembretes_push_config()', 'execute'), 'conta autenticada não lê a configuração do envio');
select homologacao_testes.exigir(not has_function_privilege('anon', 'public.lembretes_push_guardar_vapid(text, text)', 'execute'), 'anon não grava chaves');
select homologacao_testes.exigir(not has_function_privilege('authenticated', 'public.lembretes_push_guardar_vapid(text, text)', 'execute'), 'conta autenticada não grava chaves');
select homologacao_testes.exigir(has_function_privilege('service_role', 'public.lembretes_push_config()', 'execute'), 'o servidor lê a configuração');
select homologacao_testes.exigir(has_function_privilege('service_role', 'public.lembretes_push_guardar_vapid(text, text)', 'execute'), 'o servidor grava as chaves');
select homologacao_testes.exigir(
  not exists (
    select 1 from pg_catalog.pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
     where p.pronamespace = 'public'::regnamespace
       and p.proname in ('lembretes_push_config', 'lembretes_push_guardar_vapid')
       and a.grantee = 0 and a.privilege_type = 'EXECUTE'
  ),
  'PUBLIC não executa as funções de configuração');
select homologacao_testes.exigir(
  (select bool_and(p.prosecdef and p.proconfig @> array['search_path=""']) from pg_catalog.pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname in ('lembretes_push_config', 'lembretes_push_guardar_vapid')),
  'funções de configuração com search_path fixo');
