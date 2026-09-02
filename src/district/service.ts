import { currentDeviceId } from '../auth/device'
import { decryptRecord, encryptPayload } from '../crypto/vault'
import { db, type ApoioDatabase } from '../db/database'
import { VaultRepository } from '../db/repository'
import type { VaultRecord } from '../db/types'
import {
  CHURCH_STATUS_LABELS,
  CHURCH_TYPE_LABELS,
  type ChurchData,
  type ChurchEntity,
  type ChurchHistoryEntry,
  type ChurchInput,
  type DistrictData,
  type DistrictEntity,
} from './types'
import { assertValid, validateChurchInput, validateDistrictName } from './validation'

interface DecryptedRecord<T> {
  record: VaultRecord
  data: T
}

const detailLabels: Record<keyof Pick<ChurchInput, 'name' | 'externalCode' | 'address' | 'worshipSchedules' | 'administrativeNotes'>, string> = {
  name: 'nome',
  externalCode: 'código externo',
  address: 'endereço',
  worshipSchedules: 'dias e horários de culto',
  administrativeNotes: 'observações administrativas',
}

function normalizeChurchInput(input: ChurchInput): ChurchInput {
  return {
    ...input,
    name: input.name.trim(),
    externalCode: input.externalCode.trim(),
    address: input.address.trim(),
    administrativeNotes: input.administrativeNotes.trim(),
    worshipSchedules: input.worshipSchedules.map((schedule) => ({
      id: schedule.id || crypto.randomUUID(),
      day: schedule.day,
      time: schedule.time,
    })),
  }
}

export class DistrictService {
  private readonly repository: VaultRepository

  constructor(private readonly database: ApoioDatabase = db) {
    this.repository = new VaultRepository(database)
  }

  private async findByPayloadType<T>(accountId: string, masterKey: CryptoKey, type: string): Promise<DecryptedRecord<T>[]> {
    const records = await this.repository.list(accountId)
    const matches: DecryptedRecord<T>[] = []
    for (const record of records) {
      const payload = await decryptRecord(masterKey, record)
      if (payload?.type === type) matches.push({ record, data: payload.data as T })
    }
    return matches
  }

  async getDistrict(accountId: string, masterKey: CryptoKey): Promise<DistrictEntity | null> {
    const match = (await this.findByPayloadType<DistrictData>(accountId, masterKey, 'district')).at(0)
    return match ? { id: match.record.id, ...match.data } : null
  }

  async createDistrict(accountId: string, masterKey: CryptoKey, name: string): Promise<DistrictEntity> {
    assertValid(validateDistrictName(name))
    if (await this.getDistrict(accountId, masterKey)) throw new Error('Já existe um distrito ativo nesta conta.')
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const data: DistrictData = { name: name.trim(), createdAt: now, updatedAt: now }
    const envelope = await encryptPayload(masterKey, { schemaVersion: 1, type: 'district', data }, id)
    await this.repository.saveEncrypted(accountId, currentDeviceId(accountId), id, envelope, 'district')
    return { id, ...data }
  }

  async updateDistrict(accountId: string, masterKey: CryptoKey, districtId: string, name: string): Promise<DistrictEntity> {
    assertValid(validateDistrictName(name))
    const district = await this.getDistrict(accountId, masterKey)
    if (!district || district.id !== districtId) throw new Error('Distrito não encontrado.')
    const data: DistrictData = { name: name.trim(), createdAt: district.createdAt, updatedAt: new Date().toISOString() }
    const envelope = await encryptPayload(masterKey, { schemaVersion: 1, type: 'district', data }, districtId)
    await this.repository.saveEncrypted(accountId, currentDeviceId(accountId), districtId, envelope, 'district')
    return { id: districtId, ...data }
  }

  async deleteDistrict(accountId: string, masterKey: CryptoKey, districtId: string): Promise<void> {
    const district = await this.getDistrict(accountId, masterKey)
    if (!district || district.id !== districtId) throw new Error('Distrito não encontrado.')
    if ((await this.listChurches(accountId, masterKey, districtId)).length > 0) {
      throw new Error('Remova as igrejas antes de excluir o distrito.')
    }
    const deletedAt = new Date().toISOString()
    const tombstone = await encryptPayload(masterKey, { schemaVersion: 1, type: 'district_tombstone', data: { deletedAt } }, districtId)
    await this.repository.deleteEncrypted(accountId, currentDeviceId(accountId), districtId, tombstone)
  }

