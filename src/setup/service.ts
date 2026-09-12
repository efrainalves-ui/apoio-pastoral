import { currentDeviceId } from '../auth/device'
import { encryptPayload } from '../crypto/vault'
import { readPayload } from '../db/corrupted'
import { db, type ApoioDatabase } from '../db/database'
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
  constructor(
    private readonly repository: Pick<VaultRepository, 'applyEncryptedMutations' | 'list'> = new VaultRepository(),
    private readonly database: ApoioDatabase = db,
  ) {}

  /**
   * Organizar um distrito aqui é seguro?
   *
   * A pergunta parece a mesma que "há registro do tipo distrito", mas não é. O
   * que chega de outro aparelho entra sem tipo — a sincronização não tem a
   * chave para descobri-lo, nem deve ter — e por isso aparece em qualquer
   * listagem por tipo. Contar sem abrir fazia um registro pessoal vindo do
   * celular passar por distrito, e a configuração inicial recusava com uma
   * frase que não era verdade: quem ainda não tinha distrito nenhum ficava sem
   * caminho para organizar o seu.
   *
   * Abrir também não basta. Um registro que não abre neste aparelho pode ser o
   * distrito, e deixar passar criaria um segundo por cima do primeiro — o
   * estrago que esta verificação existe para evitar. Então ele recusa dizendo o
   * que é, em vez de recusar dizendo o que não é.
   */
  private async impedimento(accountId: string, masterKey: CryptoKey): Promise<string | null> {
    let ilegiveis = 0
    for (const record of await this.repository.list(accountId, 'district')) {
      const payload = await readPayload(masterKey, record, this.database)
      if (payload?.type === 'district') return 'Este dispositivo já possui um distrito organizado.'
      if (!payload) ilegiveis += 1
    }
    return ilegiveis > 0
      ? `${ilegiveis} registro(s) não abriram neste aparelho, e um deles pode ser o seu distrito. Organizar agora criaria um segundo por cima do primeiro — restaurar um backup costuma resolver.`
      : null
  }

  async organize(accountId: string, masterKey: CryptoKey, input: InitialSetupInput): Promise<InitialSetupResult> {
    assertValid(validateDistrictName(input.districtName))
    const impedimento = await this.impedimento(accountId, masterKey)
    if (impedimento) throw new Error(impedimento)
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
    await this.repository.applyEncryptedMutations(accountId, currentDeviceId(accountId), mutations)
    return { churches: churches.length, people: members.length, birthdays: members.filter(({ birthDate }) => Boolean(birthDate)).length }
  }
}
