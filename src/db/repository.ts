import type { CipherEnvelope } from '../crypto/types'
import { isSyncDisabled } from '../sync/config'
import { db, type ApoioDatabase } from './database'
import type { OutboxRecord, VaultRecord } from './types'

type VaultRecordType = VaultRecord['recordType']

export interface EncryptedMutation {
  recordId: string
  envelope: CipherEnvelope
  recordType: VaultRecordType
  operation?: 'upsert' | 'delete'
}

export class VaultRepository {
  constructor(private readonly database: ApoioDatabase = db) {}

  async saveEncrypted(
    accountId: string,
    deviceId: string,
    recordId: string,
    envelope: CipherEnvelope,
    recordType: VaultRecordType = 'foundation_fixture',
  ): Promise<VaultRecord> {
    return (await this.applyEncryptedMutations(accountId, deviceId, [{ recordId, envelope, recordType }]))[0]!
  }

  async deleteEncrypted(
    accountId: string,
    deviceId: string,
    recordId: string,
    tombstone: CipherEnvelope,
  ): Promise<void> {
    const existing = await this.database.vaultRecords.get(recordId)
    if (!existing) throw new Error('Registro não encontrado.')
    await this.applyEncryptedMutations(accountId, deviceId, [{ recordId, envelope: tombstone, recordType: existing.recordType, operation: 'delete' }])
  }

  async applyEncryptedMutations(accountId: string, deviceId: string, mutations: EncryptedMutation[]): Promise<VaultRecord[]> {
    if (mutations.length === 0) return []
    if (new Set(mutations.map(({ recordId }) => recordId)).size !== mutations.length) throw new Error('Uma operação em lote não pode repetir o mesmo registro.')
    const existingRecords = await this.database.vaultRecords.bulkGet(mutations.map(({ recordId }) => recordId))
    const now = new Date().toISOString()
    const records: VaultRecord[] = []
    const operations: OutboxRecord[] = []

    mutations.forEach((mutation, index) => {
      const existing = existingRecords[index]
      if (existing && existing.accountId !== accountId) throw new Error('Registro pertence a outra conta.')
      if (mutation.operation === 'delete' && (!existing || existing.deletedAt)) throw new Error('Registro não encontrado.')
      const version = (existing?.version ?? 0) + 1
      const deletedAt = mutation.operation === 'delete' ? now : undefined
      const record: VaultRecord = {
        id: mutation.recordId,
        accountId,
        recordType: mutation.recordType,
        version,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        ...mutation.envelope,
        ...(deletedAt ? { deletedAt } : {}),
      }
      records.push(record)
      operations.push({
        id: crypto.randomUUID(),
        accountId,
        deviceId,
        recordId: mutation.recordId,
        operation: mutation.operation ?? 'upsert',
        baseVersion: existing?.version ?? 0,
        recordVersion: version,
        payload: mutation.envelope,
        schemaVersion: 1,
        status: 'pending',
        attemptCount: 0,
        createdAt: now,
      })
    })

    if (isSyncDisabled) await this.database.vaultRecords.bulkPut(records)
    else {
      await this.database.transaction('rw', this.database.vaultRecords, this.database.outbox, async () => {
        await this.database.vaultRecords.bulkPut(records)
        await this.database.outbox.bulkPut(operations)
      })
    }
    return records
  }

  async list(accountId: string, recordType?: VaultRecordType): Promise<VaultRecord[]> {
    const records = await this.database.vaultRecords.where('accountId').equals(accountId).filter((record) => !record.deletedAt).toArray()
    if (!recordType) return records
    // O que chega de outro aparelho vem sem tipo: descobri-lo exigiria abrir o
    // conteúdo cifrado, e a sincronização não tem a chave — nem deve ter. Esses
    // registros entram na lista com o tipo pedido, e quem chamou os descarta ao
    // conferir o tipo do payload já decifrado. Sem isso eles ficariam guardados
    // e invisíveis, o que para o pastor é indistinguível de perda de dados.
    return records.filter((record) => record.recordType === recordType || record.recordType === 'encrypted')
  }
}
