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

create function public.purge_record_history(p_record_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  conta uuid := auth.uid();
  apagadas integer;
begin
  perform public.active_device_id();
  if p_record_ids is null or array_length(p_record_ids, 1) is null then
    return 0;
  end if;
  if array_length(p_record_ids, 1) > 500 then
    raise exception 'lote de expurgo grande demais';
  end if;

  with ultimas as (
    select o.record_id, max(o.seq) as seq
    from public.encrypted_operations o
    where o.owner_id = conta and o.record_id = any(p_record_ids)
    group by o.record_id
  )
  delete from public.encrypted_operations o
  using ultimas u
  where o.owner_id = conta and o.record_id = u.record_id and o.seq < u.seq;

  get diagnostics apagadas = row_count;
  return apagadas;
end;
$$;

comment on function public.purge_record_history(uuid[]) is
  'Apaga as versões anteriores dos registros indicados, preservando apenas a última — a lápide que os outros aparelhos precisam receber.';

create or replace function public.app_schema_version()
returns integer
language sql
immutable
security invoker
set search_path = ''
as $$ select 6 $$;

revoke all on function public.purge_record_history(uuid[]) from public, anon;
grant execute on function public.purge_record_history(uuid[]) to authenticated;

commit;
