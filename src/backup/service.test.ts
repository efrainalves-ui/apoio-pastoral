import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { decryptPayload, encryptPayload, generateMasterKey } from '../crypto/vault'
import { ApoioDatabase } from '../db/database'
import { BackupService } from './service'

const databases: ApoioDatabase[] = []
afterEach(async () => { localStorage.clear(); await Promise.all(databases.splice(0).map((database) => database.delete())) })

async function seed(database: ApoioDatabase, accountId: string, key: CryptoKey, id: string, name: string) {
  await database.vaultRecords.put({ id, accountId, recordType: 'district', version: 1, createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z', ...(await encryptPayload(key, { schemaVersion: 1, type: 'district', data: { name } }, id)) })
}

describe('backup protegido e isolado por conta', () => {
  it('restaura na mesma conta, recusa código errado e não persiste texto legível', async () => {
    const source = new ApoioDatabase(`backup-source-${crypto.randomUUID()}`); const target = new ApoioDatabase(`backup-target-${crypto.randomUUID()}`); databases.push(source, target)
    const sourceKey = await generateMasterKey(); const targetKey = await generateMasterKey(); const accountId = 'conta-ficticia-a'
    await seed(source, accountId, sourceKey, 'district-fixture', 'Distrito Fictício')
    const file = (await new BackupService(source).create(accountId, sourceKey, 'codigo-ficticio-123')).file
    await expect(new BackupService(target).restore(accountId, targetKey, 'codigo-errado-123', file)).rejects.toThrow()
    expect(await target.vaultRecords.count()).toBe(0)
    await new BackupService(target).restore(accountId, targetKey, 'codigo-ficticio-123', file)
    const restored = await target.vaultRecords.get('district-fixture')
    expect(restored && await decryptPayload(targetKey, restored)).toMatchObject({ data: { name: 'Distrito Fictício' } })
    expect(JSON.stringify(await target.vaultRecords.toArray())).not.toContain('Distrito Fictício')
  })

  it('recusa restauração em outra conta sem gravar registros', async () => {
    const source = new ApoioDatabase(`backup-account-source-${crypto.randomUUID()}`); const target = new ApoioDatabase(`backup-account-target-${crypto.randomUUID()}`); databases.push(source, target)
    const key = await generateMasterKey(); await seed(source, 'conta-ficticia-a', key, 'fixture-a', 'Distrito Fictício A')
    const file = (await new BackupService(source).create('conta-ficticia-a', key, 'codigo-ficticio-123')).file
    await expect(new BackupService(target).restore('conta-ficticia-b', await generateMasterKey(), 'codigo-ficticio-123', file)).rejects.toThrow('outra conta')
    expect(await target.vaultRecords.count()).toBe(0)
  })

  it('não deixa restauração parcial quando um registro conflita com outra conta', async () => {
    const source = new ApoioDatabase(`backup-atomic-source-${crypto.randomUUID()}`); const target = new ApoioDatabase(`backup-atomic-target-${crypto.randomUUID()}`); databases.push(source, target)
    const sourceKey = await generateMasterKey(); const targetKey = await generateMasterKey()
    await seed(source, 'conta-ficticia-a', sourceKey, 'fixture-livre', 'Distrito Fictício Livre')
    await seed(source, 'conta-ficticia-a', sourceKey, 'fixture-conflito', 'Distrito Fictício Conflito')
    await seed(target, 'conta-ficticia-b', targetKey, 'fixture-conflito', 'Outro Distrito Fictício')
    const file = (await new BackupService(source).create('conta-ficticia-a', sourceKey, 'codigo-ficticio-123')).file
    await expect(new BackupService(target).restore('conta-ficticia-a', targetKey, 'codigo-ficticio-123', file)).rejects.toThrow()
    expect(await target.vaultRecords.get('fixture-livre')).toBeUndefined()
    expect((await target.vaultRecords.get('fixture-conflito'))?.accountId).toBe('conta-ficticia-b')
  })
})
