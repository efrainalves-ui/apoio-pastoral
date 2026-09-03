begin;

-- ---------------------------------------------------------------------------
-- Expurgo do histórico de um registro apagado.
--
-- Apagar uma pessoa trocava o envelope do registro por uma lápide, e isso
-- resolvia o presente. O passado ficava: cada versão anterior continuava
-- guardada em `encrypted_operations`, cifrada com a mesma chave que o titular
-- usa todo dia. Quem tivesse a chave e o histórico remontava a pessoa inteira
-- — e o pastor tinha acabado de dizer a ela que os dados foram apagados.
--
-- Esta função apaga esse histórico. Guarda apenas a operação mais recente de
-- cada registro, que é a lápide: sem ela, um aparelho que ainda não sincronizou
-- nunca saberia da exclusão e continuaria com a pessoa na tela.
--
-- O que o expurgo **não** alcança, e precisa continuar dito em voz alta:
--   * o que outro aparelho já baixou continua lá — nenhuma exclusão viaja para
--     dentro de um aparelho fora do alcance de quem pede;
--   * backups já baixados pelo titular continuam com ele;
--   * o serviço continua sabendo que houve operações e quando — a quantidade e
--     os carimbos não são segredo em nenhum momento.
-- ---------------------------------------------------------------------------

create function public.purge_record_history(p_expected jsonb)
returns setof uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  conta uuid := auth.uid();
  item jsonb;
  registro uuid;
  esperada uuid;
  vigente uuid;
begin
  perform public.active_device_id();
  if jsonb_typeof(p_expected) <> 'array' then
    raise exception 'lote de expurgo invalido';
  end if;
  if jsonb_array_length(p_expected) > 500 then
    raise exception 'lote de expurgo grande demais';
  end if;

  for item in select * from jsonb_array_elements(p_expected)
  loop
    registro := (item ->> 'record_id')::uuid;
    esperada := (item ->> 'operation_id')::uuid;
    if registro is null or esperada is null then
      raise exception 'item de expurgo sem registro ou sem operacao esperada';
    end if;

    select o.id into vigente
    from public.encrypted_operations o
    where o.owner_id = conta and o.record_id = registro
    order by o.seq desc
    limit 1;

    -- Só expurga quando a operação que este aparelho publicou ainda é a última
    -- daquele registro. Qualquer coisa mais recente é alteração concorrente de
    -- outro aparelho: apagar o histórico por baixo dela destruiria um trabalho
    -- que ninguém pediu para apagar, e a decisão de expurgar foi tomada antes
    -- de essa alteração existir. Nesse caso o registro simplesmente não volta
    -- na lista, e quem chamou mantém a pendência para decidir de novo.
    if vigente is not null and vigente = esperada then
      delete from public.encrypted_operations o
      where o.owner_id = conta and o.record_id = registro and o.id <> esperada;
      return next registro;
    end if;
  end loop;
end;
$$;

comment on function public.purge_record_history(jsonb) is
  'Apaga as versões anteriores de cada registro indicado, e somente quando a operação esperada ainda é a última dele. Devolve os registros que foram de fato expurgados.';

create or replace function public.app_schema_version()
returns integer
language sql
immutable
security invoker
set search_path = ''
as $$ select 6 $$;

revoke all on function public.purge_record_history(jsonb) from public, anon;
grant execute on function public.purge_record_history(jsonb) to authenticated;

commit;
