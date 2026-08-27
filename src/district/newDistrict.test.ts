import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { BackupService } from '../backup/service'
import { decryptPayload, encryptPayload, generateMasterKey } from '../crypto/vault'
import { ApoioDatabase } from '../db/database'
import { NewDistrictService } from './newDistrict'

const databases: ApoioDatabase[] = []
afterEach(async () => { await Promise.all(databases.map((database) => database.delete())); databases.length = 0 })

async function seed(database: ApoioDatabase, accountId: string, key: CryptoKey, id: string, type: string, data: unknown, recordType: 'district' | 'person' | 'goal' | 'sermon') {
  await database.vaultRecords.put({ id, accountId, recordType, version: 1, createdAt: '2026-08-20T00:00:00.000Z', updatedAt: '2026-08-20T00:00:00.000Z', ...(await encryptPayload(key, { schemaVersion: 1, type, data }, id)) })
}

describe('início seguro de novo distrito', () => {
  it('começa vazio e preserva o backup para a mesma conta em outro dispositivo', async () => {
    const source = new ApoioDatabase(`new-district-source-${crypto.randomUUID()}`); const destination = new ApoioDatabase(`new-district-destination-${crypto.randomUUID()}`); databases.push(source, destination)
    const sourceKey = await generateMasterKey(); const destinationKey = await generateMasterKey()
    await seed(source, 'source-account', sourceKey, 'district-fixture', 'district', { name: 'Distrito Fictício' }, 'district')
    await seed(source, 'source-account', sourceKey, 'person-fixture', 'person', { name: 'Pessoa Fictícia' }, 'person')

    const backup = await new BackupService(source).create('source-account', sourceKey, 'codigo-ficticio-123')
    const result = await new NewDistrictService(source).start('source-account', sourceKey, 'empty')
    expect(result.technicalHistoryId).toBeNull(); expect(await source.vaultRecords.where('accountId').equals('source-account').count()).toBe(0)

    await new BackupService(destination).restore('source-account', destinationKey, 'codigo-ficticio-123', backup.file)
    expect(await destination.vaultRecords.where('accountId').equals('source-account').count()).toBe(2)
  })

  it('preserva somente um resumo técnico não nominal na opção técnica', async () => {
    const database = new ApoioDatabase(`new-district-technical-${crypto.randomUUID()}`); databases.push(database); const key = await generateMasterKey()
    await seed(database, 'technical-account', key, 'person-fixture', 'person', { name: 'Pessoa Fictícia' }, 'person')
    await seed(database, 'technical-account', key, 'goal-fixture', 'goal', { title: 'Meta Fictícia' }, 'goal')
    await seed(database, 'technical-account', key, 'sermon-fixture', 'sermon', { title: 'Sermão Fictício' }, 'sermon')

    const service = new NewDistrictService(database); const preview = await service.preview('technical-account', key, 'technical')
    expect(preview.preserved[0]).toContain('sem nomes'); expect(preview.removed).toEqual(expect.arrayContaining(['Pessoas', 'Metas', 'Histórico de sermões']))
    const result = await service.start('technical-account', key, 'technical')
    expect(result.technicalHistoryId).not.toBeNull()
    const records = await database.vaultRecords.where('accountId').equals('technical-account').toArray()
    expect(records).toHaveLength(1); expect(JSON.stringify(records)).not.toContain('Pessoa Fictícia'); expect(JSON.stringify(records)).not.toContain('Meta Fictícia'); expect(JSON.stringify(records)).not.toContain('Sermão Fictício')
    const payload = await decryptPayload(key, records[0]!); expect(payload.type).toBe('technical_history'); expect(payload.data).toMatchObject({ recordCounts: { goal: 1, sermon: 1 } })
  })
})
