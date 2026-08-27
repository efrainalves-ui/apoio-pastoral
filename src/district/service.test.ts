import { afterEach, describe, expect, it } from 'vitest'
import { generateMasterKey } from '../crypto/vault'
import { ApoioDatabase } from '../db/database'
import { DistrictService } from './service'
import { emptyChurchInput } from './types'

describe('BL-004 — distrito e igrejas cifrados', () => {
  const databases: ApoioDatabase[] = []
  afterEach(async () => Promise.all(databases.map((database) => database.delete())))

  async function fixture() {
    const database = new ApoioDatabase(`district-test-${crypto.randomUUID()}`)
    databases.push(database)
    const service = new DistrictService(database)
    const masterKey = await generateMasterKey()
    const accountId = crypto.randomUUID()
    const district = await service.createDistrict(accountId, masterKey, 'Distrito Modelo')
    return { database, service, masterKey, accountId, district }
  }

  it('cria e edita um único distrito sem plaintext no banco ou na outbox', async () => {
    const { database, service, masterKey, accountId, district } = await fixture()
    const updated = await service.updateDistrict(accountId, masterKey, district.id, 'Distrito Modelo Atualizado')

    expect(updated.name).toBe('Distrito Modelo Atualizado')
    await expect(service.createDistrict(accountId, masterKey, 'Outro Distrito')).rejects.toThrow('Já existe')
    const persisted = JSON.stringify({
      records: await database.vaultRecords.toArray(),
      outbox: await database.outbox.toArray(),
    })
    expect(persisted).not.toContain('Distrito Modelo')
    expect(persisted).not.toContain('Distrito Modelo Atualizado')
  })

  it('cadastra igreja, preserva a evolução de tipo e o histórico cifrado', async () => {
    const { database, service, masterKey, accountId, district } = await fixture()
    const church = await service.createChurch(accountId, masterKey, district.id, {
      ...emptyChurchInput(),
      name: 'Ponto Esperança Fictício',
      type: 'preaching_point',
      address: 'Rua de Teste, 100',
      worshipSchedules: [{ id: crypto.randomUUID(), day: 'saturday', time: '09:00' }],
    })
    const group = await service.updateChurch(accountId, masterKey, church.id, {
      ...church,
      type: 'group',
      externalCode: '',
      administrativeNotes: '',
    })
    const organized = await service.updateChurch(accountId, masterKey, church.id, {
      ...group,
      type: 'organized_church',
      externalCode: '',
      administrativeNotes: '',
    })

    expect(organized.type).toBe('organized_church')
    expect(organized.history.filter(({ event }) => event === 'type_changed')).toHaveLength(2)
    const persisted = JSON.stringify({
      records: await database.vaultRecords.toArray(),
      outbox: await database.outbox.toArray(),
    })
    expect(persisted).not.toContain('Ponto Esperança Fictício')
    expect(persisted).not.toContain('Rua de Teste')
  })

  it('remove igreja com tombstone cifrada e só então permite excluir o distrito', async () => {
    const { database, service, masterKey, accountId, district } = await fixture()
    const church = await service.createChurch(accountId, masterKey, district.id, {
      ...emptyChurchInput(),
      name: 'Grupo Fictício',
      type: 'group',
    })

    await expect(service.deleteDistrict(accountId, masterKey, district.id)).rejects.toThrow('Remova as igrejas')
    await service.deleteChurch(accountId, masterKey, church.id)
    expect(await service.listChurches(accountId, masterKey, district.id)).toHaveLength(0)
    expect(await database.outbox.where('recordId').equals(church.id).filter(({ operation }) => operation === 'delete').count()).toBe(1)

    await service.deleteDistrict(accountId, masterKey, district.id)
    expect(await service.getDistrict(accountId, masterKey)).toBeNull()
  })
})
