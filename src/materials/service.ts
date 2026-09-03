import { currentDeviceId } from '../auth/device'
import { encryptPayload } from '../crypto/vault'
import { readPayload } from '../db/corrupted'
import { db, type ApoioDatabase } from '../db/database'
import { VaultRepository, type EncryptedMutation } from '../db/repository'
import { materialStock } from './core'
import type {
  DistributionLine, MaterialData, MaterialDistributionData, MaterialDistributionEntity,
  MaterialEntity, MaterialNeedData, MaterialNeedEntity,
} from './types'

const agora = () => new Date().toISOString()
type MaterialsRecordType = 'material' | 'material_distribution' | 'material_need'
type DataByType = {
  material: MaterialData
  material_distribution: MaterialDistributionData
  material_need: MaterialNeedData
}

export class MaterialsService {
  private readonly repo: VaultRepository
  constructor(private readonly database: ApoioDatabase = db) { this.repo = new VaultRepository(database) }

  private async list<T extends MaterialsRecordType>(accountId: string, key: CryptoKey, type: T): Promise<Array<DataByType[T] & { id: string }>> {
    const records = await this.repo.list(accountId, type)
    const abertos = await Promise.all(records.map(async (record) => {
      const payload = await readPayload(key, record, this.database)
      return payload?.type === type ? ({ id: record.id, ...(payload.data as DataByType[T]) }) : null
    }))
    return abertos.flatMap((item) => item ? [item] : [])
  }

  private async save<T extends MaterialsRecordType>(
    accountId: string, key: CryptoKey, type: T, input: DataByType[T], id: string = crypto.randomUUID(),
  ): Promise<DataByType[T] & { id: string }> {
    const anterior = (await this.list(accountId, key, type)).find((item) => item.id === id)
    const data = { ...input, createdAt: anterior?.createdAt ?? input.createdAt ?? agora(), updatedAt: agora() }
    await this.repo.saveEncrypted(accountId, currentDeviceId(accountId), id, await encryptPayload(key, { schemaVersion: 1, type, data }, id), type)
    return { id, ...data }
  }

  materials(accountId: string, key: CryptoKey) { return this.list(accountId, key, 'material') }
  distributions(accountId: string, key: CryptoKey) { return this.list(accountId, key, 'material_distribution') }
  needs(accountId: string, key: CryptoKey) { return this.list(accountId, key, 'material_need') }

  async saveMaterial(accountId: string, key: CryptoKey, input: MaterialData, id?: string): Promise<MaterialEntity> {
    if (!input.name.trim()) throw new Error('Informe o nome do material.')
    if (!(input.quantity > 0)) throw new Error('Informe a quantidade recebida.')
    if (!input.date) throw new Error('Informe a data em que o material chegou.')
    return this.save(accountId, key, 'material', { ...input, name: input.name.trim(), notes: input.notes.trim() }, id)
  }

  /**
   * Grava a divisão inteira de uma vez.
   *
   * Em um lote só, e não uma igreja por vez: metade das igrejas com material
   * reservado e a outra metade sem é um estado que ninguém consegue explicar
   * depois — e que o estoque disponível passaria a mentir sobre.
   */
  async distribute(
    accountId: string, key: CryptoKey, materialId: string, lines: DistributionLine[],
  ): Promise<MaterialDistributionEntity[]> {
    const material = (await this.materials(accountId, key)).find(({ id }) => id === materialId)
    if (!material) throw new Error('Material não encontrado.')
    const comQuantidade = lines.filter(({ quantity }) => quantity > 0)
    if (!comQuantidade.length) throw new Error('Nenhuma igreja recebeu quantidade nesta divisão.')

    const estoque = materialStock(material, await this.distributions(accountId, key))
    const total = comQuantidade.reduce((soma, linha) => soma + linha.quantity, 0)
    if (total > estoque.available) {
      throw new Error(`A divisão pede ${total} e há ${estoque.available} disponível. Ajuste a quantidade ou registre mais material recebido.`)
    }

    const carimbo = agora()
    const criados: MaterialDistributionEntity[] = []
    const mutations: EncryptedMutation[] = []
    for (const linha of comQuantidade) {
      const id = crypto.randomUUID()
      const data: MaterialDistributionData = {
        materialId, churchId: linha.churchId, planned: linha.quantity, delivered: 0,
        deliveredAt: '', status: 'pending', receivedByPersonId: null, receivedByName: '',
        notes: '', createdAt: carimbo, updatedAt: carimbo,
      }
      mutations.push({ recordId: id, recordType: 'material_distribution', envelope: await encryptPayload(key, { schemaVersion: 1, type: 'material_distribution', data }, id) })
      criados.push({ id, ...data })
    }
    await this.repo.applyEncryptedMutations(accountId, currentDeviceId(accountId), mutations)
    return criados
  }

