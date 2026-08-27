import { afterEach, describe, expect, it } from 'vitest'
import { encryptPayload, generateMasterKey } from '../crypto/vault'
import { ApoioDatabase } from './database'
import { VaultRepository } from './repository'

describe('banco local cifrado', () => {
  const databases: ApoioDatabase[] = []
  afterEach(async () => Promise.all(databases.map((database) => database.delete())))

  it('persiste somente o envelope cifrado e cria uma operação de outbox', async () => {
    const database = new ApoioDatabase(`test-${crypto.randomUUID()}`)
    databases.push(database)
    const repository = new VaultRepository(database)
    const key = await generateMasterKey()
    const accountId = crypto.randomUUID()
    const deviceId = crypto.randomUUID()
    const recordId = crypto.randomUUID()
    const forbiddenPlaintext = 'segredo fictício que não pode aparecer'
    const envelope = await encryptPayload(key, { schemaVersion: 1, type: 'foundation_fixture', data: forbiddenPlaintext }, recordId)

    await repository.saveEncrypted(accountId, deviceId, recordId, envelope)

    const storedRecord = await database.vaultRecords.get(recordId)
    const queuedOperation = await database.outbox.where('recordId').equals(recordId).first()
    expect(storedRecord).toBeDefined()
    expect(queuedOperation).toBeDefined()
    expect(JSON.stringify(storedRecord)).not.toContain(forbiddenPlaintext)
    expect(JSON.stringify(queuedOperation)).not.toContain(forbiddenPlaintext)
    expect(queuedOperation?.payload.ciphertext).toBe(envelope.ciphertext)
  })

  it('isola listagem e mutação por conta', async () => {
    const database = new ApoioDatabase(`test-${crypto.randomUUID()}`)
    databases.push(database)
    const repository = new VaultRepository(database)
    const key = await generateMasterKey()
    const firstAccount = crypto.randomUUID()
    const secondAccount = crypto.randomUUID()
    const firstRecord = crypto.randomUUID()
    const secondRecord = crypto.randomUUID()
    const deviceId = crypto.randomUUID()

    await repository.saveEncrypted(firstAccount, deviceId, firstRecord, await encryptPayload(key, { schemaVersion: 1, type: 'foundation_fixture', data: 'registro fictício A' }, firstRecord))
    await repository.saveEncrypted(secondAccount, deviceId, secondRecord, await encryptPayload(key, { schemaVersion: 1, type: 'foundation_fixture', data: 'registro fictício B' }, secondRecord))

    expect((await repository.list(firstAccount)).map(({ id }) => id)).toEqual([firstRecord])
    expect((await repository.list(secondAccount)).map(({ id }) => id)).toEqual([secondRecord])

    await expect(repository.saveEncrypted(secondAccount, deviceId, firstRecord, await encryptPayload(key, { schemaVersion: 1, type: 'foundation_fixture', data: 'tentativa fictícia' }, firstRecord))).rejects.toThrow('Registro pertence a outra conta.')
  })
})
