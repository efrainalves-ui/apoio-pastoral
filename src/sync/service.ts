import { remoteAccountGuard, type AccountSessionGuard } from '../auth/accountGuard'
import { assertDeviceCanSync, assertRemoteDeviceStillActive, type RemoteDeviceStatusReader } from '../auth/device'
import { fetchRemoteDeviceStatus, purgeRemoteRecordHistory, PURGE_BATCH_SIZE, type PurgeTarget } from '../auth/supabase'
import { db, type ApoioDatabase } from '../db/database'
import { clearRemotePurge, pendingRemotePurge } from '../db/purge'
import { pendingActionId } from '../db/types'
import type { OutboxRecord, QuarantinedOperationRecord, SyncConflictRecord, VaultRecord } from '../db/types'
import { operationMacIsValid, withOperationMac } from './operationMac'
import type { EncryptedOperation, SyncSummary, SyncTransport } from './types'

/**
 * Trava de segurança contra um serviço que diz ter mais página para sempre, e
 * nada mais. O recebimento normal termina quando o serviço não tem mais nada,
 * quantas páginas forem necessárias: parar antes disso deixava o aparelho
 * achando que estava em dia com o distrito pela metade.
 */
const MAX_PAGES = 10_000

function toOperation(record: OutboxRecord): EncryptedOperation {
  return {
    id: record.id,
    ownerId: record.accountId,
    deviceId: record.deviceId,
    recordId: record.recordId,
    operation: record.operation,
    baseVersion: record.baseVersion,
    recordVersion: record.recordVersion,
    schemaVersion: record.schemaVersion,
    payload: record.payload,
    createdAt: record.createdAt,
  }
}

function sameEnvelope(left: EncryptedOperation['payload'], right: VaultRecord): boolean {
  return left.ciphertext === right.ciphertext && left.iv === right.iv && left.aad === right.aad && left.keyVersion === right.keyVersion
}

function conflictRecord(accountId: string, operation: EncryptedOperation, localVersion: number): SyncConflictRecord {
  return { id: operation.id, accountId, recordId: operation.recordId, localVersion, remoteVersion: operation.recordVersion, remoteOperation: operation.operation, remotePayload: operation.payload, createdAt: operation.createdAt, status: 'pending' }
}

function quarantineRecord(accountId: string, operation: EncryptedOperation, reason: QuarantinedOperationRecord['reason']): QuarantinedOperationRecord {
  return {
    id: operation.id,
    accountId,
    recordId: operation.recordId,
    reason,
    operation: operation.operation,
    recordVersion: operation.recordVersion,
    baseVersion: operation.baseVersion,
    payload: operation.payload,
    createdAt: operation.createdAt,
  }
}

export class SyncService {
  constructor(
    private readonly transport: SyncTransport,
    private readonly database: ApoioDatabase = db,
    private readonly online: () => boolean = () => navigator.onLine,
    private readonly readRemoteDeviceStatus: RemoteDeviceStatusReader = fetchRemoteDeviceStatus,
    private readonly purgeRemoteHistory: (targets: PurgeTarget[]) => Promise<string[] | null> = purgeRemoteRecordHistory,
    /**
     * Conferência de que a sessão aberta no serviço ainda é a desta conta.
     *
     * Com duas contas no mesmo navegador, a sessão é compartilhada entre as
     * abas: entrar como B em uma aba faz a aba que mostra A sincronizar contra
     * a conta B. As lápides, o expurgo e a fila de envio de A iam para B, e o
     * que voltava era o conteúdo de B guardado como se fosse de A.
     */
    private readonly guard: AccountSessionGuard = remoteAccountGuard,
  ) {}