  /** Confirma a entrega: quantidade real, data e quem recebeu. */
  async confirmDelivery(
    accountId: string, key: CryptoKey, distributionId: string,
    entrega: { delivered: number; deliveredAt: string; receivedByPersonId: string | null; receivedByName: string; notes: string },
  ): Promise<MaterialDistributionEntity> {
    const atual = (await this.distributions(accountId, key)).find(({ id }) => id === distributionId)
    if (!atual) throw new Error('Distribuição não encontrada.')
    if (!(entrega.delivered > 0)) throw new Error('Informe a quantidade realmente entregue.')
    if (!entrega.deliveredAt) throw new Error('Informe a data da entrega.')
    if (!entrega.receivedByPersonId && !entrega.receivedByName.trim()) {
      throw new Error('Informe quem recebeu: escolha um membro ou escreva o nome.')
    }
    const { id: _id, ...dados } = atual
    void _id
    return this.save(accountId, key, 'material_distribution', {
      ...dados, ...entrega, receivedByName: entrega.receivedByName.trim(), notes: entrega.notes.trim(), status: 'delivered',
    }, distributionId)
  }

  async cancelDistribution(accountId: string, key: CryptoKey, distributionId: string): Promise<void> {
    const atual = (await this.distributions(accountId, key)).find(({ id }) => id === distributionId)
    if (!atual) throw new Error('Distribuição não encontrada.')
    const { id: _id, ...dados } = atual
    void _id
    await this.save(accountId, key, 'material_distribution', { ...dados, status: 'cancelled' }, distributionId)
  }

  async saveNeed(accountId: string, key: CryptoKey, input: MaterialNeedData, id?: string): Promise<MaterialNeedEntity> {
    if (!input.item.trim()) throw new Error('Informe o item de que o distrito precisa.')
    if (!(input.quantity > 0)) throw new Error('Informe a quantidade necessária.')
    return this.save(accountId, key, 'material_need', { ...input, item: input.item.trim(), reason: input.reason.trim(), notes: input.notes.trim() }, id)
  }

  /**
   * O pedido que chegou vira item de estoque.
   *
   * Nunca automaticamente: é uma ação do pastor, porque só ele sabe se o que
   * chegou é o que foi pedido. A necessidade fica marcada como recebida e
   * guarda o vínculo com o material criado, para o histórico não perder o fio.
   */
  async receiveNeed(
    accountId: string, key: CryptoKey, needId: string, recebido: { quantity: number; date: string; category: MaterialData['category']; notes: string },
  ): Promise<{ material: MaterialEntity; need: MaterialNeedEntity }> {
    const need = (await this.needs(accountId, key)).find(({ id }) => id === needId)
    if (!need) throw new Error('Necessidade não encontrada.')
    if (need.status === 'received') throw new Error('Esta necessidade já foi recebida.')
    if (!(recebido.quantity > 0)) throw new Error('Informe a quantidade recebida.')

    const material = await this.saveMaterial(accountId, key, {
      name: need.item, category: recebido.category, quantity: recebido.quantity, unit: need.unit,
      date: recebido.date, notes: recebido.notes, createdAt: agora(), updatedAt: agora(),
    })
    const { id: _id, ...dados } = need
    void _id
    const atualizada = await this.saveNeed(accountId, key, { ...dados, status: 'received', stockMaterialId: material.id }, needId)
    return { material, need: atualizada }
  }

  async remove(accountId: string, key: CryptoKey, id: string): Promise<void> {
    const record = await this.database.vaultRecords.get(id)
    if (!record || record.accountId !== accountId || record.deletedAt) throw new Error('Registro não encontrado.')
    const tombstone = await encryptPayload(key, { schemaVersion: 1, type: `${record.recordType}_tombstone`, data: { deletedAt: agora() } }, id)
    await this.repo.deleteEncrypted(accountId, currentDeviceId(accountId), id, tombstone)
  }
}
