import { afterEach, describe, expect, it } from 'vitest'
import { encryptPayload, generateMasterKey } from '../crypto/vault'
import { ApoioDatabase } from '../db/database'
import { VaultRepository } from '../db/repository'
import type { OutboxRecord } from '../db/types'
import { SyncService } from './service'
import { LocalDevelopmentTransport } from './transport'
import type { EncryptedOperation, PullResult, PushResult, SyncTransport } from './types'

class CaptureTransport implements SyncTransport {
  readonly name = 'local-development' as const
  pushed: EncryptedOperation[] = []
  push(operations: EncryptedOperation[]): Promise<PushResult> {
    this.pushed = operations
    return Promise.resolve({ acceptedIds: operations.map(({ id }) => id), conflicts: [] })
  }
  pull(_ownerId: string, cursor: string | null): Promise<PullResult> {
    return Promise.resolve({ operations: [], cursor })
  }
}

class PullTransport extends CaptureTransport {
  constructor(private readonly result: PullResult) { super() }
  override pull(): Promise<PullResult> { return Promise.resolve(this.result) }
}

describe('sincronização cifrada', () => {
  const databases: ApoioDatabase[] = []
  afterEach(async () => Promise.all(databases.map((database) => database.delete())))

  async function fixture() {
    const database = new ApoioDatabase(`sync-test-${crypto.randomUUID()}`)
    databases.push(database)
    const accountId = crypto.randomUUID()
    const deviceId = crypto.randomUUID()
    const now = new Date().toISOString()
    await database.devices.put({ id: deviceId, accountId, label: 'Dispositivo fictício', status: 'active', createdAt: now, lastSeenAt: now })
    await database.syncState.put({ accountId, cursor: null, lastSyncedAt: null })
    const key = await generateMasterKey()
    const recordId = crypto.randomUUID()
    const plaintext = 'conteúdo fictício nunca enviado'
    const envelope = await encryptPayload(key, { schemaVersion: 1, type: 'foundation_fixture', data: plaintext }, recordId)
    await new VaultRepository(database).saveEncrypted(accountId, deviceId, recordId, envelope)
    return { database, accountId, deviceId, plaintext }
  }

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

  it('mantém a fila intacta enquanto estiver offline', async () => {
    const { database, accountId, deviceId } = await fixture()
    const transport = new CaptureTransport()
    const summary = await new SyncService(transport, database, () => false).synchronize(accountId, deviceId)

    expect(summary.status).toBe('offline')
    expect(await database.outbox.count()).toBe(1)
    expect(transport.pushed).toHaveLength(0)
  })

  it('envia somente envelopes cifrados e remove itens confirmados', async () => {
    const { database, accountId, deviceId, plaintext } = await fixture()
    const transport = new CaptureTransport()
    const summary = await new SyncService(transport, database, () => true).synchronize(accountId, deviceId)

    expect(summary.pushed).toBe(1)
    expect(JSON.stringify(transport.pushed)).not.toContain(plaintext)
    expect(transport.pushed[0]?.payload.ciphertext).toBeTruthy()
    expect(await database.outbox.count()).toBe(0)
  })

  it('isola operações entre duas contas fictícias e mantém conteúdo pastoral fora do transporte', async () => {
    const first = await fixture()
    const second = await fixture()
    const [firstOutbox] = await first.database.outbox.toArray()
    const [secondOutbox] = await second.database.outbox.toArray()
    const transport = new LocalDevelopmentTransport()

    await transport.push([toOperation(firstOutbox!), toOperation(secondOutbox!)])
    const firstPull = await transport.pull(first.accountId, null)
    const secondPull = await transport.pull(second.accountId, null)

    expect(firstPull.operations).toHaveLength(1)
    expect(firstPull.operations[0]?.ownerId).toBe(first.accountId)
    expect(secondPull.operations).toHaveLength(1)
    expect(secondPull.operations[0]?.ownerId).toBe(second.accountId)
    expect(JSON.stringify([...firstPull.operations, ...secondPull.operations]))
      .not.toContain(first.plaintext)
    expect(Object.keys(firstPull.operations[0]!.payload).sort())
      .toEqual(['aad', 'algorithm', 'ciphertext', 'iv', 'keyVersion'])
  })

  it('impede sincronização de dispositivo revogado', async () => {
    const { database, accountId, deviceId } = await fixture()
    await database.devices.update(deviceId, { status: 'revoked', revokedAt: new Date().toISOString() })

    await expect(new SyncService(new CaptureTransport(), database, () => true).synchronize(accountId, deviceId))
      .rejects.toThrow('não está autorizado')
  })

  it('preserva conflito cifrado e não substitui silenciosamente a versão local', async () => {
    const { database, accountId, deviceId, plaintext } = await fixture()
    const local = (await database.vaultRecords.toCollection().first())!
    const remotePayload = await encryptPayload(await generateMasterKey(), { schemaVersion: 1, type: 'foundation_fixture', data: 'outra versão fictícia' }, local.id)
    const operation: EncryptedOperation = { id: crypto.randomUUID(), ownerId: accountId, deviceId: crypto.randomUUID(), recordId: local.id, operation: 'upsert', baseVersion: 0, recordVersion: local.version, schemaVersion: 1, payload: remotePayload, createdAt: '2026-08-02T00:00:00.000Z' }
    const summary = await new SyncService(new PullTransport({ operations: [operation], cursor: `${operation.createdAt}|${operation.id}` }), database, () => true).synchronize(accountId, deviceId)
    expect(summary.conflicts).toBe(1)
    expect((await database.vaultRecords.get(local.id))?.ciphertext).toBe(local.ciphertext)
    const conflict = await database.syncConflicts.get(operation.id)
    expect(conflict?.remotePayload.ciphertext).toBe(remotePayload.ciphertext)
    expect(JSON.stringify(conflict)).not.toContain(plaintext)
    expect(JSON.stringify(conflict)).not.toContain('outra versão fictícia')
  })

  it('interrompe recebimento de operação pertencente a outra conta', async () => {
    const { database, accountId, deviceId } = await fixture()
    const operation: EncryptedOperation = { id: crypto.randomUUID(), ownerId: 'outra-conta-ficticia', deviceId, recordId: crypto.randomUUID(), operation: 'upsert', baseVersion: 0, recordVersion: 1, schemaVersion: 1, payload: await encryptPayload(await generateMasterKey(), { schemaVersion: 1, type: 'foundation_fixture', data: 'registro fictício' }, 'remote-record'), createdAt: '2026-08-02T00:00:00.000Z' }
    await expect(new SyncService(new PullTransport({ operations: [operation], cursor: `${operation.createdAt}|${operation.id}` }), database, () => true).synchronize(accountId, deviceId)).rejects.toThrow('outra conta')
    expect(await database.vaultRecords.get(operation.recordId)).toBeUndefined()
  })

  it('não perde operações com o mesmo horário ao avançar o cursor', async () => {
    const first = await fixture(); const second = await fixture(); const transport = new LocalDevelopmentTransport()
    const firstQueued = (await first.database.outbox.toArray())[0]!; const secondQueued = (await second.database.outbox.toArray())[0]!
    secondQueued.accountId = first.accountId; secondQueued.createdAt = firstQueued.createdAt
    firstQueued.id = '00000000-0000-4000-8000-000000000001'; secondQueued.id = '00000000-0000-4000-8000-000000000002'
    await transport.push([toOperation(firstQueued), toOperation(secondQueued)])
    const initial = await transport.pull(first.accountId, null)
    expect(initial.operations).toHaveLength(2)
    const afterFirst = await transport.pull(first.accountId, `${firstQueued.createdAt}|${firstQueued.id}`)
    expect(afterFirst.operations.map(({ id }) => id)).toContain(secondQueued.id)
  })
})
