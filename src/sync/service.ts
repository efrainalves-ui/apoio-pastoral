import { assertDeviceCanSync, assertRemoteDeviceStillActive, type RemoteDeviceStatusReader } from '../auth/device'
import { fetchRemoteDeviceStatus } from '../auth/supabase'
import { db, type ApoioDatabase } from '../db/database'
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
  ) {}

  /**
   * `syncKey` autentica os metadados das operações. Sem ela — cofre trancado —
   * a sincronização não roda: aplicar o que chega sem conferir a assinatura
   * devolveria ao serviço o poder de trocar uma gravação por uma exclusão.
   */
  async synchronize(accountId: string, deviceId: string, syncKey: CryptoKey): Promise<SyncSummary> {
    await assertDeviceCanSync(accountId, deviceId, this.database)
    if (!this.online()) return { status: 'offline', pushed: 0, pulled: 0, conflicts: 0, quarantined: 0, incomplete: false }
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

    return {
      status: !incompleto && pending.length === 0 && recebidas === 0 && conflitos === 0 ? 'empty' : 'synced',
      pushed: pushResult.acceptedIds.length,
      pulled: recebidas,
      conflicts: pushResult.conflicts.length + conflitos,
      quarantined: quarentena,
      incomplete: incompleto,
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
 * Verdadeiro quando este aparelho ainda não concluiu nenhuma sincronização
 * desta conta. Enquanto for verdadeiro, uma lista vazia não prova nada.
 */
export async function firstSyncPending(accountId: string, database: ApoioDatabase = db): Promise<boolean> {
  const estado = await database.syncState.get(accountId)
  return !estado?.firstSyncAt
}
