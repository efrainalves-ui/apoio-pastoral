import { decryptPayload, encryptPayload } from '../crypto/vault'
import type { VaultPayload } from '../crypto/types'
import { db, type ApoioDatabase } from '../db/database'
import { VaultRepository, type EncryptedMutation } from '../db/repository'
import type { VaultRecord } from '../db/types'

interface Carregado { record: VaultRecord; payload: VaultPayload }
type Dados = Record<string, unknown>

const lista = (valor: unknown): string[] => Array.isArray(valor) ? valor.filter((item): item is string => typeof item === 'string') : []

/** Lista de objetos guardada dentro de um registro, quando é isso mesmo. */
const objetos = (valor: unknown): Dados[] => Array.isArray(valor) ? valor.filter((item): item is Dados => typeof item === 'object' && item !== null) : []

/** Apaga a citação da pessoa em um campo de identificação única. */
const semCitacao = (valor: unknown, personId: string, vazio: string | null = ''): unknown => valor === personId ? vazio : valor

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
      // Visita de família em que a pessoa esteve presente. As respostas da
      // entrevista trazem `subjectId`: sem tirá-las, o conteúdo mais íntimo da
      // pessoa continuaria guardado depois de ela pedir para ser apagada.
      const versoes = objetos(dados.versions)
      const citado = versoes.some((versao) =>
        objetos(versao.participants).some((item) => item.personId === personId)
        || objetos(versao.answers).some((item) => item.subjectId === personId))
      const rendas = objetos(dados.incomeAnswers).some((item) => item.personId === personId)
      if (!citado && !rendas) return null
      return {
        ...payload,
        data: {
          ...dados,
          versions: versoes.map((versao) => ({
            ...versao,
            participants: objetos(versao.participants).filter((item) => item.personId !== personId),
            answers: objetos(versao.answers).filter((item) => item.subjectId !== personId),
          })),
          ...(dados.incomeAnswers ? { incomeAnswers: objetos(dados.incomeAnswers).filter((item) => item.personId !== personId) } : {}),
        },
      }
    }
    case 'commission_config': {
      const citado = lista(dados.boardMemberIds).includes(personId) || lista(dados.elderIds).includes(personId)
        || dados.boardPresidentId === personId || dados.secretaryId === personId
      if (!citado) return null
      return {
        ...payload,
        data: {
          ...dados,
          boardMemberIds: lista(dados.boardMemberIds).filter((id) => id !== personId),
          ...(dados.elderIds ? { elderIds: lista(dados.elderIds).filter((id) => id !== personId) } : {}),
          boardPresidentId: semCitacao(dados.boardPresidentId, personId),
          secretaryId: semCitacao(dados.secretaryId, personId),
        },
      }
    }
    case 'commission_meeting': {
      const pauta = objetos(dados.agenda)
      const citado = lista(dados.participantIds).includes(personId) || dados.presidentId === personId
        || dados.secretaryId === personId || pauta.some((item) => item.responsibleId === personId)
      if (!citado) return null
      return {
        ...payload,
        data: {
          ...dados,
          participantIds: lista(dados.participantIds).filter((id) => id !== personId),
          presidentId: semCitacao(dados.presidentId, personId),
          secretaryId: semCitacao(dados.secretaryId, personId),
          agenda: pauta.map((item) => ({ ...item, responsibleId: semCitacao(item.responsibleId, personId) })),
        },
      }
    }
    case 'commission_task': {
      if (dados.responsibleId !== personId) return null
      return { ...payload, data: { ...dados, responsibleId: '' } }
    }
    case 'nomination_process': {
      // Um processo de nomeações cita a pessoa em muitos lugares, e o relatório
      // final guarda o nome escrito. Tudo isso sai; o processo continua.
      const candidatos = objetos(dados.candidates)
      const reunioes = objetos(dados.meetings)
      const votos = objetos(dados.officialVotes)
      const relatorios = objetos(dados.reports)
      const tarefas = objetos(dados.tasks)
      const formacao = (typeof dados.formation === 'object' && dados.formation !== null ? dados.formation : {}) as Dados
      const emReuniao = (registro: Dados) => lista(registro.participantIds).includes(personId)
        || registro.presidentId === personId || registro.secretaryId === personId
      const citado = candidatos.some((item) => item.personId === personId)
        || reunioes.some(emReuniao) || votos.some(emReuniao)
        || relatorios.some((relatorio) => objetos(relatorio.lines).some((linha) => linha.personId === personId))
        || tarefas.some((tarefa) => tarefa.responsibleId === personId)
        || lista(formacao.organizingCommitteeIds).includes(personId) || lista(formacao.committeeMemberIds).includes(personId)
        || formacao.presidentId === personId || formacao.secretaryId === personId || formacao.districtLeaderId === personId
      if (!citado) return null
      const semPessoaEmReuniao = (registro: Dados) => ({
        ...registro,
        participantIds: lista(registro.participantIds).filter((id) => id !== personId),
        presidentId: semCitacao(registro.presidentId, personId),
        secretaryId: semCitacao(registro.secretaryId, personId),
      })
      return {
        ...payload,
        data: {
          ...dados,
          formation: {
            ...formacao,
            organizingCommitteeIds: lista(formacao.organizingCommitteeIds).filter((id) => id !== personId),
            committeeMemberIds: lista(formacao.committeeMemberIds).filter((id) => id !== personId),
            presidentId: semCitacao(formacao.presidentId, personId),
            secretaryId: semCitacao(formacao.secretaryId, personId),
            districtLeaderId: semCitacao(formacao.districtLeaderId, personId),
          },
          candidates: candidatos.filter((item) => item.personId !== personId),
          meetings: reunioes.map(semPessoaEmReuniao),
          officialVotes: votos.map(semPessoaEmReuniao),
          reports: relatorios.map((relatorio) => ({ ...relatorio, lines: objetos(relatorio.lines).filter((linha) => linha.personId !== personId) })),
          tasks: tarefas.map((tarefa) => ({ ...tarefa, responsibleId: semCitacao(tarefa.responsibleId, personId) })),
        },
      }
    }
    case 'evangelism_campaign': {
      const equipe = objetos(dados.team)
      const pontos = objetos(dados.points)
      const tarefas = objetos(dados.tasks)
      const citado = equipe.some((item) => item.personId === personId)
        || pontos.some((ponto) => lista(ponto.teamPersonIds).includes(personId))
        || tarefas.some((tarefa) => tarefa.responsibleId === personId)
      if (!citado) return null
      return {
        ...payload,
        data: {
          ...dados,
          team: equipe.filter((item) => item.personId !== personId),
          points: pontos.map((ponto) => ({ ...ponto, teamPersonIds: lista(ponto.teamPersonIds).filter((id) => id !== personId) })),
          tasks: tarefas.map((tarefa) => ({ ...tarefa, responsibleId: semCitacao(tarefa.responsibleId, personId, null) })),
        },
      }
    }
    case 'import_batch': {
      // O lote de importação guarda os dados anteriores da pessoa para poder
      // desfazer. Apagar a pessoa e deixar essa cópia para trás seria apagar
      // só a metade visível.
      const desfazer = (typeof dados.undo === 'object' && dados.undo !== null ? dados.undo : {}) as Dados
      const anteriores = objetos(desfazer.previousPeople)
      const criados = lista(desfazer.createdPersonIds)
      if (!criados.includes(personId) && !anteriores.some((item) => item.id === personId)) return null
      return {
        ...payload,
        data: {
          ...dados,
          undo: {
            ...desfazer,
            createdPersonIds: criados.filter((id) => id !== personId),
            previousPeople: anteriores.filter((item) => item.id !== personId),
          },
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

const TYPE_LABELS: Record<string, string> = {
  person: 'Pessoa', visit: 'Visita', prayer_request: 'Pedido de oração', follow_up: 'Acompanhamento',
  task: 'Tarefa', bible_study: 'Estudo bíblico', family: 'Família', missionary_pair: 'Dupla missionária',
  sabbath_class: 'Classe da Escola Sabatina', small_group: 'Pequeno Grupo', agenda_event: 'Compromisso',
  commission_config: 'Configuração de comissão', commission_meeting: 'Reunião de comissão',
  commission_task: 'Pendência de comissão', nomination_process: 'Processo de nomeações',
  evangelism_campaign: 'Campanha de evangelismo', import_batch: 'Importação de lista',
}

const FIELD_LABELS: Record<string, string> = {
  name: 'Nome', birthDate: 'Nascimento', whatsapp: 'WhatsApp', email: 'E-mail', phone: 'Telefone',
  address: 'Endereço', notes: 'Observações', privateNotes: 'Observações reservadas', text: 'Texto',
  description: 'Descrição', title: 'Título', pastoralStatus: 'Situação pastoral', incomeStatus: 'Fidelidade',
  status: 'Situação', reason: 'Motivo', kind: 'Tipo', startAt: 'Início', endAt: 'Término', dueAt: 'Prazo',
  requestedAt: 'Pedido em', reviewAt: 'Revisar em', testimony: 'Testemunho', outcome: 'Desfecho',
  createdAt: 'Criado em', updatedAt: 'Atualizado em', startedAt: 'Iniciado em', completedAt: 'Concluído em',
  followUp: 'Acompanhamento', correctionNote: 'Nota de correção', value: 'Resposta', question: 'Pergunta',
  priority: 'Prioridade', mode: 'Modo', months: 'Meses', category: 'Categoria', externalCode: 'Código externo',
}

/** Campos que só existem para o aplicativo se localizar. Não dizem nada a quem lê. */
const CAMPOS_TECNICOS = new Set([
  'id', 'churchId', 'targetId', 'targetType', 'subjectId', 'subjectType', 'relatedId', 'relatedType',
  'personId', 'interestId', 'visitId', 'roundId', 'scheduledEventId', 'agendaEventId', 'currentVersion',
  'schemaVersion', 'memberIds', 'participantIds', 'code', 'version',
])

function rotuloDeTipo(tipo: string): string {
  return TYPE_LABELS[tipo] ?? 'Outro registro'
}

function valorLegivel(valor: unknown): string | null {
  if (valor === null || valor === undefined || valor === '') return 'não informado'
  if (typeof valor === 'boolean') return valor ? 'Sim' : 'Não'
  if (typeof valor === 'number') return String(valor)
  if (typeof valor === 'string') return valor
  if (Array.isArray(valor)) {
    const textos = valor.filter((item): item is string => typeof item === 'string')
    return textos.length === valor.length ? (textos.join(', ') || 'não informado') : null
  }
  return null
}

/**
 * Transforma o conteúdo já decifrado em linhas legíveis, incluindo o que está
 * dentro de listas de objetos — as respostas de uma entrevista, por exemplo,
 * que são justamente a parte que interessa a quem pede os próprios dados.
 */
function linhasDoConteudo(conteudo: unknown, prefixo = ''): string[] {
  if (!conteudo || typeof conteudo !== 'object') return [`${prefixo}${valorLegivel(conteudo) ?? 'não informado'}`]
  const dados = conteudo as Dados
  const linhas: string[] = []
  for (const [chave, valor] of Object.entries(dados)) {
    if (CAMPOS_TECNICOS.has(chave)) continue
    const rotulo = `${prefixo}${FIELD_LABELS[chave] ?? chave}`
    const simples = valorLegivel(valor)
    if (simples !== null) { linhas.push(`${rotulo}: ${simples}`); continue }
    if (Array.isArray(valor)) {
      const itens = valor.filter((item): item is Dados => typeof item === 'object' && item !== null)
      if (!itens.length) continue
      linhas.push(`${rotulo}:`)
      for (const item of itens) linhas.push(...linhasDoConteudo(item, `${prefixo}  `))
      continue
    }
    linhas.push(`${rotulo}:`, ...linhasDoConteudo(valor, `${prefixo}  `))
  }
  return linhas
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
   *
   * Antes saíam cinco campos e uma contagem por tipo. Quem pede os próprios
   * dados tem direito ao conteúdo, não a um resumo: os registros que falam só
   * dela saem inteiros. Os registros em que ela aparece ao lado de outras
   * pessoas continuam fora, e por um motivo — o conteúdo deles também é dos
   * outros; deles fica a indicação de que existem.
   */
  async exportLines(accountId: string, key: CryptoKey, personId: string): Promise<string[]> {
    const todos = await this.carregar(accountId, key)
    const pessoa = todos.find(({ record }) => record.id === personId)
    if (!pessoa) throw new Error('Pessoa não encontrada.')

    const linhas = [
      'Dados pessoais',
      ...linhasDoConteudo(pessoa.payload.data),
    ]

    const somenteDela = todos.filter(({ record, payload }) => record.id !== personId && isOnlyAboutPerson(payload, personId))
    linhas.push('', 'Registros que falam somente desta pessoa')
    if (!somenteDela.length) linhas.push('- nenhum')
    for (const { payload } of somenteDela) {
      linhas.push('', `${rotuloDeTipo(payload.type)}`, ...linhasDoConteudo(payload.data))
    }

    const compartilhados = todos.filter(({ record, payload }) => record.id !== personId
      && !isOnlyAboutPerson(payload, personId) && withoutPerson(payload, personId) !== null)
    linhas.push('', 'Registros em que esta pessoa aparece junto de outras')
    linhas.push('O conteúdo destes registros também é das outras pessoas citadas, por isso não sai aqui.')
    const porTipo = compartilhados.reduce<Record<string, number>>((contagem, { payload }) => ({ ...contagem, [payload.type]: (contagem[payload.type] ?? 0) + 1 }), {})
    for (const [tipo, total] of Object.entries(porTipo).sort()) linhas.push(`- ${rotuloDeTipo(tipo)}: ${total}`)
    if (!compartilhados.length) linhas.push('- nenhum')

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
