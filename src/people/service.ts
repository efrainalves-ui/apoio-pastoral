import { currentDeviceId } from '../auth/device'
import { decryptPayload, encryptPayload } from '../crypto/vault'
import { db, type ApoioDatabase } from '../db/database'
import { VaultRepository } from '../db/repository'
import type { VaultRecord } from '../db/types'
import { normalizeFidelitySnapshot, PASTORAL_STATUS_LABELS, type IncomeStatus, type PersonData, type PersonEntity, type PersonHistoryEntry, type PersonInput } from './types'
import { assertPersonInput, normalizePhone } from './validation'

const detailLabels: Record<'name' | 'birthDate' | 'whatsapp' | 'notes', string> = {
  name: 'nome', birthDate: 'data de nascimento', whatsapp: 'WhatsApp', notes: 'observações',
}

export class PeopleService {
  private readonly repository: VaultRepository
  constructor(private readonly database: ApoioDatabase = db) { this.repository = new VaultRepository(database) }

  private async decode(record: VaultRecord, masterKey: CryptoKey): Promise<PersonEntity | null> {
    const payload = await decryptPayload(masterKey, record)
    if (payload.type !== 'person') return null
    const data = payload.data as PersonData
    return { id: record.id, ...data, incomeStatus: data.incomeStatus ?? 'unknown', fidelity: normalizeFidelitySnapshot(data.fidelity), fidelityHistory: (data.fidelityHistory ?? []).map((snapshot) => normalizeFidelitySnapshot(snapshot)!) }
  }

  async listPeople(accountId: string, masterKey: CryptoKey): Promise<PersonEntity[]> {
    const decoded = await Promise.all((await this.repository.list(accountId, 'person')).map((record) => this.decode(record, masterKey)))
    return decoded.filter((person): person is PersonEntity => Boolean(person)).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  }

  async getPerson(accountId: string, masterKey: CryptoKey, personId: string): Promise<PersonEntity | null> {
    const record = await this.database.vaultRecords.get(personId)
    if (!record || record.accountId !== accountId || record.deletedAt) return null
    return this.decode(record, masterKey)
  }

  async createPerson(accountId: string, masterKey: CryptoKey, input: PersonInput): Promise<PersonEntity> {
    assertPersonInput(input)
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const history: PersonHistoryEntry[] = [{ id: crypto.randomUUID(), at: now, event: 'created', source: 'Cadastro manual' }]
    const data: PersonData = {
      name: input.name.trim(), birthDate: input.birthDate || null, whatsapp: normalizePhone(input.whatsapp), notes: input.notes.trim(),
      pastoralStatus: input.pastoralStatus, importStatus: 'current', currentChurchId: input.currentChurchId,
      memberships: [{ id: crypto.randomUUID(), churchId: input.currentChurchId, source: 'manual', validFrom: now }],
      history, incomeStatus: 'unknown', fidelity: null, fidelityHistory: [], createdAt: now, updatedAt: now,
    }
    const envelope = await encryptPayload(masterKey, { schemaVersion: 1, type: 'person', data }, id)
    await this.repository.saveEncrypted(accountId, currentDeviceId(), id, envelope, 'person')
    return { id, ...data }
  }

  async updatePerson(accountId: string, masterKey: CryptoKey, personId: string, input: PersonInput): Promise<PersonEntity> {
    assertPersonInput(input)
    const current = await this.getPerson(accountId, masterKey, personId)
    if (!current) throw new Error('Pessoa não encontrada.')
    const now = new Date().toISOString()
    const history = [...current.history]
    const memberships = current.memberships.map((membership) => ({ ...membership }))
    if (current.currentChurchId !== input.currentChurchId) {
      const active = memberships.find((membership) => !membership.validTo)
      if (active) active.validTo = now
      memberships.push({ id: crypto.randomUUID(), churchId: input.currentChurchId, source: 'manual', validFrom: now })
      history.push({ id: crypto.randomUUID(), at: now, event: 'church_changed', from: current.currentChurchId, to: input.currentChurchId, source: 'Edição manual' })
    }
    if (current.pastoralStatus !== input.pastoralStatus) {
      history.push({ id: crypto.randomUUID(), at: now, event: 'pastoral_status_changed', from: PASTORAL_STATUS_LABELS[current.pastoralStatus], to: PASTORAL_STATUS_LABELS[input.pastoralStatus], source: 'Edição manual' })
    }
    const normalized = { name: input.name.trim(), birthDate: input.birthDate || null, whatsapp: normalizePhone(input.whatsapp), notes: input.notes.trim() }
    const changedFields = (Object.keys(detailLabels) as Array<keyof typeof detailLabels>).filter((field) => normalized[field] !== current[field]).map((field) => detailLabels[field])
    if (changedFields.length) history.push({ id: crypto.randomUUID(), at: now, event: 'details_updated', changedFields, source: 'Edição manual' })
    const stored: PersonData = {
      ...normalized,
      pastoralStatus: input.pastoralStatus,
      importStatus: current.importStatus,
      currentChurchId: input.currentChurchId,
      memberships,
      history,
      incomeStatus: current.incomeStatus,
      fidelity: current.fidelity,
      fidelityHistory: current.fidelityHistory,
      createdAt: current.createdAt,
      updatedAt: now,
    }
    const envelope = await encryptPayload(masterKey, { schemaVersion: 1, type: 'person', data: stored }, personId)
    await this.repository.saveEncrypted(accountId, currentDeviceId(), personId, envelope, 'person')
    return { id: personId, ...stored }
  }

  async updateIncomeStatus(accountId: string, masterKey: CryptoKey, personId: string, incomeStatus: IncomeStatus): Promise<PersonEntity> {
    const current = await this.getPerson(accountId, masterKey, personId)
    if (!current) throw new Error('Pessoa não encontrada.')
    const now = new Date().toISOString()
    const data: PersonData = {
      ...current,
      incomeStatus,
      history: [...current.history, { id: crypto.randomUUID(), at: now, event: 'income_status_updated', source: 'Avaliação pastoral' }],
      updatedAt: now,
    }
    const envelope = await encryptPayload(masterKey, { schemaVersion: 1, type: 'person', data }, personId)
    await this.repository.saveEncrypted(accountId, currentDeviceId(), personId, envelope, 'person')
    return { id: personId, ...data }
  }

  async deletePerson(accountId: string, masterKey: CryptoKey, personId: string): Promise<void> {
    const person = await this.getPerson(accountId, masterKey, personId)
    if (!person) throw new Error('Pessoa não encontrada.')
    for (const record of await this.repository.list(accountId, 'family')) {
      const payload = await decryptPayload(masterKey, record)
      if (payload.type === 'family' && (payload.data as { memberIds: string[] }).memberIds.includes(personId)) throw new Error('Remova a pessoa da família antes de excluir o cadastro.')
    }
    const deletedAt = new Date().toISOString()
    const tombstone = await encryptPayload(masterKey, { schemaVersion: 1, type: 'person_tombstone', data: { deletedAt } }, personId)
    await this.repository.deleteEncrypted(accountId, currentDeviceId(), personId, tombstone)
  }
}
