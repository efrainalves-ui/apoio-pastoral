import { currentDeviceId } from '../auth/device'
import { encryptPayload } from '../crypto/vault'
import { VaultRepository, type EncryptedMutation } from '../db/repository'
import type { ChurchData, DistrictData } from '../district/types'
import { assertValid, validateDistrictName } from '../district/validation'
import type { PersonData } from '../people/types'

export interface SetupChurch { id: string; name: string }
export interface SetupMember { name: string; birthDate: string | null; churchId: string }
export interface InitialSetupInput { districtName: string; churches: SetupChurch[]; members: SetupMember[] }
export interface InitialSetupResult { churches: number; people: number; birthdays: number }

const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/gu, '').replace(/[^a-z0-9]+/giu, ' ').trim().toLocaleLowerCase('pt-BR')

/** Creates the initial district in one encrypted persistence operation. */
export class InitialSetupService {
  constructor(private readonly repository: Pick<VaultRepository, 'applyEncryptedMutations' | 'list'> = new VaultRepository()) {}

  async organize(accountId: string, masterKey: CryptoKey, input: InitialSetupInput): Promise<InitialSetupResult> {
    assertValid(validateDistrictName(input.districtName))
    if ((await this.repository.list(accountId, 'district')).length > 0) throw new Error('Este dispositivo já possui um distrito organizado.')
    const churches = input.churches.map((church) => ({ ...church, name: church.name.trim() })).filter((church) => church.name)
    if (new Set(churches.map((church) => normalize(church.name))).size !== churches.length) throw new Error('Una ou corrija as igrejas com o mesmo nome antes de confirmar.')

    const churchIds = new Set(churches.map(({ id }) => id))
    const duplicateMember = new Set<string>()
    const members = input.members.map((member) => ({ ...member, name: member.name.trim() })).filter((member) => {
      const signature = `${member.churchId}:${normalize(member.name)}`
      if (!member.name || !churchIds.has(member.churchId) || duplicateMember.has(signature)) return false
      duplicateMember.add(signature)
      return true
    })
    const now = new Date().toISOString(); const districtId = crypto.randomUUID()
    const district: DistrictData = { name: input.districtName.trim(), createdAt: now, updatedAt: now }
    const mutations: EncryptedMutation[] = [{ recordId: districtId, recordType: 'district', envelope: await encryptPayload(masterKey, { schemaVersion: 1, type: 'district', data: district }, districtId) }]
    const persistedChurchIds = new Map<string, string>()
    for (const church of churches) {
      const recordId = crypto.randomUUID(); persistedChurchIds.set(church.id, recordId)
      const data: ChurchData = { districtId, name: church.name, type: 'organized_church', externalCode: '', address: '', worshipSchedules: [], administrativeNotes: '', status: 'active', history: [{ id: crypto.randomUUID(), at: now, event: 'created' }], createdAt: now, updatedAt: now }
      mutations.push({ recordId, recordType: 'church', envelope: await encryptPayload(masterKey, { schemaVersion: 1, type: 'church', data }, recordId) })
    }
    for (const member of members) {
      const churchId = persistedChurchIds.get(member.churchId)
      if (!churchId) continue
      const recordId = crypto.randomUUID()
      const data: PersonData = { name: member.name, birthDate: member.birthDate, whatsapp: '', notes: '', pastoralStatus: 'active', importStatus: 'current', currentChurchId: churchId, memberships: [{ id: crypto.randomUUID(), churchId, source: 'member_import', validFrom: now }], history: [{ id: crypto.randomUUID(), at: now, event: 'created', source: 'Importação inicial' }], incomeStatus: 'unknown', fidelity: null, fidelityHistory: [], createdAt: now, updatedAt: now }
      mutations.push({ recordId, recordType: 'person', envelope: await encryptPayload(masterKey, { schemaVersion: 1, type: 'person', data }, recordId) })
    }
    await this.repository.applyEncryptedMutations(accountId, currentDeviceId(), mutations)
    return { churches: churches.length, people: members.length, birthdays: members.filter(({ birthDate }) => Boolean(birthDate)).length }
  }
}