  /**
   * `syncKey` autentica os metadados das operações. Sem ela — cofre trancado —
   * a sincronização não roda: aplicar o que chega sem conferir a assinatura
   * devolveria ao serviço o poder de trocar uma gravação por uma exclusão.
   */
  async synchronize(accountId: string, deviceId: string, syncKey: CryptoKey): Promise<SyncSummary> {
    await assertDeviceCanSync(accountId, deviceId, this.database)
    if (!this.online()) {
      return {
        status: 'offline', pushed: 0, pulled: 0, conflicts: 0, quarantined: 0, incomplete: false,
        purgePending: (await pendingRemotePurge(accountId, this.database)).length > 0,
        pushPending: await this.database.outbox.where('accountId').equals(accountId).filter(({ status }) => status === 'pending').count() > 0,
      }
    }
    // Antes de tudo: a sessão aberta no serviço é mesmo a desta conta? Se outra
    // conta entrou em outra aba, esta aba não fala com o serviço nunca mais até
    // um novo acesso.
    await this.guard(accountId)
    // Restauração pela metade não sobe. Metade de um backup publicada para os
    // outros aparelhos é pior do que backup nenhum: eles receberiam um estado
    // que nunca existiu, e a lápide que faltasse chegaria depois, ou nunca.
    if (await this.database.pendingActions.get(pendingActionId(accountId, 'restore_backup'))) {
      throw new Error('Há uma restauração de backup pela metade neste aparelho. Conclua a restauração antes de sincronizar.')
    }
    // Antes de enviar e antes de receber: só o serviço sabe se outro aparelho
    // revogou este aqui.
    await assertRemoteDeviceStillActive(accountId, deviceId, this.database, this.readRemoteDeviceStatus)

    const pending = await this.database.outbox.where('accountId').equals(accountId).filter(({ status }) => status === 'pending').toArray()
    const assinadas = await Promise.all(pending.map(async (record) => withOperationMac(syncKey, toOperation(record))))
    const pushResult = await this.transport.push(assinadas)

    await this.database.transaction('rw', this.database.outbox, this.database.vaultRecords, this.database.syncConflicts, async () => {
      await this.database.outbox.bulkDelete(pushResult.acceptedIds)
      for (const operation of pushResult.conflicts) {
        const existing = await this.database.vaultRecords.get(operation.recordId)
        await this.database.syncConflicts.put(conflictRecord(accountId, operation, existing?.version ?? 0))
      }
    })

    // Depois do envio e antes do recebimento: a lápide da exclusão já subiu, e
    // é só a partir daí que dá para apagar o histórico daquele registro sem
    // deixar os outros aparelhos sem saber da remoção.
    const aExpurgar = await pendingRemotePurge(accountId, this.database)
    if (aExpurgar.length > 0) {
      try {
        // Em lotes, porque o serviço tem teto por chamada e uma exclusão de
        // pessoa com muitos vínculos passa dele com facilidade.
        for (let inicio = 0; inicio < aExpurgar.length; inicio += PURGE_BATCH_SIZE) {
          const lote = aExpurgar.slice(inicio, inicio + PURGE_BATCH_SIZE)
          const apagados = await this.purgeRemoteHistory(lote)
          // `null` é ausência de serviço remoto: nada a limpar da fila. Uma
          // lista menor do que o lote são registros com alteração concorrente,
          // que continuam pendentes de propósito.
          if (apagados) await clearRemotePurge(accountId, apagados, this.database)
        }
      } catch {
        // Sem rede ou serviço recusando: a fila permanece e a próxima
        // sincronização tenta de novo. Nunca é descartada em silêncio.
      }
    }

    let recebidas = 0
    let conflitos = 0
    let quarentena = 0
    let incompleto = false
    let cursor = (await this.database.syncState.get(accountId))?.cursor ?? null

    // Página por página até o serviço não ter mais nada. Parar antes disso
    // deixaria para trás tudo que passasse do limite, e o aparelho seguiria
    // achando que estava em dia.
    for (let pagina = 0; pagina < MAX_PAGES; pagina += 1) {
      const cursorAnterior = cursor
      const pullResult = await this.transport.pull(accountId, cursor)
      if (pullResult.operations.some((operation) => operation.ownerId !== accountId)) {
        throw new Error('A sincronização recebeu dados de outra conta e foi interrompida.')
      }

      const conferidas: Array<{ operation: EncryptedOperation; valida: boolean }> = await Promise.all(
        pullResult.operations.map(async (operation) => ({ operation, valida: await operationMacIsValid(syncKey, operation) })),
      )

      const resultado = await this.aplicar(accountId, conferidas)
      recebidas += resultado.aplicadas
      conflitos += resultado.conflitos
      quarentena += resultado.quarentena
      cursor = pullResult.cursor

      await this.database.syncState.put({
        accountId,
        cursor,
        lastSyncedAt: new Date().toISOString(),
        firstSyncAt: (await this.database.syncState.get(accountId))?.firstSyncAt ?? null,
      })

      if (!pullResult.hasMore || pullResult.operations.length === 0) break
      // Serviço que diz ter mais página sem mover o cursor não vai terminar
      // nunca. Parar aqui é a saída certa, e a conta não está em dia.
      if (pullResult.cursor === cursorAnterior) { incompleto = true; break }
      // Última volta permitida e o serviço ainda tem página.
      if (pagina === MAX_PAGES - 1) incompleto = true
    }

    // `firstSyncAt` é o que autoriza o aplicativo a acreditar em uma lista
    // vazia. Uma rodada que não chegou ao fim não pode carimbá-lo: era assim
    // que um distrito grande virava "conta vazia" e o pastor era mandado criar
    // um segundo distrito por cima do primeiro.
    const estado = await this.database.syncState.get(accountId)
    await this.database.syncState.put({
      accountId,
      cursor,
      lastSyncedAt: new Date().toISOString(),
      firstSyncAt: estado?.firstSyncAt ?? (incompleto ? null : new Date().toISOString()),
    })

    // O que sobrou na fila de envio e o que sobrou na fila de expurgo dizem, os
    // dois, a mesma coisa: esta rodada não terminou o trabalho. Nenhum dos dois
    // pode virar "Dados atualizados" na tela.
    const aindaPorEnviar = await this.database.outbox.where('accountId').equals(accountId).filter(({ status }) => status === 'pending').count()
    const aindaPorExpurgar = (await pendingRemotePurge(accountId, this.database)).length

    return {
      status: !incompleto && pending.length === 0 && recebidas === 0 && conflitos === 0 ? 'empty' : 'synced',
      pushed: pushResult.acceptedIds.length,
      pulled: recebidas,
      conflicts: pushResult.conflicts.length + conflitos,
      quarantined: quarentena,
      incomplete: incompleto,
      purgePending: aindaPorExpurgar > 0,
      pushPending: aindaPorEnviar > 0,
    }
  }

