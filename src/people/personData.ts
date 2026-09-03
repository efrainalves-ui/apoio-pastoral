import { encryptPayload } from '../crypto/vault'
import type { VaultPayload } from '../crypto/types'
import { remoteAccountGuard, type AccountSessionGuard } from '../auth/accountGuard'
import { readPayloads } from '../db/corrupted'
import { db, type ApoioDatabase } from '../db/database'
import type { PurgeResult } from '../db/purge'
import { VaultRepository, type EncryptedMutation } from '../db/repository'
import type { VaultRecord } from '../db/types'

interface Carregado { record: VaultRecord; payload: VaultPayload }
type Dados = Record<string, unknown>

const lista = (valor: unknown): string[] => Array.isArray(valor) ? valor.filter((item): item is string => typeof item === 'string') : []

/** Lista de objetos guardada dentro de um registro, quando é isso mesmo. */
const objetos = (valor: unknown): Dados[] => Array.isArray(valor) ? valor.filter((item): item is Dados => typeof item === 'object' && item !== null) : []

/** Apaga a citação da pessoa em um campo de identificação única. */
const semCitacao = (valor: unknown, personId: string, vazio: string | null = ''): unknown => valor === personId ? vazio : valor

/**
 * O registro fala só desta pessoa: apagá-lo não tira nada de mais ninguém.
 *
 * `recordId` não é enfeite. Sem ele, `person` respondia `true` para qualquer
 * cadastro de pessoa, de qualquer pessoa — e a exportação de uma pessoa saía
 * com o cadastro completo de todas as outras dentro. O tipo `person` só fala
 * desta pessoa quando o registro **é** o dela.
 */
