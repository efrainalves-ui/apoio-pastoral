import { currentDeviceId } from '../auth/device'
import { decryptRecord, encryptPayload } from '../crypto/vault'
import { db, type ApoioDatabase } from '../db/database'
import { VaultRepository } from '../db/repository'
import type { VaultRecord } from '../db/types'
import { FIDELITY_CATEGORY_LABELS, normalizeFidelitySnapshot, PASTORAL_STATUS_LABELS, type FidelitySnapshot, type IncomeStatus, type PersonData, type PersonEntity, type PersonHistoryEntry, type PersonInput } from './types'
import { assertPersonInput, normalizePhone } from './validation'

const detailLabels: Record<'name' | 'birthDate' | 'whatsapp' | 'notes', string> = {
  name: 'nome', birthDate: 'data de nascimento', whatsapp: 'WhatsApp', notes: 'observações',
}

export class PeopleService {
  private readonly repository: VaultRepository
  constructor(private readonly database: ApoioDatabase = db) { this.repository = new VaultRepository(database) }

  private async decode(record: VaultRecord, masterKey: CryptoKey): Promise<PersonEntity | null> {
    const payload = await decryptRecord(masterKey, record)
    if (payload?.type !== 'person') return null
    const data = payload.data as PersonData
    // `nameVariants` nasce vazio nos cadastros antigos: quem lê não precisa saber disso.
    return { id: record.id, ...data, incomeStatus: data.incomeStatus ?? 'unknown', nameVariants: data.nameVariants ?? [], fidelity: normalizeFidelitySnapshot(data.fidelity), fidelityHistory: (data.fidelityHistory ?? []).map((snapshot) => normalizeFidelitySnapshot(snapshot)!) }
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
    await this.repository.saveEncrypted(accountId, currentDeviceId(accountId), id, envelope, 'person')
    return { id, ...data }
  }

  async updatePerson(accountId: string, masterKey: CryptoKey, personId: string, input: PersonInput): Promise<PersonEntity> {
    assertPersonInput(input)
    const current = await this.getPerson(accountId, masterKey, personId)
    if (!current) throw new Error('Pessoa não encontrada.')
    const now = new Date().toISOString()
    const history = [...current.history]
    const memberships = current.memberships.map((membership) => ({ ...membership }))
    /*
      Mudar a igreja aqui é decisão do pastor, e decisão de pastor não é
      desfeita por importação. É assim que alguém que consta como membro da
      Central mas congrega no ponto de pregação fica no ponto — e continua lá
      depois do próximo relatório de membros.
    */
    const igrejaMudou = current.currentChurchId !== input.currentChurchId
    if (igrejaMudou) {
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
      ...(igrejaMudou ? { churchSource: 'manual' as const } : current.churchSource ? { churchSource: current.churchSource } : {}),
      memberships,
      history,
      incomeStatus: current.incomeStatus,
      fidelity: current.fidelity,
      fidelityHistory: current.fidelityHistory,
      createdAt: current.createdAt,
      updatedAt: now,
    }
    const envelope = await encryptPayload(masterKey, { schemaVersion: 1, type: 'person', data: stored }, personId)
    await this.repository.saveEncrypted(accountId, currentDeviceId(accountId), personId, envelope, 'person')
    return { id: personId, ...stored }
  }

  /**
   * Registra a avaliação de renda — e só quando ela muda.
   *
   * Gravar o mesmo valor de novo parecia inofensivo e não era: criava versão
   * nova do registro, linha nova no histórico da pessoa e operação nova para
   * sincronizar. Com dois aparelhos, cada gravação dessas é mais uma chance de
   * os dois lados divergirem e virar revisão pendente — revisão sobre uma
   * mudança que não houve.
   */
  async updateIncomeStatus(accountId: string, masterKey: CryptoKey, personId: string, incomeStatus: IncomeStatus): Promise<PersonEntity> {
    const current = await this.getPerson(accountId, masterKey, personId)
    if (!current) throw new Error('Pessoa não encontrada.')
    if (current.incomeStatus === incomeStatus) return current
    const now = new Date().toISOString()
    const data: PersonData = {
      ...current,
      incomeStatus,
      history: [...current.history, { id: crypto.randomUUID(), at: now, event: 'income_status_updated', source: 'Avaliação pastoral' }],
      updatedAt: now,
    }
    const envelope = await encryptPayload(masterKey, { schemaVersion: 1, type: 'person', data }, personId)
    await this.repository.saveEncrypted(accountId, currentDeviceId(accountId), personId, envelope, 'person')
    return { id: personId, ...data }
  }