  /**
   * Aplica o que chegou, e só o que dá para aplicar sem apagar trabalho.
   *
   * A regra é a linhagem: uma operação só entra por cima do registro local
   * quando ela foi feita justamente em cima da versão que este aparelho tem.
   * Qualquer outra combinação vira conflito com as duas versões guardadas — o
   * pastor escolhe depois. Antes, versão maior sobrescrevia sem perguntar, e
   * uma edição local ainda não enviada sumia sem deixar rastro.
   */
  private async aplicar(
    accountId: string,
    recebidas: Array<{ operation: EncryptedOperation; valida: boolean }>,
  ): Promise<{ aplicadas: number; conflitos: number; quarentena: number }> {
    let aplicadas = 0
    let conflitos = 0
    let quarentena = 0

    await this.database.transaction('rw', this.database.vaultRecords, this.database.syncConflicts, this.database.quarantine, async () => {
      for (const { operation, valida } of recebidas) {
        if (!valida) {
          await this.database.quarantine.put(quarantineRecord(accountId, operation, 'assinatura'))
          quarentena += 1
          continue
        }
        const existing = await this.database.vaultRecords.get(operation.recordId)

        if (existing && existing.accountId !== accountId) {
          await this.database.quarantine.put(quarantineRecord(accountId, operation, 'conta'))
          quarentena += 1
          continue
        }

        // Eco da própria operação, que volta do serviço depois do envio.
        if (existing && existing.version === operation.recordVersion && sameEnvelope(operation.payload, existing)) continue

        const linhagemBate = !existing || existing.version === operation.baseVersion
        if (!linhagemBate) {
          await this.database.syncConflicts.put(conflictRecord(accountId, operation, existing.version))
          conflitos += 1
          continue
        }

        const remoteRecord: VaultRecord = {
          id: operation.recordId,
          accountId,
          recordType: existing?.recordType ?? 'encrypted',
          version: operation.recordVersion,
          createdAt: existing?.createdAt ?? operation.createdAt,
          updatedAt: operation.createdAt,
          ...operation.payload,
          ...(operation.operation === 'delete' ? { deletedAt: operation.createdAt } : {}),
        }
        await this.database.vaultRecords.put(remoteRecord)
        aplicadas += 1
      }
    })

    return { aplicadas, conflitos, quarentena }
  }
}

/**
 * Uma rodada só conta como confirmada quando ela realmente terminou.
 *
 * Enquanto `firstSyncAt` estiver vazio, uma lista vazia não prova conta vazia,
 * e qualquer outro desfecho — offline, erro, cancelamento, páginas faltando ou
 * cursor parado — significa a mesma coisa: ainda não sabemos. Antes só a
 * paginação incompleta era tratada assim, e uma rodada offline seguia adiante
 * como se tivesse recebido tudo.
 */
export function syncConfirmed(summary: SyncSummary): boolean {
  return summary.status !== 'offline'
    && !summary.incomplete
    && !summary.pushPending
    && !summary.purgePending
}

/** O que impede esta rodada de contar como concluída, em uma frase. */
export function syncPendingReason(summary: SyncSummary): string | null {
  if (summary.status === 'offline') return 'Sem conexão: nada foi enviado nem recebido nesta tentativa.'
  if (summary.incomplete) return 'Ainda há alterações para receber: esta rodada não chegou ao fim. Sincronize de novo até este aviso sumir.'
  if (summary.pushPending) return 'Ainda há alterações deste aparelho esperando para subir. Sincronize de novo.'
  if (summary.purgePending) return 'Ainda há histórico apagado esperando para sair do serviço. Sincronize de novo até este aviso sumir.'
  return null
}

/**
 * Verdadeiro quando este aparelho ainda não concluiu nenhuma sincronização
 * desta conta. Enquanto for verdadeiro, uma lista vazia não prova nada.
 */
export async function firstSyncPending(accountId: string, database: ApoioDatabase = db): Promise<boolean> {
  const estado = await database.syncState.get(accountId)
  return !estado?.firstSyncAt
}
