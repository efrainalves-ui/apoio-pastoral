import { assertDeviceCanSync, assertRemoteDeviceStillActive, type RemoteDeviceStatusReader } from '../auth/device'
import { fetchRemoteDeviceStatus } from '../auth/supabase'
import { db, type ApoioDatabase } from '../db/database'
import type { OutboxRecord, SyncConflictRecord, VaultRecord } from '../db/types'
import type { EncryptedOperation, SyncSummary, SyncTransport } from './types'

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

export class SyncService {
  constructor(
    private readonly transport: SyncTransport,
    private readonly database: ApoioDatabase = db,
    private readonly online: () => boolean = () => navigator.onLine,
    private readonly readRemoteDeviceStatus: RemoteDeviceStatusReader = fetchRemoteDeviceStatus,
  ) {}

  async synchronize(accountId: string, deviceId: string): Promise<SyncSummary> {
    await assertDeviceCanSync(accountId, deviceId, this.database)
    if (!this.online()) return { status: 'offline', pushed: 0, pulled: 0, conflicts: 0 }
    // Antes de enviar e antes de receber: só o serviço sabe se outro aparelho
    // revogou este aqui.
    await assertRemoteDeviceStillActive(accountId, deviceId, this.database, this.readRemoteDeviceStatus)

    const pending = await this.database.outbox.where('accountId').equals(accountId).filter(({ status }) => status === 'pending').toArray()
    const state = await this.database.syncState.get(accountId)
    const pushResult = await this.transport.push(pending.map(toOperation))
    const pullResult = await this.transport.pull(accountId, state?.cursor ?? null)
    if (pullResult.operations.some((operation) => operation.ownerId !== accountId)) throw new Error('A sincronização recebeu dados de outra conta e foi interrompida.')

    let detectedConflicts = 0

    await this.database.transaction('rw', this.database.outbox, this.database.vaultRecords, this.database.syncState, this.database.syncConflicts, async () => {
      await this.database.outbox.bulkDelete(pushResult.acceptedIds)
      for (const operation of pushResult.conflicts) {
        const existing = await this.database.vaultRecords.get(operation.recordId)
        await this.database.syncConflicts.put(conflictRecord(accountId, operation, existing?.version ?? 0))
      }
      for (const operation of pullResult.operations) {
        const existing = await this.database.vaultRecords.get(operation.recordId)
        if (existing && existing.version > operation.recordVersion) {
          await this.database.syncConflicts.put(conflictRecord(accountId, operation, existing.version)); detectedConflicts += 1; continue
        }
        if (existing && existing.version === operation.recordVersion) {
          if (!sameEnvelope(operation.payload, existing)) {
            await this.database.syncConflicts.put(conflictRecord(accountId, operation, existing.version)); detectedConflicts += 1
          }
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
      }
      await this.database.syncState.put({
        accountId,
        cursor: pullResult.cursor,
        lastSyncedAt: new Date().toISOString(),
      })
    })

    return {
      status: pending.length === 0 && pullResult.operations.length === 0 ? 'empty' : 'synced',
      pushed: pushResult.acceptedIds.length,
      pulled: pullResult.operations.length,
      conflicts: pushResult.conflicts.length + detectedConflicts,
    }
  }
}