  /**
   * O pastor confirma, na mão, que a pessoa é dizimista.
   *
   * O relatório erra e o pastor sabe: quem devolve o dízimo em outra igreja, ou
   * entrou depois do fechamento, aparece como não dizimista. A confirmação vira
   * uma leitura como outra qualquer — com data, e dizendo que veio dele —, a
   * leitura antiga desce para o histórico, e nada mais do cadastro é tocado.
   *
   * A idade não entra aqui: 67 anos decide renda, nunca fidelidade.
   */
  async confirmarDizimista(accountId: string, masterKey: CryptoKey, personId: string, onDate = new Date()): Promise<PersonEntity> {
    const current = await this.getPerson(accountId, masterKey, personId)
    if (!current) throw new Error('Pessoa não encontrada.')
    if (current.fidelity?.category === 'tither') return current
    const now = onDate.toISOString()
    const anterior = current.fidelity
    const fidelity: FidelitySnapshot = {
      referenceYear: onDate.getFullYear(), months: null, rangeMin: 8, rangeMax: 12,
      category: 'tither', precision: 'category_only', updatedAt: now, importedAt: now,
      source: 'Confirmação manual do pastor', importBatchId: '',
    }
    const { id: _id, ...stored } = current; void _id
    const data: PersonData = {
      ...stored,
      fidelity,
      fidelityHistory: anterior ? [...current.fidelityHistory, anterior] : current.fidelityHistory,
      history: [...current.history, {
        id: crypto.randomUUID(), at: now, event: 'fidelity_updated',
        from: anterior ? FIDELITY_CATEGORY_LABELS[anterior.category] : 'sem leitura',
        to: FIDELITY_CATEGORY_LABELS.tither, source: 'Confirmação manual do pastor',
      }],
      updatedAt: now,
    }
    const envelope = await encryptPayload(masterKey, { schemaVersion: 1, type: 'person', data }, personId)
    await this.repository.saveEncrypted(accountId, currentDeviceId(accountId), personId, envelope, 'person')
    return { id: personId, ...data }
  }

  /**
   * Dois ou mais cadastros passam a ser a mesma pessoa.
   *
   * Nada é apagado: os registros continuam inteiros, cada um com o seu histórico,
   * e ganham um grupo em comum. Os nomes diferentes ficam guardados como
   * variações, que é como a próxima importação vai reconhecê-la em vez de criar
   * um terceiro cadastro.
   *
   * Quem decide é o pastor — esta função não descobre nada sozinha.
   */
  async vincularCadastros(accountId: string, masterKey: CryptoKey, personIds: readonly string[], onDate = new Date()): Promise<PersonEntity[]> {
    if (new Set(personIds).size < 2) throw new Error('Escolha pelo menos dois cadastros para vincular.')
    const encontrados = await Promise.all([...new Set(personIds)].map((id) => this.getPerson(accountId, masterKey, id)))
    const cadastros = encontrados.filter((pessoa): pessoa is PersonEntity => Boolean(pessoa))
    if (cadastros.length !== new Set(personIds).size) throw new Error('Um dos cadastros não foi encontrado.')
    const now = onDate.toISOString()
    // Vincular a quem já é de um grupo entra no grupo existente, e não cria outro.
    const groupId = cadastros.find(({ linkedGroupId }) => linkedGroupId)?.linkedGroupId ?? crypto.randomUUID()
    const todosOsNomes = [...new Set(cadastros.flatMap((pessoa) => [pessoa.name, ...(pessoa.nameVariants ?? [])]))]
    const salvos: PersonEntity[] = []
    for (const pessoa of cadastros) {
      const { id, ...stored } = pessoa
      const data: PersonData = {
        ...stored,
        linkedGroupId: groupId,
        nameVariants: todosOsNomes.filter((nome) => nome !== pessoa.name),
        history: [...pessoa.history, {
          id: crypto.randomUUID(), at: now, event: 'records_linked',
          to: todosOsNomes.join(' · '), source: 'Vínculo confirmado pelo pastor',
        }],
        updatedAt: now,
      }
      const envelope = await encryptPayload(masterKey, { schemaVersion: 1, type: 'person', data }, id)
      await this.repository.saveEncrypted(accountId, currentDeviceId(accountId), id, envelope, 'person')
      salvos.push({ id, ...data })
    }
    return salvos
  }

  /**
   * O pastor diz que dois cadastros parecidos são pessoas diferentes.
   *
   * Fica gravado dos dois lados para o aviso não voltar: duas irmãs de nome
   * parecido na mesma igreja são o caso comum, e um aviso que reaparece toda
   * semana é um aviso que ninguém lê mais.
   */
  async marcarComoPessoasDiferentes(accountId: string, masterKey: CryptoKey, personIds: readonly string[]): Promise<PersonEntity[]> {
    const distintos = [...new Set(personIds)]
    if (distintos.length < 2) throw new Error('Escolha pelo menos dois cadastros.')
    const encontrados = await Promise.all(distintos.map((id) => this.getPerson(accountId, masterKey, id)))
    const cadastros = encontrados.filter((pessoa): pessoa is PersonEntity => Boolean(pessoa))
    if (cadastros.length !== distintos.length) throw new Error('Um dos cadastros não foi encontrado.')
    const now = new Date().toISOString()
    const salvos: PersonEntity[] = []
    for (const pessoa of cadastros) {
      const { id, ...stored } = pessoa
      const data: PersonData = {
        ...stored,
        naoSaoAMesmaPessoa: [...new Set([...(pessoa.naoSaoAMesmaPessoa ?? []), ...distintos.filter((outro) => outro !== id)])],
        updatedAt: now,
      }
      const envelope = await encryptPayload(masterKey, { schemaVersion: 1, type: 'person', data }, id)
      await this.repository.saveEncrypted(accountId, currentDeviceId(accountId), id, envelope, 'person')
      salvos.push({ id, ...data })
    }
    return salvos
  }

  /**
   * A exclusão de pessoa vive só em `PersonDataService.remove`.
   *
   * Existia aqui um segundo caminho, mais antigo: publicava a lápide do
   * cadastro e ia embora. Ele não desvinculava a pessoa das visitas, das
   * comissões, do processo de nomeações, da campanha nem do lote de
   * importação, e não pedia expurgo nenhum — o passado dela continuava
   * inteiro na fila de envio, nas revisões, na quarentena e no histórico do
   * serviço. Dois caminhos para a mesma ação, um deles incompleto, é só
   * questão de tempo até alguém chamar o errado. Ficou um só.
   */
}
