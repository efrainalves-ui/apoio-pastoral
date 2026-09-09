import { currentDeviceId } from '../auth/device'
import { decryptRecord, encryptPayload } from '../crypto/vault'
import { db, type ApoioDatabase } from '../db/database'
import { VaultRepository } from '../db/repository'
import type { VaultRecord } from '../db/types'
import { PeopleService } from '../people/service'
import type { FamilyData, FamilyEntity, FamilyInput } from './types'
import { familiaDestasPessoas, mesclarPapeis, type PapelNaFamilia } from './parentesco'

function validateFamily(input: FamilyInput): void {
  if (!input.name.trim()) throw new Error('Informe o nome da família.')
  if (input.name.trim().length > 160) throw new Error('Use no máximo 160 caracteres no nome da família.')
  if (!input.primaryChurchId) throw new Error('Selecione a igreja principal.')
  if (new Set(input.memberIds).size !== input.memberIds.length) throw new Error('A mesma pessoa não pode ser adicionada duas vezes.')
  if (input.address.trim().length > 500 || input.notes.trim().length > 2_000) throw new Error('Revise os campos de texto da família.')
}

export class FamilyService {
  private readonly repository: VaultRepository
  private readonly people: PeopleService
  constructor(private readonly database: ApoioDatabase = db) { this.repository = new VaultRepository(database); this.people = new PeopleService(database) }

  private async decode(record: VaultRecord, masterKey: CryptoKey): Promise<FamilyEntity | null> {
    const payload = await decryptRecord(masterKey, record)
    return payload?.type === 'family' ? { id: record.id, ...(payload.data as FamilyData) } : null
  }

  async listFamilies(accountId: string, masterKey: CryptoKey): Promise<FamilyEntity[]> {
    const decoded = await Promise.all((await this.repository.list(accountId, 'family')).map((record) => this.decode(record, masterKey)))
    return decoded.filter((family): family is FamilyEntity => Boolean(family)).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  }

  async getFamily(accountId: string, masterKey: CryptoKey, familyId: string): Promise<FamilyEntity | null> {
    const record = await this.database.vaultRecords.get(familyId)
    if (!record || record.accountId !== accountId || record.deletedAt) return null
    return this.decode(record, masterKey)
  }

  private async assertMemberships(accountId: string, masterKey: CryptoKey, input: FamilyInput, editingId?: string): Promise<void> {
    const people = await this.people.listPeople(accountId, masterKey)
    const personIds = new Set(people.map(({ id }) => id))
    if (input.memberIds.some((id) => !personIds.has(id))) throw new Error('Uma das pessoas selecionadas não está mais disponível.')
    const duplicateName = (await this.listFamilies(accountId, masterKey)).find((family) => family.id !== editingId && family.name.localeCompare(input.name.trim(), 'pt-BR', { sensitivity: 'base' }) === 0)
    if (duplicateName) throw new Error('Já existe uma família com este nome.')
    const occupied = (await this.listFamilies(accountId, masterKey)).find((family) => family.id !== editingId && family.memberIds.some((id) => input.memberIds.includes(id)))
    if (occupied) throw new Error(`Uma pessoa selecionada já pertence à ${occupied.name}. Remova-a de lá antes de continuar.`)
  }

  async createFamily(accountId: string, masterKey: CryptoKey, input: FamilyInput): Promise<FamilyEntity> {
    validateFamily(input); await this.assertMemberships(accountId, masterKey, input)
    const id = crypto.randomUUID(); const now = new Date().toISOString()
    const data: FamilyData = { name: input.name.trim(), primaryChurchId: input.primaryChurchId, memberIds: [...input.memberIds], address: input.address.trim(), notes: input.notes.trim(), history: [{ id: crypto.randomUUID(), at: now, event: 'created' }], createdAt: now, updatedAt: now }
    const envelope = await encryptPayload(masterKey, { schemaVersion: 1, type: 'family', data }, id)
    await this.repository.saveEncrypted(accountId, currentDeviceId(accountId), id, envelope, 'family')
    return { id, ...data }
  }

