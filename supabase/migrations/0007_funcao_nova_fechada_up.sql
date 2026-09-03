begin;

-- ---------------------------------------------------------------------------
-- Função nova nasce fechada para PUBLIC.
--
-- O diagnóstico no CI resolveu a dúvida que ficou da rodada anterior:
-- `alter default privileges ... revoke execute on functions from public` não
-- deixa entrada nenhuma em `pg_default_acl` para funções. Para tabelas deixa —
-- e por isso tabela futura já nascia fechada. Para função, não: ela continuava
-- nascendo com o EXECUTE que o PostgreSQL concede a PUBLIC, e a única defesa
-- era lembrar de escrever o `revoke` à mão.
--
-- Um gatilho de evento fecha isso de verdade, inclusive para uma função criada
-- fora das migrations — pelo editor SQL do painel, por exemplo, que é
-- justamente o caso em que ninguém lembra.
--
-- A conferência de `01_rls_isolation.sql` continua no lugar, e continua sendo
-- ela quem reprova se algo escapar: um gatilho que não pôde ser criado não
-- pode virar uma garantia silenciosa.
-- ---------------------------------------------------------------------------

create function public.revogar_execute_publico_em_funcao_nova()
returns event_trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  criado record;
begin
  for criado in select * from pg_event_trigger_ddl_commands()
  loop
    if criado.schema_name = 'public' and criado.object_type in ('function', 'procedure') then
      execute format('revoke all on function %s from public', criado.object_identity);
    end if;
  end loop;
end;
$$;

do $$
begin
  create event trigger fechar_funcao_nova
    on ddl_command_end
    when tag in ('CREATE FUNCTION')
    execute function public.revogar_execute_publico_em_funcao_nova();
exception
  when insufficient_privilege then
    -- Alguns ambientes gerenciados não permitem gatilho de evento ao papel que
    -- aplica migrations. Falhar aqui impediria a migration inteira; o que vale
    -- é registrar e deixar a conferência de isolamento fazer o trabalho.
    raise warning 'gatilho de evento não pôde ser criado: cada função precisará do seu revoke escrito à mão';
end;
$$;

revoke all on function public.revogar_execute_publico_em_funcao_nova() from public, anon, authenticated;

create or replace function public.app_schema_version()
returns integer
language sql
immutable
security invoker
set search_path = ''
as $$ select 7 $$;

commit;