  async listChurches(accountId: string, masterKey: CryptoKey, districtId: string): Promise<ChurchEntity[]> {
    const matches = await this.findByPayloadType<ChurchData>(accountId, masterKey, 'church')
    return matches
      .filter(({ data }) => data.districtId === districtId)
      .map(({ record, data }) => ({ id: record.id, ...data }))
      .sort((left, right) => left.name.localeCompare(right.name, 'pt-BR'))
  }

  async getChurch(accountId: string, masterKey: CryptoKey, churchId: string): Promise<ChurchEntity | null> {
    const match = (await this.findByPayloadType<ChurchData>(accountId, masterKey, 'church')).find(({ record }) => record.id === churchId)
    return match ? { id: match.record.id, ...match.data } : null
  }

  async createChurch(accountId: string, masterKey: CryptoKey, districtId: string, input: ChurchInput): Promise<ChurchEntity> {
    const normalized = normalizeChurchInput(input)
    assertValid(validateChurchInput(normalized))
    const district = await this.getDistrict(accountId, masterKey)
    if (!district || district.id !== districtId) throw new Error('Crie o distrito antes de cadastrar uma igreja.')
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const history: ChurchHistoryEntry[] = [{ id: crypto.randomUUID(), at: now, event: 'created' }]
    const data: ChurchData = {
      ...normalized,
      type: normalized.type as ChurchData['type'],
      districtId,
      history,
      createdAt: now,
      updatedAt: now,
    }
    const envelope = await encryptPayload(masterKey, { schemaVersion: 1, type: 'church', data }, id)
    await this.repository.saveEncrypted(accountId, currentDeviceId(accountId), id, envelope, 'church')
    return { id, ...data }
  }

  async updateChurch(accountId: string, masterKey: CryptoKey, churchId: string, input: ChurchInput): Promise<ChurchEntity> {
    const current = await this.getChurch(accountId, masterKey, churchId)
    if (!current) throw new Error('Igreja não encontrada.')
    const normalized = normalizeChurchInput(input)
    assertValid(validateChurchInput(normalized, current.type))
    const now = new Date().toISOString()
    const history = [...current.history]

    if (normalized.type !== current.type) {
      history.push({
        id: crypto.randomUUID(),
        at: now,
        event: 'type_changed',
        from: CHURCH_TYPE_LABELS[current.type],
        to: CHURCH_TYPE_LABELS[normalized.type as ChurchData['type']],
      })
    }
    if (normalized.status !== current.status) {
      history.push({
        id: crypto.randomUUID(),
        at: now,
        event: 'status_changed',
        from: CHURCH_STATUS_LABELS[current.status],
        to: CHURCH_STATUS_LABELS[normalized.status],
      })
    }

    const changedFields = (Object.keys(detailLabels) as Array<keyof typeof detailLabels>)
      .filter((field) => JSON.stringify(normalized[field]) !== JSON.stringify(current[field]))
      .map((field) => detailLabels[field])
    if (changedFields.length > 0) history.push({ id: crypto.randomUUID(), at: now, event: 'details_updated', changedFields })

    const data: ChurchData = {
      districtId: current.districtId,
      name: normalized.name,
      type: normalized.type as ChurchData['type'],
      externalCode: normalized.externalCode,
      address: normalized.address,
      worshipSchedules: normalized.worshipSchedules,
      administrativeNotes: normalized.administrativeNotes,
      status: normalized.status,
      history,
      createdAt: current.createdAt,
      updatedAt: now,
    }
    const envelope = await encryptPayload(masterKey, { schemaVersion: 1, type: 'church', data }, churchId)
    await this.repository.saveEncrypted(accountId, currentDeviceId(accountId), churchId, envelope, 'church')
    return { id: churchId, ...data }
  }

  async deleteChurch(accountId: string, masterKey: CryptoKey, churchId: string): Promise<void> {
    const church = await this.getChurch(accountId, masterKey, churchId)
    if (!church) throw new Error('Igreja não encontrada.')
    const deletedAt = new Date().toISOString()
    const tombstone = await encryptPayload(masterKey, { schemaVersion: 1, type: 'church_tombstone', data: { deletedAt } }, churchId)
    await this.repository.deleteEncrypted(accountId, currentDeviceId(accountId), churchId, tombstone)
  }
}
