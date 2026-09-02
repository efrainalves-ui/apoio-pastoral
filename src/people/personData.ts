import { decryptPayload, encryptPayload } from '../crypto/vault'
import type { VaultPayload } from '../crypto/types'
import { db, type ApoioDatabase } from '../db/database'
import { VaultRepository, type EncryptedMutation } from '../db/repository'
import type { VaultRecord } from '../db/types'

interface Carregado { record: VaultRecord; payload: VaultPayload }
type Dados = Record<string, unknown>

const lista = (valor: unknown): string[] => Array.isArray(valor) ? valor.filter((item): item is string => typeof item === 'string') : []

/** O registro fala só desta pessoa: apagá-lo não tira nada de mais ninguém. */
export function isOnlyAboutPerson(payload: VaultPayload, personId: string): boolean {
  const dados = payload.data as Dados
  switch (payload.type) {
    case 'person': return true
    case 'visit': return dados.targetType === 'person' && dados.targetId === personId
    case 'prayer_request': return dados.subjectType === 'person' && dados.subjectId === personId
    case 'follow_up': return dados.subjectType === 'person' && dados.subjectId === personId
    case 'task': return dados.relatedType === 'person' && dados.relatedId === personId
    case 'bible_study': return dados.personId === personId
    default: return false
  }
}

/** O registro cita a pessoa junto de outras: sai a citação, fica o registro. */
export function withoutPerson(payload: VaultPayload, personId: string): VaultPayload | null {
  const dados = payload.data as Dados
  switch (payload.type) {
    case 'family': {
      if (!lista(dados.memberIds).includes(personId)) return null
      return { ...payload, data: { ...dados, memberIds: lista(dados.memberIds).filter((id) => id !== personId) } }
    }
    case 'missionary_pair': {
      if (!lista(dados.memberIds).includes(personId)) return null
      return { ...payload, data: { ...dados, memberIds: lista(dados.memberIds).filter((id) => id !== personId) } }
    }
    case 'sabbath_class':
    case 'small_group': {
      const participantes = lista(dados.participantIds)
      const citado = participantes.includes(personId) || dados.teacherId === personId || dados.assistantId === personId || dados.leaderId === personId || dados.associateId === personId
      if (!citado) return null
      return {
        ...payload,
        data: {
          ...dados,
          participantIds: participantes.filter((id) => id !== personId),
          ...(dados.teacherId === personId ? { teacherId: '' } : {}),
          ...(dados.assistantId === personId ? { assistantId: null } : {}),
          ...(dados.leaderId === personId ? { leaderId: '' } : {}),
          ...(dados.associateId === personId ? { associateId: null } : {}),
        },
      }
    }
    case 'visit': {
      const participantes = payload.data as { participants?: Array<{ personId?: string }>; versions?: Array<{ participants?: Array<{ personId?: string }> }> }
      const versoes = participantes.versions
      if (!versoes?.some((versao) => versao.participants?.some((item) => item.personId === personId))) return null
      return {
        ...payload,
        data: {
          ...dados,
          versions: versoes.map((versao) => ({ ...versao, participants: (versao.participants ?? []).filter((item) => item.personId !== personId) })),
        },
      }
    }
    case 'agenda_event': {
      const cerimonia = dados.ceremonyDetails as { involvedPersonIds?: string[]; parentPersonIds?: string[]; childPersonId?: string | null } | null
      if (!cerimonia) return null
      const citado = lista(cerimonia.involvedPersonIds).includes(personId) || lista(cerimonia.parentPersonIds).includes(personId) || cerimonia.childPersonId === personId
      if (!citado) return null
      return {
        ...payload,
        data: {
          ...dados,
          ceremonyDetails: {
            ...cerimonia,
            involvedPersonIds: lista(cerimonia.involvedPersonIds).filter((id) => id !== personId),
            parentPersonIds: lista(cerimonia.parentPersonIds).filter((id) => id !== personId),
            childPersonId: cerimonia.childPersonId === personId ? null : cerimonia.childPersonId ?? null,
          },
        },
      }
    }
    default: return null
  }
}

