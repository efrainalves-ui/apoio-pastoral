import { currentDeviceId } from '../auth/device'
import { decryptPayload, encryptPayload } from '../crypto/vault'
import { VaultRepository, type EncryptedMutation } from '../db/repository'
import { normalizePdfChurchName } from '../imports/parsers'
import { normalizePersonName } from '../people/validation'
import type { PersonData, PersonEntity } from '../people/types'
import type { ChurchData, ChurchEntity } from './types'

export interface ChurchNameCorrection { churchId: string; from: string; to: string; members: number; mergeIntoId?: string; warning?: string }

const keyForPerson = (person: PersonEntity) => `${normalizePersonName(person.name)}:${person.birthDate ?? ''}`

export function previewImportedChurchNameCorrections(churches: ChurchEntity[], people: PersonEntity[]): ChurchNameCorrection[] {
  const groups = new Map<string, ChurchEntity[]>()
  for (const church of churches) {
    const short = normalizePdfChurchName(church.name)
    if (short === church.name) continue
    const key = short.localeCompare('', 'pt-BR') === 0 ? church.name : short
    groups.set(key, [...(groups.get(key) ?? []), church])
  }
  return [...groups.entries()].flatMap(([short, sources]) => {
    const canonical = churches.find((church) => church.name.localeCompare(short, 'pt-BR', { sensitivity: 'base' }) === 0) ?? sources[0]!
    const targetPeople = people.filter((person) => person.currentChurchId === canonical.id)
    return sources.map((source) => {
      const sourcePeople = people.filter((person) => person.currentChurchId === source.id)
      if (source.id === canonical.id) return { churchId: source.id, from: source.name, to: short, members: sourcePeople.length }
      const duplicate = sourcePeople.some((person) => targetPeople.some((target) => keyForPerson(target) === keyForPerson(person)))
      return { churchId: source.id, from: source.name, to: short, members: sourcePeople.length, mergeIntoId: canonical.id, ...(duplicate ? { warning: 'Há pessoas com o mesmo nome e aniversário nas duas igrejas. Revise este caso antes de unir.' } : {}) }
    })
  })
}

export class ImportedChurchRepairService {
  constructor(private readonly repository: Pick<VaultRepository, 'list' | 'applyEncryptedMutations'> = new VaultRepository()) {}

  async apply(accountId: string, masterKey: CryptoKey, corrections: ChurchNameCorrection[]): Promise<{ corrected: number; merged: number; warnings: number }> {
    const records = await this.repository.list(accountId)
    const churches: ChurchEntity[] = []; const people: PersonEntity[] = []
    for (const record of records) {
      const payload = await decryptPayload(masterKey, record)
      if (payload.type === 'church') churches.push({ id: record.id, ...(payload.data as ChurchData) })
      if (payload.type === 'person') people.push({ id: record.id, ...(payload.data as PersonData) })
    }
    const planned = corrections.filter((correction) => !correction.warning)
    const now = new Date().toISOString(); const mutations: EncryptedMutation[] = []
    for (const correction of planned) {
      const source = churches.find((church) => church.id === correction.churchId)
      if (!source) continue
      if (!correction.mergeIntoId) {
        const data: ChurchData = { ...source, name: correction.to, updatedAt: now, history: [...source.history, { id: crypto.randomUUID(), at: now, event: 'details_updated', changedFields: ['nome'] }] }
        mutations.push({ recordId: source.id, recordType: 'church', envelope: await encryptPayload(masterKey, { schemaVersion: 1, type: 'church', data }, source.id) })
        continue
      }
      const targetChurchId = correction.mergeIntoId
      for (const person of people.filter((item) => item.currentChurchId === source.id)) {
        const data: PersonData = { ...person, currentChurchId: targetChurchId, memberships: person.memberships.map((membership) => membership.churchId === source.id ? { ...membership, churchId: targetChurchId } : membership), history: [...person.history, { id: crypto.randomUUID(), at: now, event: 'church_changed', from: source.id, to: targetChurchId, source: 'Correção de igreja importada' }], updatedAt: now }
        mutations.push({ recordId: person.id, recordType: 'person', envelope: await encryptPayload(masterKey, { schemaVersion: 1, type: 'person', data }, person.id) })
      }
      const tombstone = await encryptPayload(masterKey, { schemaVersion: 1, type: 'church_tombstone', data: { deletedAt: now } }, source.id)
      mutations.push({ recordId: source.id, recordType: 'church', operation: 'delete', envelope: tombstone })
    }
    if (mutations.length) await this.repository.applyEncryptedMutations(accountId, currentDeviceId(), mutations)
    return { corrected: planned.filter((item) => !item.mergeIntoId).length, merged: planned.filter((item) => item.mergeIntoId).length, warnings: corrections.filter((item) => item.warning).length }
  }
}