  async updateFamily(accountId: string, masterKey: CryptoKey, familyId: string, input: FamilyInput): Promise<FamilyEntity> {
    validateFamily(input); await this.assertMemberships(accountId, masterKey, input, familyId)
    const current = await this.getFamily(accountId, masterKey, familyId)
    if (!current) throw new Error('Família não encontrada.')
    const now = new Date().toISOString(); const history = [...current.history]
    if (JSON.stringify([...current.memberIds].sort()) !== JSON.stringify([...input.memberIds].sort())) history.push({ id: crypto.randomUUID(), at: now, event: 'members_updated', summary: 'Composição atualizada' })
    if (current.name !== input.name.trim() || current.primaryChurchId !== input.primaryChurchId || current.address !== input.address.trim() || current.notes !== input.notes.trim()) history.push({ id: crypto.randomUUID(), at: now, event: 'details_updated' })
    const data: FamilyData = { name: input.name.trim(), primaryChurchId: input.primaryChurchId, memberIds: [...input.memberIds], address: input.address.trim(), notes: input.notes.trim(), history, createdAt: current.createdAt, updatedAt: now }
    const envelope = await encryptPayload(masterKey, { schemaVersion: 1, type: 'family', data }, familyId)
    await this.repository.saveEncrypted(accountId, currentDeviceId(accountId), familyId, envelope, 'family')
    return { id: familyId, ...data }
  }

  /**
   * Registra o parentesco visto numa visita.
   *
   * Não passa por `createFamily`/`updateFamily` porque aquelas exigem nome,
   * endereço e uma checagem de nome repetido — perguntas que não cabem na porta
   * de uma casa. Aqui o que se sabe é quem estava na sala e como se relacionam;
   * o resto o pastor completa depois, na tela da família.
   */
  async registrarParentesco(
    accountId: string,
    masterKey: CryptoKey,
    churchId: string,
    papeis: ReadonlyArray<PapelNaFamilia>,
    nomeSugerido: string,
  ): Promise<FamilyEntity | null> {
    if (papeis.length < 2 || !churchId) return null
    const pessoas = papeis.map(({ personId }) => personId)
    const existente = familiaDestasPessoas(await this.listFamilies(accountId, masterKey), pessoas)
    const now = new Date().toISOString()

    if (existente) {
      const memberIds = [...new Set([...existente.memberIds, ...pessoas])]
      const data: FamilyData = {
        name: existente.name, primaryChurchId: existente.primaryChurchId, address: existente.address,
        notes: existente.notes, createdAt: existente.createdAt,
        memberIds, roles: mesclarPapeis(existente.roles, papeis), updatedAt: now,
        history: [...existente.history, { id: crypto.randomUUID(), at: now, event: 'members_updated', summary: 'Parentesco registrado numa visita.' }],
      }
      await this.repository.saveEncrypted(accountId, currentDeviceId(accountId), existente.id, await encryptPayload(masterKey, { schemaVersion: 1, type: 'family', data }, existente.id), 'family')
      return { id: existente.id, ...data }
    }

    const id = crypto.randomUUID()
    const data: FamilyData = {
      name: nomeSugerido, primaryChurchId: churchId, memberIds: [...pessoas], address: '', notes: '',
      roles: [...papeis], createdAt: now, updatedAt: now,
      history: [{ id: crypto.randomUUID(), at: now, event: 'created', summary: 'Criada a partir de uma visita.' }],
    }
    await this.repository.saveEncrypted(accountId, currentDeviceId(accountId), id, await encryptPayload(masterKey, { schemaVersion: 1, type: 'family', data }, id), 'family')
    return { id, ...data }
  }

  async deleteFamily(accountId: string, masterKey: CryptoKey, familyId: string): Promise<void> {
    if (!await this.getFamily(accountId, masterKey, familyId)) throw new Error('Família não encontrada.')
    const deletedAt = new Date().toISOString()
    const tombstone = await encryptPayload(masterKey, { schemaVersion: 1, type: 'family_tombstone', data: { deletedAt } }, familyId)
    await this.repository.deleteEncrypted(accountId, currentDeviceId(accountId), familyId, tombstone)
  }
}
