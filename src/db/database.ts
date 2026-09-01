import Dexie, { type EntityTable } from 'dexie'
import type {
  AccountRecord,
  DeviceRecord,
  KeyEnvelopeRecord,
  MigrationRecord,
  OutboxRecord,
  SyncStateRecord,
  SyncConflictRecord,
  VaultRecord,
} from './types'

export class ApoioDatabase extends Dexie {
  accounts!: EntityTable<AccountRecord, 'id'>
  keyEnvelopes!: EntityTable<KeyEnvelopeRecord, 'id'>
  devices!: EntityTable<DeviceRecord, 'id'>
  vaultRecords!: EntityTable<VaultRecord, 'id'>
  outbox!: EntityTable<OutboxRecord, 'id'>
  syncState!: EntityTable<SyncStateRecord, 'accountId'>
  syncConflicts!: EntityTable<SyncConflictRecord, 'id'>
  migrationHistory!: EntityTable<MigrationRecord, 'id'>

  constructor(name = 'apoio-pastoral') {
    super(name)

    this.version(1).stores({
      accounts: 'id, &email, createdAt',
      keyEnvelopes: 'id, accountId, updatedAt',
      devices: 'id, accountId, status, createdAt',
      vaultRecords: 'id, accountId, recordType, version, updatedAt, deletedAt',
      outbox: 'id, accountId, deviceId, recordId, status, createdAt',
      syncState: 'accountId, lastSyncedAt',
      migrationHistory: 'id, version, appliedAt',
    }).upgrade(async (transaction) => {
      await transaction.table('migrationHistory').put({
        id: 'local-0001-initial',
        version: 1,
        appliedAt: new Date().toISOString(),
        checksum: 'sha256:marco0-local-schema-v1',
      })
    })

    this.version(2).stores({
      accounts: 'id, &email, createdAt',
      keyEnvelopes: 'id, accountId, updatedAt',
      devices: 'id, accountId, status, createdAt',
      vaultRecords: 'id, accountId, recordType, version, updatedAt, deletedAt',
      outbox: 'id, accountId, deviceId, recordId, status, createdAt',
      syncState: 'accountId, lastSyncedAt',
      migrationHistory: 'id, version, appliedAt',
    }).upgrade(async (transaction) => {
      await transaction.table('migrationHistory').put({
        id: 'local-0002-private-people-imports',
        version: 2,
        appliedAt: new Date().toISOString(),
        checksum: 'sha256:v1-people-families-imports-ciphertext',
      })
    })

    this.version(3).stores({
      accounts: 'id, &email, createdAt',
      keyEnvelopes: 'id, accountId, updatedAt',
      devices: 'id, accountId, status, createdAt',
      vaultRecords: 'id, accountId, recordType, version, updatedAt, deletedAt',
      outbox: 'id, accountId, deviceId, recordId, status, createdAt',
      syncState: 'accountId, lastSyncedAt',
      migrationHistory: 'id, version, appliedAt',
    }).upgrade(async (transaction) => {
      await transaction.table('migrationHistory').put({
        id: 'local-0003-fidelity-precision',
        version: 3,
        appliedAt: new Date().toISOString(),
        checksum: 'sha256:fidelity-exact-range-category-ciphertext',
      })
    })

    this.version(4).stores({
      accounts: 'id, &email, createdAt', keyEnvelopes: 'id, accountId, updatedAt', devices: 'id, accountId, status, createdAt', vaultRecords: 'id, accountId, recordType, version, updatedAt, deletedAt', outbox: 'id, accountId, deviceId, recordId, status, createdAt', syncState: 'accountId, lastSyncedAt', migrationHistory: 'id, version, appliedAt',
    }).upgrade(async (transaction) => {
      await transaction.table('migrationHistory').put({ id: 'local-0004-encrypted-agenda', version: 4, appliedAt: new Date().toISOString(), checksum: 'sha256:v1-agenda-ciphertext-only' })
    })

    this.version(5).stores({
      accounts: 'id, &email, createdAt', keyEnvelopes: 'id, accountId, updatedAt', devices: 'id, accountId, status, createdAt', vaultRecords: 'id, accountId, recordType, version, updatedAt, deletedAt', outbox: 'id, accountId, deviceId, recordId, status, createdAt', syncState: 'accountId, lastSyncedAt', migrationHistory: 'id, version, appliedAt',
    }).upgrade(async (transaction) => {
      await transaction.table('migrationHistory').put({ id: 'local-0005-encrypted-pastoral-care', version: 5, appliedAt: new Date().toISOString(), checksum: 'sha256:v1-visits-interviews-care-rounds-ciphertext' })
    })

    this.version(6).stores({
      accounts: 'id, &email, createdAt', keyEnvelopes: 'id, accountId, updatedAt', devices: 'id, accountId, status, createdAt', vaultRecords: 'id, accountId, recordType, version, updatedAt, deletedAt', outbox: 'id, accountId, deviceId, recordId, status, createdAt', syncState: 'accountId, lastSyncedAt', migrationHistory: 'id, version, appliedAt',
    }).upgrade(async (transaction) => {
      await transaction.table('migrationHistory').put({ id: 'local-0006-fidelity-classification', version: 6, appliedAt: new Date().toISOString(), checksum: 'sha256:fidelity-tither-category-v3-ciphertext' })
    })

    this.version(7).stores({
      accounts: 'id, &email, createdAt', keyEnvelopes: 'id, accountId, updatedAt', devices: 'id, accountId, status, createdAt', vaultRecords: 'id, accountId, recordType, version, updatedAt, deletedAt', outbox: 'id, accountId, deviceId, recordId, status, createdAt', syncState: 'accountId, lastSyncedAt', migrationHistory: 'id, version, appliedAt',
    }).upgrade(async (transaction) => {
      await transaction.table('migrationHistory').put({ id: 'local-0007-encrypted-sermons', version: 7, appliedAt: new Date().toISOString(), checksum: 'sha256:v1-sermons-history-ciphertext-only' })
    })

    this.version(8).stores({ accounts: 'id, &email, createdAt', keyEnvelopes: 'id, accountId, updatedAt', devices: 'id, accountId, status, createdAt', vaultRecords: 'id, accountId, recordType, version, updatedAt, deletedAt', outbox: 'id, accountId, deviceId, recordId, status, createdAt', syncState: 'accountId, lastSyncedAt', migrationHistory: 'id, version, appliedAt' }).upgrade(async (transaction) => { await transaction.table('migrationHistory').put({ id: 'local-0008-encrypted-goals', version: 8, appliedAt: new Date().toISOString(), checksum: 'sha256:v1-goals-ciphertext-only' }) })

    this.version(9).stores({ accounts: 'id, &email, createdAt', keyEnvelopes: 'id, accountId, updatedAt', devices: 'id, accountId, status, createdAt', vaultRecords: 'id, accountId, recordType, version, updatedAt, deletedAt', outbox: 'id, accountId, deviceId, recordId, status, createdAt', syncState: 'accountId, lastSyncedAt', syncConflicts: 'id, accountId, recordId, status, createdAt', migrationHistory: 'id, version, appliedAt' }).upgrade(async (transaction) => { await transaction.table('migrationHistory').put({ id: 'local-0009-encrypted-sync-conflicts', version: 9, appliedAt: new Date().toISOString(), checksum: 'sha256:encrypted-conflict-preservation-v1' }) })

    // Uma conta por navegador deixou de ser regra: o cofre local passa a ser
    // endereçado por conta, para duas contas no mesmo aparelho não sobrescreverem
    // o envelope uma da outra.
    this.version(10).stores({ accounts: 'id, &email, createdAt', keyEnvelopes: 'id, accountId, kind, updatedAt', devices: 'id, accountId, status, createdAt', vaultRecords: 'id, accountId, recordType, version, updatedAt, deletedAt', outbox: 'id, accountId, deviceId, recordId, status, createdAt', syncState: 'accountId, lastSyncedAt', syncConflicts: 'id, accountId, recordId, status, createdAt', migrationHistory: 'id, version, appliedAt' }).upgrade(async (transaction) => {
      const tabela = transaction.table('keyEnvelopes')
      const antigos = await tabela.toArray() as Array<{ id: string; accountId: string; envelope: unknown; updatedAt: string }>
      for (const registro of antigos) {
        if (registro.id !== 'password' && registro.id !== 'recovery') continue
        await tabela.delete(registro.id)
        await tabela.put({ ...registro, id: `${registro.accountId}:${registro.id}`, kind: registro.id })
      }
      await transaction.table('migrationHistory').put({ id: 'local-0010-multi-account-vault', version: 10, appliedAt: new Date().toISOString(), checksum: 'sha256:key-envelopes-scoped-by-account' })
    })
  }
}

export const db = new ApoioDatabase()
