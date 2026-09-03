begin;

-- ---------------------------------------------------------------------------
-- Função e procedimento novos nascem fechados para PUBLIC.
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
      execute format('revoke all on routine %s from public', criado.object_identity);
    end if;
  end loop;
end;
$$;

-- Procedimento entra junto: `call` também é uma porta, e uma porta esquecida.
create event trigger fechar_funcao_nova
  on ddl_command_end
  when tag in ('CREATE FUNCTION', 'CREATE PROCEDURE')
  execute function public.revogar_execute_publico_em_funcao_nova();

-- ---------------------------------------------------------------------------
-- A proteção precisa ser verificável, e não afirmada.
--
-- Um ambiente gerenciado pode recusar gatilho de evento ao papel que aplica
-- migrations. Se isso acontecer, o `create event trigger` acima aborta a
-- transação inteira e a migration falha com a mensagem do próprio PostgreSQL —
-- que é o comportamento certo: melhor a migration parar e alguém decidir do
-- que ela passar dizendo que existe uma proteção automática que não existe.
--
-- A função abaixo não afirma nada por conta própria: ela olha o catálogo. Se
-- alguém apagar ou desabilitar o gatilho depois, ela passa a responder falso,
-- e a checklist de homologação e `pnpm test:api` reprovam.
-- ---------------------------------------------------------------------------

create function public.protecao_de_funcao_nova()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from pg_event_trigger
    where evtname = 'fechar_funcao_nova' and evtenabled <> 'D'
  );
$$;

comment on function public.protecao_de_funcao_nova() is
  'Verdadeiro quando o gatilho que fecha função e procedimento novos está ativo. Olha o catálogo: não é uma afirmação, é uma leitura.';

do $$
begin
  if not public.protecao_de_funcao_nova() then
    raise exception 'o gatilho que fecha função nova não ficou ativo; a migration não pode concluir afirmando uma proteção que não existe';
  end if;
end;
$$;

revoke all on function public.revogar_execute_publico_em_funcao_nova(),
  public.protecao_de_funcao_nova() from public, anon;
grant execute on function public.protecao_de_funcao_nova() to authenticated;

create or replace function public.app_schema_version()
returns integer
language sql
immutable
security invoker
set search_path = ''
as $$ select 7 $$;

commit;
