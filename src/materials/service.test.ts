import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { generateMasterKey } from '../crypto/vault'
import { ApoioDatabase } from '../db/database'
import { distributionPreview, materialStock } from './core'
import { MaterialsService } from './service'
import type { ChurchEntity } from '../district/types'

vi.mock('../auth/supabase', async (importarOriginal) => ({
  ...await importarOriginal<Record<string, unknown>>(),
  hasSupabaseConfiguration: false,
  ensureRemoteDevice: vi.fn(() => Promise.resolve('active')),
}))

const CONTA = 'conta-ficticia-materiais'
const bancos: ApoioDatabase[] = []
afterEach(async () => { localStorage.clear(); await Promise.all(bancos.splice(0).map((banco) => banco.delete())) })

function novoBanco() {
  const banco = new ApoioDatabase(`materiais-${crypto.randomUUID()}`)
  bancos.push(banco)
  return banco
}

const igreja = (id: string, name: string, type: ChurchEntity['type']): ChurchEntity =>
  ({ id, districtId: 'distrito-ficticio', name, type, status: 'active' } as ChurchEntity)

const igrejas = [
  igreja('c1', 'Central Fictícia', 'organized_church'),
  igreja('c2', 'Grupo Fictício', 'group'),
]

const materialFicticio = () => ({
  name: 'Lição Fictícia do 4º trimestre', category: 'lesson' as const, quantity: 30, unit: 'pct' as const,
  date: '2026-09-01', notes: '', createdAt: '', updatedAt: '',
})

describe('materiais do distrito', () => {
  it('registra o material recebido e recusa o que não dá para contar', async () => {
    const banco = novoBanco(); const chave = await generateMasterKey()
    const service = new MaterialsService(banco)

    const material = await service.saveMaterial(CONTA, chave, materialFicticio())
    expect(material.name).toBe('Lição Fictícia do 4º trimestre')
    expect((await service.materials(CONTA, chave))).toHaveLength(1)

    await expect(service.saveMaterial(CONTA, chave, { ...materialFicticio(), name: '  ' })).rejects.toThrow('nome do material')
    await expect(service.saveMaterial(CONTA, chave, { ...materialFicticio(), quantity: 0 })).rejects.toThrow('quantidade recebida')
  })

  it('distribui em um lote só e desconta do disponível', async () => {
    const banco = novoBanco(); const chave = await generateMasterKey()
    const service = new MaterialsService(banco)
    const material = await service.saveMaterial(CONTA, chave, materialFicticio())

    const previa = distributionPreview(igrejas, 12, 'rule')
    const criadas = await service.distribute(CONTA, chave, material.id, previa.lines)

    expect(criadas).toHaveLength(2)
    expect(criadas.every(({ status }) => status === 'pending')).toBe(true)
    const estoque = materialStock(material, await service.distributions(CONTA, chave))
    expect(estoque).toMatchObject({ received: 30, pending: 12, distributed: 0, available: 18 })
  })

  it('recusa distribuir mais do que existe, e não grava nada pela metade', async () => {
    const banco = novoBanco(); const chave = await generateMasterKey()
    const service = new MaterialsService(banco)
    const material = await service.saveMaterial(CONTA, chave, { ...materialFicticio(), quantity: 5 })

    await expect(service.distribute(CONTA, chave, material.id, [
      { churchId: 'c1', churchName: 'Central Fictícia', churchType: 'organized_church', quantity: 4 },
      { churchId: 'c2', churchName: 'Grupo Fictício', churchType: 'group', quantity: 4 },
    ])).rejects.toThrow('há 5 disponível')

    expect(await service.distributions(CONTA, chave)).toHaveLength(0)
  })

  it('confirma a entrega com quantidade real, data e quem recebeu', async () => {
    const banco = novoBanco(); const chave = await generateMasterKey()
    const service = new MaterialsService(banco)
    const material = await service.saveMaterial(CONTA, chave, materialFicticio())
    const [primeira] = await service.distribute(CONTA, chave, material.id, distributionPreview(igrejas, 12, 'rule').lines)

    const entregue = await service.confirmDelivery(CONTA, chave, primeira!.id, {
      delivered: 7, deliveredAt: '2026-09-06', receivedByPersonId: null, receivedByName: 'Diácono Fictício', notes: '',
    })

    expect(entregue).toMatchObject({ status: 'delivered', delivered: 7, receivedByName: 'Diácono Fictício' })
    const estoque = materialStock(material, await service.distributions(CONTA, chave))
    expect(estoque.distributed).toBe(7)
  })

  it('exige saber a quem o material foi entregue', async () => {
    const banco = novoBanco(); const chave = await generateMasterKey()
    const service = new MaterialsService(banco)
    const material = await service.saveMaterial(CONTA, chave, materialFicticio())
    const [primeira] = await service.distribute(CONTA, chave, material.id, distributionPreview(igrejas, 12, 'rule').lines)

    await expect(service.confirmDelivery(CONTA, chave, primeira!.id, {
      delivered: 5, deliveredAt: '2026-09-06', receivedByPersonId: null, receivedByName: '   ', notes: '',
    })).rejects.toThrow('quem recebeu')
  })

  it('a distribuição cancelada devolve o material ao disponível', async () => {
    const banco = novoBanco(); const chave = await generateMasterKey()
    const service = new MaterialsService(banco)
    const material = await service.saveMaterial(CONTA, chave, materialFicticio())
    const [primeira] = await service.distribute(CONTA, chave, material.id, distributionPreview(igrejas, 12, 'rule').lines)

    await service.cancelDistribution(CONTA, chave, primeira!.id)

    const estoque = materialStock(material, await service.distributions(CONTA, chave))
    expect(estoque.available).toBe(30 - 4)
  })

  it('a necessidade recebida vira item de estoque, e só quando o pastor manda', async () => {
    const banco = novoBanco(); const chave = await generateMasterKey()
    const service = new MaterialsService(banco)
    const need = await service.saveNeed(CONTA, chave, {
      item: 'Revista Fictícia do Ministério da Criança', quantity: 40, unit: 'un', priority: 'high',
      reason: 'Faltou no trimestre passado', notes: '', status: 'requested', stockMaterialId: null, createdAt: '', updatedAt: '',
    })

    // Enquanto ninguém confirma, nada entra no estoque.
    expect(await service.materials(CONTA, chave)).toHaveLength(0)

    const { material, need: atualizada } = await service.receiveNeed(CONTA, chave, need.id, {
      quantity: 38, date: '2026-09-20', category: 'magazine', notes: 'Vieram duas a menos',
    })

    expect(material).toMatchObject({ name: 'Revista Fictícia do Ministério da Criança', quantity: 38, unit: 'un' })
    expect(atualizada).toMatchObject({ status: 'received', stockMaterialId: material.id })
    await expect(service.receiveNeed(CONTA, chave, need.id, { quantity: 1, date: '2026-09-21', category: 'magazine', notes: '' }))
      .rejects.toThrow('já foi recebida')
  })

  it('não alcança registro de outra conta', async () => {
    const banco = novoBanco(); const chave = await generateMasterKey()
    const service = new MaterialsService(banco)
    await service.saveMaterial(CONTA, chave, materialFicticio())

    expect(await service.materials('outra-conta-ficticia', chave)).toHaveLength(0)
  })

  it('guarda tudo cifrado: o nome do material não aparece em texto', async () => {
    const banco = novoBanco(); const chave = await generateMasterKey()
    await new MaterialsService(banco).saveMaterial(CONTA, chave, materialFicticio())

    expect(JSON.stringify(await banco.vaultRecords.toArray())).not.toContain('Lição Fictícia')
  })
})