export interface PersonRemovalPlan { removed: Carregado[]; edited: Array<{ record: VaultRecord; payload: VaultPayload }> }

export class PersonDataService {
  private readonly repository: VaultRepository
  constructor(private readonly database: ApoioDatabase = db) { this.repository = new VaultRepository(database) }

  private async carregar(accountId: string, key: CryptoKey): Promise<Carregado[]> {
    const records = await this.database.vaultRecords.where('accountId').equals(accountId).filter((record) => !record.deletedAt).toArray()
    return Promise.all(records.map(async (record) => ({ record, payload: await decryptPayload(key, record) })))
  }

  /** O que será apagado e o que será apenas desvinculado, antes de confirmar. */
  async plan(accountId: string, key: CryptoKey, personId: string): Promise<PersonRemovalPlan> {
    const todos = await this.carregar(accountId, key)
    const removed = todos.filter(({ record, payload }) => record.id === personId ? true : payload.type !== 'person' && isOnlyAboutPerson(payload, personId))
    const edited: PersonRemovalPlan['edited'] = []
    for (const { record, payload } of todos) {
      if (removed.some((item) => item.record.id === record.id)) continue
      const semPessoa = withoutPerson(payload, personId)
      if (semPessoa) edited.push({ record, payload: semPessoa })
    }
    return { removed, edited }
  }

  /**
   * Exportação legível dos dados desta pessoa. Sai do cofre já decifrado, para
   * o pastor entregar a quem pediu; nada é enviado para lugar nenhum.
   */
  async exportLines(accountId: string, key: CryptoKey, personId: string): Promise<string[]> {
    const todos = await this.carregar(accountId, key)
    const pessoa = todos.find(({ record }) => record.id === personId)
    if (!pessoa) throw new Error('Pessoa não encontrada.')
    const dados = pessoa.payload.data as { name?: string; birthDate?: string | null; whatsapp?: string; pastoralStatus?: string; notes?: string }
    const linhas = [
      `Nome: ${dados.name ?? ''}`,
      `Nascimento: ${dados.birthDate ?? 'não informado'}`,
      `WhatsApp: ${dados.whatsapp ?? 'não informado'}`,
      `Situação pastoral: ${dados.pastoralStatus ?? ''}`,
      `Observações: ${dados.notes ?? ''}`,
      '',
      'Registros ligados a esta pessoa:',
    ]
    const ligados = todos.filter(({ record, payload }) => record.id !== personId && (isOnlyAboutPerson(payload, personId) || withoutPerson(payload, personId) !== null))
    const porTipo = ligados.reduce<Record<string, number>>((contagem, { payload }) => ({ ...contagem, [payload.type]: (contagem[payload.type] ?? 0) + 1 }), {})
    for (const [tipo, total] of Object.entries(porTipo).sort()) linhas.push(`- ${tipo}: ${total}`)
    if (!ligados.length) linhas.push('- nenhum')
    return linhas
  }

  /** Apaga a pessoa e o que era só dela; desvincula onde ela era uma entre várias. */
  async remove(accountId: string, key: CryptoKey, deviceId: string, personId: string): Promise<{ removed: number; edited: number }> {
    const { removed, edited } = await this.plan(accountId, key, personId)
    const agora = new Date().toISOString()
    const mutations: EncryptedMutation[] = []
    for (const { record, payload } of removed) {
      mutations.push({
        recordId: record.id, recordType: record.recordType, operation: 'delete',
        envelope: await encryptPayload(key, { schemaVersion: 1, type: `${payload.type}_tombstone`, data: { deletedAt: agora } }, record.id),
      })
    }
    for (const { record, payload } of edited) {
      mutations.push({ recordId: record.id, recordType: record.recordType, envelope: await encryptPayload(key, payload, record.id) })
    }
    if (mutations.length) await this.repository.applyEncryptedMutations(accountId, deviceId, mutations)
    return { removed: removed.length, edited: edited.length }
  }
}
