begin;

-- ---------------------------------------------------------------------------
-- O que a plataforma deixou aberto, antes de o nosso contrato começar.
--
-- Um projeto Supabase recém-criado pode chegar com objetos que ninguém deste
-- repositório escreveu. O caso concreto que parou a primeira aplicação em
-- produção: o gatilho de evento `ensure_rls`, cuja função `rls_auto_enable()`
-- vive em `public`, pertence a `postgres` e não tem ACL explícita. Sem ACL, o
-- PostgreSQL concede `EXECUTE` a PUBLIC — e a auditoria da 0007 abortou a
-- transação inteira, corretamente, por encontrar função de `public` ao alcance
-- de PUBLIC.
--
-- Duas coisas precisam ser ditas sem rodeio:
--
--   1. **Não é uma porta explorável.** O PostgreSQL recusa a chamada direta de
--      uma função de gatilho: "trigger functions can only be called as
--      triggers". Ninguém executa `rls_auto_enable()` pelo PostgREST.
--   2. **Ainda assim se fecha.** O valor da auditoria vem de o invariante não
--      ter exceção. Uma exceção tolerada hoje é a que ninguém questiona quando
--      aparecer a próxima, que talvez não seja inofensiva. Fechar custa uma
--      linha; manter a exceção custa a credibilidade da verificação inteira.
--
-- Esta migration não altera o esquema, não cria objeto e não muda
-- `app_schema_version()`. Ela só retira uma concessão. Por isso é `0000`: é
-- pré-condição do contrato, não parte dele, e roda antes da `0001` em projeto
-- novo. Em projeto que já recebeu as outras, pode rodar a qualquer momento.
--
-- O gatilho continua funcionando: gatilho de evento dispara pelo sistema, não
-- pelo privilégio de execução de quem faz o DDL. E se um dia a plataforma
-- recriar o objeto aberto, a auditoria volta a reprovar — que é exatamente o
-- comportamento desejado.
-- ---------------------------------------------------------------------------

do $$
declare
  alvo record;
  fechadas text[] := '{}';
begin
  for alvo in
    select n.nspname as esquema,
           p.proname as funcao,
           pg_catalog.pg_get_function_identity_arguments(p.oid) as argumentos
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prorettype = 'pg_catalog.event_trigger'::regtype
      and pg_catalog.has_function_privilege('public', p.oid, 'EXECUTE')
      -- Existir não é poder: só se mexe no que pertence a papel de que este
      -- papel é membro. Objeto de `supabase_admin` está fora de alcance, e
      -- fingir o contrário faria a migration falhar em produção.
      and pg_catalog.pg_has_role(current_user, p.proowner, 'USAGE')
  loop
    execute format('revoke all on function %I.%I(%s) from public', alvo.esquema, alvo.funcao, alvo.argumentos);
    fechadas := fechadas || format('%s.%s', alvo.esquema, alvo.funcao);
  end loop;

  -- O aviso é parte da prova: quem aplica precisa ver o que foi fechado, em
  -- vez de supor que não havia nada.
  raise notice 'funcoes de gatilho de evento em public fechadas para PUBLIC: %',
    coalesce(nullif(array_to_string(fechadas, ', '), ''), 'nenhuma');
end;
$$;

commit;
