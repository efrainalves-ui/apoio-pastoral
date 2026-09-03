import { db, type ApoioDatabase } from './database'
import { pendingActionId } from './types'

/**
 * Expurgo do que sobra de um registro depois de ele ser apagado.
 *
 * Trocar o envelope por uma lápide resolve o presente e não toca no passado.
 * Cada versão anterior continua guardada — na fila de envio, nas revisões de
 * conflito, na quarentena e no histórico do serviço — cifrada com a mesma
 * chave que o titular usa todo dia. Dizer a uma pessoa que os dados dela foram
 * apagados enquanto isso permanece recuperável não seria verdade.
 *
 * O que o expurgo alcança e o que não alcança está dito por inteiro em
 * `docs/GOVERNANCA.md`: o que outro aparelho já baixou continua lá, e backups
 * já salvos continuam com quem os salvou. Nenhum aplicativo alcança isso.
 */
export interface PurgeResult {
  /** Itens da fila de envio, revisões e quarentena apagados neste aparelho. */
  local: number
  /** Registros cujo histórico no serviço ficou na fila de expurgo. */
  queued: number
}

/**
 * Apaga aqui tudo que ainda guarda uma versão anterior destes registros e
 * enfileira o mesmo expurgo para o serviço.
 *
 * A fila existe porque o expurgo remoto não pode acontecer agora: a lápide
 * ainda está na fila de envio, e apagar o histórico antes de ela subir deixaria
 * os outros aparelhos sem saber da exclusão. Ele acontece na sincronização
 * seguinte, logo depois do envio.
 *
 * `keepOperationIds` são as operações criadas pela própria exclusão — elas
 * precisam sobreviver, porque são o que leva a remoção aos outros aparelhos.
 */
export async function purgeRecordHistory(
  accountId: string,
  recordIds: string[],
  keepOperationIds: Set<string>,
  database: ApoioDatabase = db,
): Promise<PurgeResult> {
  if (recordIds.length === 0) return { local: 0, queued: 0 }
  const alvos = new Set(recordIds)
  let local = 0

  await database.transaction('rw', database.outbox, database.syncConflicts, database.quarantine, database.pendingActions, async () => {
    const fila = await database.outbox.where('accountId').equals(accountId).toArray()
    const antigas = fila.filter((item) => alvos.has(item.recordId) && !keepOperationIds.has(item.id))
    await database.outbox.bulkDelete(antigas.map(({ id }) => id))
    local += antigas.length

    // As revisões de conflito guardam as duas versões cifradas por desenho —
    // é o que evita perder trabalho. Depois da exclusão, é justamente o que
    // não pode ficar.
    const revisoes = (await database.syncConflicts.where('accountId').equals(accountId).toArray())
      .filter((item) => alvos.has(item.recordId))
    await database.syncConflicts.bulkDelete(revisoes.map(({ id }) => id))
    local += revisoes.length

    const quarentena = (await database.quarantine.where('accountId').equals(accountId).toArray())
      .filter((item) => alvos.has(item.recordId))
    await database.quarantine.bulkDelete(quarentena.map(({ id }) => id))
    local += quarentena.length

    const id = pendingActionId(accountId, 'purge_history')
    const pendente = await database.pendingActions.get(id)
    const juntos = [...new Set([...(pendente?.recordIds ?? []), ...recordIds])]
    await database.pendingActions.put({
      id,
      accountId,
      kind: 'purge_history',
      createdAt: pendente?.createdAt ?? new Date().toISOString(),
      recordIds: juntos,
    })
  })

  return { local, queued: recordIds.length }
}

/** Registros à espera do expurgo no serviço, se houver. */
export async function pendingRemotePurge(accountId: string, database: ApoioDatabase = db): Promise<string[]> {
  const pendente = await database.pendingActions.get(pendingActionId(accountId, 'purge_history'))
  return pendente?.recordIds ?? []
}

/** Tira da fila o que o serviço já apagou. */
export async function clearRemotePurge(accountId: string, apagados: string[], database: ApoioDatabase = db): Promise<void> {
  const id = pendingActionId(accountId, 'purge_history')
  const pendente = await database.pendingActions.get(id)
  if (!pendente) return
  const restantes = (pendente.recordIds ?? []).filter((recordId) => !apagados.includes(recordId))
  if (restantes.length === 0) { await database.pendingActions.delete(id); return }
  await database.pendingActions.put({ ...pendente, recordIds: restantes })
}