export function isOnlyAboutPerson(payload: VaultPayload, personId: string, recordId: string): boolean {
  const dados = payload.data as Dados
  switch (payload.type) {
    case 'person': return recordId === personId
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
      const citado = candidatos.some((item) => item.personId === personId
          || lista((item.vote as Dados | undefined)?.participantIds).includes(personId))
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
          candidates: candidatos
            .filter((item) => item.personId !== personId)
            // O voto de outro candidato pode listar esta pessoa entre quem votou.
            .map((item) => typeof item.vote === 'object' && item.vote !== null
              ? { ...item, vote: { ...(item.vote as Dados), participantIds: lista((item.vote as Dados).participantIds).filter((id) => id !== personId) } }
              : item),
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
      // O acompanhamento da campanha guarda o nome escrito, não só o vínculo.
      const acompanhamentos = objetos(dados.followUps)
      const citado = equipe.some((item) => item.personId === personId)
        || pontos.some((ponto) => lista(ponto.teamPersonIds).includes(personId))
        || tarefas.some((tarefa) => tarefa.responsibleId === personId)
        || acompanhamentos.some((item) => item.type === 'person' && item.recordId === personId)
      if (!citado) return null
      return {
        ...payload,
        data: {
          ...dados,
          team: equipe.filter((item) => item.personId !== personId),
          points: pontos.map((ponto) => ({ ...ponto, teamPersonIds: lista(ponto.teamPersonIds).filter((id) => id !== personId) })),
          // O nome do responsável sai junto do vínculo: deixá-lo seria apagar
          // a ligação e manter escrito de quem se tratava.
          tasks: tarefas.map((tarefa) => tarefa.responsibleId === personId
            ? { ...tarefa, responsibleId: null, responsibleName: '' }
            : tarefa),
          followUps: acompanhamentos.filter((item) => !(item.type === 'person' && item.recordId === personId)),
        },
      }
    }
    case 'annual_goal': {
      // A meta do planejamento guarda referências com o nome escrito ao lado
      // do identificador. Sem tirá-las, apagar a pessoa deixava o nome dela
      // dentro da meta, legível para quem abrisse.
      const referencias = objetos(dados.references)
      if (!referencias.some((item) => item.type === 'person' && item.id === personId)) return null
      return {
        ...payload,
        data: { ...dados, references: referencias.filter((item) => !(item.type === 'person' && item.id === personId)) },
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
  sobreEstaPessoa: 'Sobre esta pessoa', terceiros: 'Sobre as outras pessoas', objective: 'Objetivo',
  comoAparece: 'Como esta pessoa aparece',
  area: 'Área', year: 'Ano', time: 'Hora', ageGroup: 'Faixa etária', day: 'Dia', active: 'Ativo',
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

/**
 * Projeções explícitas para registros compartilhados.
 *
 * A versão anterior copiava objetos inteiros: bastava um item de lista citar a
 * pessoa para o item sair como estava, com tudo que houvesse dentro — o nome de
 * quem mais participou, a observação confidencial da comissão, o endereço do
 * ponto de evangelismo, a nota escrita ao lado do acompanhamento. Copiar e
 * depois tentar limpar é a ordem errada: cada campo novo que alguém acrescenta
 * ao registro passa a sair sozinho, e sai entregando.
 *
 * Aqui é o contrário. Nada sai a não ser o que está escrito abaixo, campo por
 * campo, tipo por tipo. Um campo novo simplesmente não aparece na exportação
 * até alguém decidir que ele pode.
 *
 * Duas regras valem para todos:
 *
 * 1. Campo livre escrito pelo pastor — nome, título, descrição, observação,
 *    nota, endereço, local, motivo — nunca sai de um registro compartilhado.
 *    Ele fala do trabalho da igreja e pode citar qualquer pessoa. O que
 *    identifica o registro para quem pediu os dados é o tipo e a data.
 * 2. Só saem itens de lista cujo vínculo aponta para esta pessoa, e deles só
 *    os campos listados.
 */
interface ProjecaoDeItem {
  /** Papel que a pessoa exerce quando aparece nesta lista. */
  papel: string
  /** Campos do item que podem sair, já sabendo que o item fala dela. */
  campos: readonly string[]
  /** Campos internos de um objeto do item, por exemplo `question.text`. */
  internos?: Readonly<Record<string, readonly string[]>>
}

interface ProjecaoCompartilhada {
  /** Campos estruturais do registro: datas, situações, anos. Nunca texto livre. */
  contexto: readonly string[]
  /** Campos do próprio registro que só rendem um papel, nunca conteúdo. */
  papeis: Readonly<Record<string, string>>
  /** Listas do registro e o que sai do item que fala dela. */
  listas: Readonly<Record<string, ProjecaoDeItem>>
  /** Listas dentro de cada item de outra lista: `versions[].answers[]`. */
  aninhadas?: Readonly<Record<string, Readonly<Record<string, ProjecaoDeItem>>>>
  /** Lista guardada dentro de um objeto do registro: `undo.previousPeople`. */
  internas?: Readonly<Record<string, Readonly<Record<string, ProjecaoDeItem>>>>
}

const SEM_CONTEUDO: readonly string[] = []

const PROJECOES: Readonly<Record<string, ProjecaoCompartilhada>> = {
  family: {
    contexto: ['createdAt', 'updatedAt'],
    papeis: { memberIds: 'integrante da família' },
    listas: {},
  },
  missionary_pair: {
    contexto: ['active', 'createdAt', 'updatedAt'],
    papeis: { memberIds: 'integrante da dupla missionária' },
    listas: {},
  },
  sabbath_class: {
    contexto: ['ageGroup', 'active', 'createdAt', 'updatedAt'],
    papeis: {
      participantIds: 'participante da classe', teacherId: 'professora ou professor da classe',
      assistantId: 'auxiliar da classe',
    },
    listas: {},
  },
  small_group: {
    contexto: ['day', 'time', 'active', 'createdAt', 'updatedAt'],
    papeis: {
      participantIds: 'participante do Pequeno Grupo', leaderId: 'líder do Pequeno Grupo',
      associateId: 'associada ou associado do Pequeno Grupo',
    },
    listas: {},
  },
  visit: {
    // A visita de família é o registro em que a pessoa tem mais a receber: as
    // respostas que ela própria deu na entrevista. Sai a pergunta do catálogo e
    // a resposta dela; as respostas dos outros presentes não são alcançadas
    // porque o filtro é `subjectId`.
    contexto: ['mode', 'status', 'reason', 'createdAt', 'updatedAt'],
    papeis: {},
    listas: {
      incomeAnswers: { papel: 'informou a própria fidelidade', campos: ['status'] },
    },
    aninhadas: {
      versions: {
        answers: {
          papel: 'respondeu na entrevista',
          campos: ['value', 'skipped'],
          internos: { question: ['text', 'category', 'code'] },
        },
        participants: { papel: 'presente na visita', campos: ['present'] },
      },
    },
  },
  commission_config: {
    contexto: ['year', 'updatedAt'],
    papeis: {
      boardMemberIds: 'na comissão da igreja', elderIds: 'registrada ou registrado como ancião',
      boardPresidentId: 'preside a comissão', secretaryId: 'secretária ou secretário da comissão',
    },
    listas: {},
  },
  commission_meeting: {
    contexto: ['kind', 'date', 'createdAt', 'updatedAt'],
    papeis: {
      participantIds: 'participante da reunião', presidentId: 'presidiu a reunião',
      secretaryId: 'secretariou a reunião',
    },
    // O assunto e a proposta são texto livre da igreja; sai o prazo, que é o
    // que diz respeito a quem ficou responsável.
    listas: { agenda: { papel: 'responsável por um assunto', campos: ['dueDate'] } },
  },
  commission_task: {
    contexto: ['kind', 'dueDate', 'status', 'createdAt', 'updatedAt'],
    papeis: { responsibleId: 'responsável pela pendência' },
    listas: {},
  },
  nomination_process: {
    contexto: ['period', 'status', 'createdAt', 'updatedAt'],
    papeis: {},
    listas: {
      // A nota confidencial, o motivo da recusa e a data da conversa ficam com
      // a comissão. Sai o que a pessoa viveu: se consentiu, se foi considerada
      // apta e qual foi o resultado.
      candidates: { papel: 'indicada para um cargo', campos: ['status', 'consent', 'eligibility', 'associate', 'electedAt'], internos: { vote: ['result'] } },
      meetings: { papel: 'presente em reunião da comissão', campos: ['date'] },
      officialVotes: { papel: 'presente na votação oficial', campos: ['date', 'result'] },
      tasks: { papel: 'responsável por tarefa da comissão', campos: ['dueDate', 'status'] },
      reports: { papel: 'citada no relatório', campos: SEM_CONTEUDO },
    },
    aninhadas: {
      reports: { lines: { papel: 'indicada no relatório', campos: ['officeTitle'] } },
    },
  },
  evangelism_campaign: {
    contexto: ['objective', 'status', 'startDate', 'endDate', 'createdAt', 'updatedAt'],
    papeis: {},
    listas: {
      // `role` é uma escolha de uma lista fechada e é o papel da própria
      // pessoa: sai. Os pontos guardam só identificadores; deles sai o papel.
      team: { papel: 'na equipe da campanha', campos: ['role'] },
      points: { papel: 'na equipe de um ponto', campos: SEM_CONTEUDO },
      tasks: { papel: 'responsável por tarefa da campanha', campos: ['dueDate', 'status'] },
      followUps: { papel: 'em acompanhamento na campanha', campos: ['status'] },
    },
  },
  annual_goal: {
    contexto: ['area', 'year', 'startDate', 'endDate', 'createdAt', 'updatedAt'],
    papeis: {},
    listas: { references: { papel: 'referência da meta', campos: SEM_CONTEUDO } },
  },
  import_batch: {
    // O lote guarda uma cópia do cadastro anterior para poder desfazer. Esse
    // conteúdo é o mesmo que já sai em "Dados pessoais": aqui basta o papel.
    contexto: ['createdAt'],
    papeis: {},
    listas: {},
    internas: {
      undo: {
        previousPeople: { papel: 'consta na lista importada', campos: SEM_CONTEUDO },
      },
    },
  },
  agenda_event: {
    contexto: ['category', 'startAt', 'endAt', 'allDay'],
    papeis: {},
    listas: {},
    internas: {
      ceremonyDetails: {},
    },
  },
}

/** Campos de vínculo aceitos dentro de um item de lista. */
const VINCULOS_DE_PESSOA = ['personId', 'subjectId', 'responsibleId', 'presidentId', 'secretaryId', 'recordId'] as const
const VINCULOS_DE_LISTA = ['participantIds', 'memberIds', 'teamPersonIds'] as const

function itemFalaDaPessoa(item: Dados, personId: string): boolean {
  if (VINCULOS_DE_PESSOA.some((campo) => item[campo] === personId)) return true
  if (VINCULOS_DE_LISTA.some((campo) => lista(item[campo]).includes(personId))) return true
  // A referência da meta e o acompanhamento da campanha usam `id`/`recordId`
  // com um `type` ao lado: só vale quando o tipo é pessoa.
  return item.type === 'person' && (item.id === personId || item.recordId === personId)
}

/** Copia de um item apenas os campos autorizados, e nada mais. */
function projetarItem(item: Dados, projecao: ProjecaoDeItem): Dados | null {
  const saida: Dados = {}
  for (const campo of projecao.campos) {
    if (item[campo] === undefined) continue
    const valor = item[campo]
    // Um campo autorizado que virou objeto deixou de ser o que foi autorizado.
    if (valor !== null && typeof valor === 'object') continue
    saida[campo] = valor
  }
  for (const [objeto, campos] of Object.entries(projecao.internos ?? {})) {
    const interno = item[objeto]
    if (!interno || typeof interno !== 'object' || Array.isArray(interno)) continue
    for (const campo of campos) {
      const valor = (interno as Dados)[campo]
      if (valor === undefined || (valor !== null && typeof valor === 'object')) continue
      saida[`${objeto}.${campo}`] = valor
    }
  }
  return Object.keys(saida).length ? saida : null
}

/**
 * Versão projetada de um registro que fala desta pessoa junto de outras.
 *
 * Quem pede os próprios dados tem direito a saber que aquele registro existe,
 * que papel teve nele e o que há ali de conteúdo dela. Não tem direito ao que
 * é de terceiro — e o registro compartilhado é, quase inteiro, de terceiros.
 * Por isso a montagem é aditiva: começa vazia e recebe apenas o que
 * `PROJECOES` autoriza.
 */
export function redactForPerson(payload: VaultPayload, personId: string): VaultPayload | null {
  const projecao = PROJECOES[payload.type]
  if (!projecao) return null
  if (withoutPerson(payload, personId) === null) return null
  const dados = payload.data as Dados

  const contexto: Dados = {}
  for (const campo of projecao.contexto) {
    const valor = dados[campo]
    if (valor === undefined || (valor !== null && typeof valor === 'object')) continue
    contexto[campo] = valor
  }

  const papeis: string[] = []
  const conteudo: Dados[] = []

  for (const [campo, papel] of Object.entries(projecao.papeis)) {
    const valor = dados[campo]
    if (valor === personId || (Array.isArray(valor) && lista(valor).includes(personId))) papeis.push(papel)
  }

  const percorrer = (itens: Dados[], nome: string, item: ProjecaoDeItem) => {
    for (const entrada of itens) {
      if (!itemFalaDaPessoa(entrada, personId)) continue
      papeis.push(item.papel)
      const projetado = projetarItem(entrada, item)
      if (projetado) conteudo.push({ origem: nome, ...projetado })
    }
  }

  for (const [nome, item] of Object.entries(projecao.listas)) percorrer(objetos(dados[nome]), nome, item)

  for (const [externo, internas] of Object.entries(projecao.aninhadas ?? {})) {
    for (const bloco of objetos(dados[externo])) {
      for (const [nome, item] of Object.entries(internas)) percorrer(objetos(bloco[nome]), nome, item)
    }
  }

  for (const [objeto, internas] of Object.entries(projecao.internas ?? {})) {
    const bloco = dados[objeto]
    if (!bloco || typeof bloco !== 'object' || Array.isArray(bloco)) continue
    for (const [nome, item] of Object.entries(internas)) percorrer(objetos((bloco as Dados)[nome]), nome, item)
  }

  // A cerimônia da agenda cita a pessoa em campos do próprio objeto, não em
  // uma lista de objetos. Sai o papel, nunca o conteúdo do compromisso.
  if (payload.type === 'agenda_event') {
    const cerimonia = (typeof dados.ceremonyDetails === 'object' && dados.ceremonyDetails !== null ? dados.ceremonyDetails : {}) as Dados
    if (lista(cerimonia.involvedPersonIds).includes(personId)) papeis.push('pessoa da cerimônia')
    if (lista(cerimonia.parentPersonIds).includes(personId)) papeis.push('responsável na cerimônia')
    if (cerimonia.childPersonId === personId) papeis.push('criança da cerimônia')
  }

  return {
    ...payload,
    data: {
      ...contexto,
      comoAparece: papeis.length ? [...new Set(papeis)].join('; ') : 'aparece sem papel registrado',
      sobreEstaPessoa: conteudo.length ? conteudo : 'nenhum conteúdo próprio dentro deste registro',
      terceiros: 'o restante deste registro é de outras pessoas e não sai nesta exportação',
    },
  }
}

export interface PersonRemovalPlan { removed: Carregado[]; edited: Array<{ record: VaultRecord; payload: VaultPayload }> }

export class PersonDataService {
  private readonly repository: VaultRepository
  constructor(
    private readonly database: ApoioDatabase = db,
    /** Conferência de que a sessão remota ainda é a desta conta. */
    private readonly guard: AccountSessionGuard = remoteAccountGuard,
  ) { this.repository = new VaultRepository(database) }

  /**
   * Um registro que não abre não pode derrubar a exportação nem a exclusão: ele
   * vai para a quarentena e os íntegros seguem. Quem chama recebe também a
   * lista do que ficou de fora, para dizer isso em vez de omitir em silêncio.
   */
  private async carregar(accountId: string, key: CryptoKey): Promise<{ todos: Carregado[]; ilegiveis: VaultRecord[] }> {
    const records = await this.database.vaultRecords.where('accountId').equals(accountId).filter((record) => !record.deletedAt).toArray()
    const { opened, skipped } = await readPayloads(key, records, this.database)
    return { todos: opened, ilegiveis: skipped }
  }

  /** O que será apagado e o que será apenas desvinculado, antes de confirmar. */
  async plan(accountId: string, key: CryptoKey, personId: string): Promise<PersonRemovalPlan> {
    const { todos } = await this.carregar(accountId, key)
    const removed = todos.filter(({ record, payload }) => isOnlyAboutPerson(payload, personId, record.id))
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
    const { todos, ilegiveis } = await this.carregar(accountId, key)
    const pessoa = todos.find(({ record }) => record.id === personId)
    if (!pessoa) throw new Error('Pessoa não encontrada.')

    const linhas = [
      'Dados pessoais',
      ...linhasDoConteudo(pessoa.payload.data),
    ]

    const somenteDela = todos.filter(({ record, payload }) => record.id !== personId && isOnlyAboutPerson(payload, personId, record.id))
    linhas.push('', 'Registros que falam somente desta pessoa')
    if (!somenteDela.length) linhas.push('- nenhum')
    for (const { payload } of somenteDela) {
      linhas.push('', `${rotuloDeTipo(payload.type)}`, ...linhasDoConteudo(payload.data))
    }

    const compartilhados = todos.filter(({ record, payload }) => record.id !== personId
      && !isOnlyAboutPerson(payload, personId, record.id) && redactForPerson(payload, personId) !== null)
    linhas.push('', 'Registros em que esta pessoa aparece junto de outras')
    linhas.push('De cada um sai o que o registro é e o que há sobre esta pessoa. O restante é de terceiros e não sai nesta exportação.')
    if (!compartilhados.length) linhas.push('- nenhum')
    for (const { payload } of compartilhados) {
      const redigido = redactForPerson(payload, personId)
      if (!redigido) continue
      linhas.push('', rotuloDeTipo(payload.type), ...linhasDoConteudo(redigido.data))
    }

    if (ilegiveis.length) {
      linhas.push('', 'Registros que não abriram neste aparelho')
      linhas.push(`${ilegiveis.length} registro(s) cifrado(s) não puderam ser abertos aqui e ficaram em quarentena. Eles não entram nesta exportação; restaurar um backup costuma resolver.`)
    }

    return linhas
  }

  /**
   * Apaga a pessoa e o que era só dela; desvincula onde ela era uma entre
   * várias; e apaga o rastro que as duas coisas deixam para trás.
   *
   * Sem o expurgo, a exclusão trocava o envelope atual por uma lápide e o
   * passado ficava inteiro: cada versão anterior guardada na fila de envio, nas
   * revisões de conflito, na quarentena e no histórico do serviço — cifrada com
   * a mesma chave que o titular usa todo dia. Dizer a uma pessoa que os dados
   * dela foram apagados enquanto isso permanece recuperável não seria verdade.
   */
  async remove(accountId: string, key: CryptoKey, deviceId: string, personId: string): Promise<{ removed: number; edited: number; purge: PurgeResult }> {
    // Antes de apagar qualquer coisa: a sessão aberta no serviço ainda é a
    // desta conta? Com duas contas no mesmo navegador, a aba antiga mandaria a
    // lápide e o pedido de expurgo para a conta que entrou depois.
    await this.guard(accountId)
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
    if (!mutations.length) return { removed: 0, edited: 0, purge: { local: 0, queued: 0 } }

    // Publicar a lápide e pedir o expurgo do passado é uma coisa só.
    //
    // Antes eram duas, e as duas eram frágeis. A identificação das operações
    // vinha de um retrato da fila tirado antes e outro depois: qualquer coisa
    // enfileirada no meio — outra aba, outra tela, o próprio aplicativo —
    // entrava na diferença, e o expurgo pedia ao serviço que apagasse o
    // histórico de um registro que nada tinha a ver com a pessoa. E entre a
    // gravação e o pedido havia uma janela: fechar o navegador ali deixava a
    // pessoa apagada da tela e o passado dela inteiro, sem nada pendente.
    //
    // `applyMutationsAndQueuePurge` grava as operações e registra os alvos na
    // mesma transação, com os identificadores vindos de dentro da gravação.
    const { purge } = await this.repository.applyMutationsAndQueuePurge(accountId, deviceId, mutations)
    return { removed: removed.length, edited: edited.length, purge }
  }
}
