import type { AgendaEventEntity } from '../agenda/types'
import { anoDaCampanha, fimDaCampanha } from './periodo'
import type { AnnualGoalEntity, EvangelismCampaignEntity } from './types'

/**
 * Consolidação entre Evangelismo e Planejamento Anual.
 *
 * A campanha do Evangelismo é a fonte. As metas de estudos e de batismos que o
 * formulário da campanha cria são derivadas dela: mesmo nome, mesmas datas.
 *
 * As cópias vinham do formulário, que gravava as duas metas antes de conferir a
 * campanha. Cada tentativa recusada (sem igreja, sem responsável, sem data de
 * término) deixava metas com o nome da campanha e sem campanha; sem término, o
 * fim ia para 31 de dezembro. Salvar de novo criava outras.
 *
 * Uma meta só é tratada como cópia técnica quando tudo abaixo vale ao mesmo
 * tempo — nome igual, sozinho, não basta:
 * - é de estudos bíblicos ou de batismos;
 * - nenhuma campanha existente aponta para ela, nem ela para uma campanha existente;
 * - o título é o nome de uma campanha do mesmo ano;
 * - não tem nada que só o pastor escreveria: resultado lançado, metas por
 *   igreja, plano, orçamento, compromissos, referências, texto ou responsável.
 *
 * O plano é puro e determinístico: executado de novo, ou em dois aparelhos, dá o
 * mesmo resultado e, depois de aplicado, não encontra mais nada.
 */

type AreaDaMetaDaCampanha = 'bible_studies' | 'baptisms'
const AREAS: readonly AreaDaMetaDaCampanha[] = ['bible_studies', 'baptisms']
const campoDaArea = (area: AreaDaMetaDaCampanha) => area === 'bible_studies' ? 'studyGoalId' : 'baptismGoalId'

export const normalizarNome = (texto: string) => texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/\s+/gu, ' ').trim().toLocaleLowerCase('pt-BR')

/** A meta tem algo que só o pastor escreveria? Então não é cópia técnica, mesmo com o nome igual. */
export function metaTemDadosProprios(meta: AnnualGoalEntity): boolean {
  const plano = meta.actionPlan
  return Boolean(
    (meta.progress ?? []).some(({ amount }) => amount !== 0)
    || (meta.churchTargets ?? []).length
    || (plano && (plano.what || plano.how || plano.where || plano.who || plano.actions || plano.checklist.length))
    || (meta.budget ?? []).length || meta.budgetNotes
    || meta.agendaEventIds.length || meta.references.length
    || meta.description.trim() || meta.notes.trim() || meta.responsible.trim(),
  )
}

/** Metas que pertencem à campanha: as que ela aponta e as que apontam para ela. */
export function metasDaCampanha(campanha: EvangelismCampaignEntity, metas: readonly AnnualGoalEntity[]): AnnualGoalEntity[] {
  const ids = new Set([campanha.studyGoalId, campanha.baptismGoalId, campanha.goalId].filter(Boolean))
  return metas.filter((meta) => ids.has(meta.id) || meta.campaignIds.includes(campanha.id))
}

/** Para cada meta ligada a alguma campanha, a campanha. É o que impede dois cartões para a mesma coisa. */
export function campanhaDeCadaMeta(campanhas: readonly EvangelismCampaignEntity[], metas: readonly AnnualGoalEntity[]): Map<string, EvangelismCampaignEntity> {
  const mapa = new Map<string, EvangelismCampaignEntity>()
  for (const campanha of campanhas) for (const meta of metasDaCampanha(campanha, metas)) if (!mapa.has(meta.id)) mapa.set(meta.id, campanha)
  return mapa
}

export interface CampanhaDuplicada { principalId: string; copiaIds: string[] }
export interface MetaOrfa { metaId: string; campanhaId: string; area: AreaDaMetaDaCampanha; acao: 'ligar' | 'remover' | 'manter' }
export interface AjusteDeMeta { metaId: string; campanhaId: string; title: string; startDate: string; dueDate: string; year: number; churchIds: string[] }

export interface PlanoDeConsolidacao {
  campanhasExaminadas: number
  metasExaminadas: number
  campanhasDuplicadas: CampanhaDuplicada[]
  metasOrfas: MetaOrfa[]
  ajustes: AjusteDeMeta[]
  /** Compromissos da Agenda que só existiam como projeção de uma cópia. */
  compromissosDaCopia: string[]
}

const chaveDaCampanha = (campanha: EvangelismCampaignEntity) =>
  [normalizarNome(campanha.name), campanha.startDate, fimDaCampanha(campanha), [...campanha.churchIds].sort().join(','), campanha.origemRelatorio ? `${campanha.origemRelatorio.churchId}:${campanha.origemRelatorio.trimestre}:${campanha.origemRelatorio.indice}` : ''].join('|')

const conteudo = (campanha: EvangelismCampaignEntity) => campanha.points.length + campanha.tasks.length + campanha.team.length + campanha.followUps.length + campanha.budgetItems.length

export function planejarConsolidacao(
  campanhas: readonly EvangelismCampaignEntity[],
  metas: readonly AnnualGoalEntity[],
  eventos: readonly AgendaEventEntity[] = [],
): PlanoDeConsolidacao {
  // 1. Campanhas técnicas repetidas: mesmo nome, mesmas datas, mesmas igrejas. Só com data — as do relatório já têm identificador fixo.
  const grupos = new Map<string, EvangelismCampaignEntity[]>()
  for (const campanha of campanhas) {
    if (!campanha.startDate || !campanha.name.trim()) continue
    const chave = chaveDaCampanha(campanha)
    grupos.set(chave, [...(grupos.get(chave) ?? []), campanha])
  }
  const referencias = (campanha: EvangelismCampaignEntity) => metas.filter((meta) => meta.campaignIds.includes(campanha.id)).length
    + [campanha.studyGoalId, campanha.baptismGoalId, campanha.goalId].filter((id) => id && metas.some((meta) => meta.id === id)).length
  const campanhasDuplicadas: CampanhaDuplicada[] = []
  for (const grupo of grupos.values()) {
    if (grupo.length < 2) continue
    const ordenado = [...grupo].sort((a, b) => referencias(b) - referencias(a) || conteudo(b) - conteudo(a) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
    campanhasDuplicadas.push({ principalId: ordenado[0]!.id, copiaIds: ordenado.slice(1).map(({ id }) => id) })
  }
  const principalDe = new Map<string, string>()
  for (const { principalId, copiaIds } of campanhasDuplicadas) for (const copia of copiaIds) principalDe.set(copia, principalId)
  const copias = new Set(principalDe.keys())
  const reais = campanhas.filter(({ id }) => !copias.has(id))
  const existe = new Set(campanhas.map(({ id }) => id))

  // 2. Metas derivadas sem campanha.
  const apontadas = new Set(campanhas.flatMap(({ studyGoalId, baptismGoalId, goalId }) => [studyGoalId, baptismGoalId, goalId]).filter(Boolean))
  const metasOrfas: MetaOrfa[] = []
  const ocupado = new Map<string, boolean>()
  for (const campanha of reais) {
    // Depois da consolidação, a principal também herda as metas da cópia.
    const copiasDela = campanhasDuplicadas.find(({ principalId }) => principalId === campanha.id)?.copiaIds ?? []
    for (const area of AREAS) {
      const campo = campoDaArea(area)
      const ids = [campanha[campo], ...copiasDela.map((id) => campanhas.find((item) => item.id === id)?.[campo])]
      ocupado.set(`${campanha.id}:${area}`, ids.some((id) => id && metas.some((meta) => meta.id === id)))
    }
  }
  const candidatas = metas
    .filter((meta) => (meta.linkedArea === 'bible_studies' || meta.linkedArea === 'baptisms') && !apontadas.has(meta.id) && !meta.campaignIds.some((id) => existe.has(id)))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id))
  for (const meta of candidatas) {
    const area = meta.linkedArea as AreaDaMetaDaCampanha
    const donas = reais.filter((campanha) => normalizarNome(campanha.name) === normalizarNome(meta.title) && anoDaCampanha(campanha) === meta.year)
    // Duas campanhas diferentes com o mesmo nome no ano: não dá para saber de qual é. Fica como está.
    if (donas.length !== 1) continue
    const dona = donas[0]!
    const chave = `${dona.id}:${area}`
    if (metaTemDadosProprios(meta)) { metasOrfas.push({ metaId: meta.id, campanhaId: dona.id, area, acao: 'manter' }); continue }
    if (!ocupado.get(chave)) { ocupado.set(chave, true); metasOrfas.push({ metaId: meta.id, campanhaId: dona.id, area, acao: 'ligar' }); continue }
    metasOrfas.push({ metaId: meta.id, campanhaId: dona.id, area, acao: 'remover' })
  }

  // 3. Metas derivadas ligadas com nome, datas ou ano diferentes da campanha (o "até 23/09" de uma tentativa antiga).
  const ajustes: AjusteDeMeta[] = []
  const removidas = new Set(metasOrfas.filter(({ acao }) => acao === 'remover').map(({ metaId }) => metaId))
  for (const campanha of reais) {
    if (!campanha.startDate) continue
    const copiasDela = new Set(campanhasDuplicadas.find(({ principalId }) => principalId === campanha.id)?.copiaIds ?? [])
    const derivadasIds = new Set([
      campanha.studyGoalId, campanha.baptismGoalId,
      ...campanhas.filter(({ id }) => copiasDela.has(id)).flatMap(({ studyGoalId, baptismGoalId }) => [studyGoalId, baptismGoalId]),
      ...metasOrfas.filter(({ campanhaId, acao }) => campanhaId === campanha.id && acao === 'ligar').map(({ metaId }) => metaId),
    ].filter(Boolean))
    for (const meta of metas) {
      if (!derivadasIds.has(meta.id) || removidas.has(meta.id)) continue
      if (meta.linkedArea !== 'bible_studies' && meta.linkedArea !== 'baptisms') continue
      const alvo: AjusteDeMeta = { metaId: meta.id, campanhaId: campanha.id, title: campanha.name, startDate: campanha.startDate, dueDate: fimDaCampanha(campanha), year: Number(campanha.startDate.slice(0, 4)), churchIds: [...campanha.churchIds] }
      const igual = meta.title === alvo.title && (meta.startDate ?? '') === alvo.startDate && meta.dueDate === alvo.dueDate && meta.year === alvo.year
        && meta.campaignIds.includes(campanha.id)
      if (!igual) ajustes.push(alvo)
    }
  }

  const compromissosDaCopia = campanhas.filter(({ id }) => copias.has(id))
    .flatMap(({ mainAgendaEventId, additionalAgendaEventIds }) => [mainAgendaEventId, ...additionalAgendaEventIds])
    .filter((id): id is string => Boolean(id) && eventos.some((evento) => evento.id === id))

  return { campanhasExaminadas: campanhas.length, metasExaminadas: metas.length, campanhasDuplicadas, metasOrfas, ajustes, compromissosDaCopia }
}

export const planoVazio = (plano: PlanoDeConsolidacao) => !plano.campanhasDuplicadas.length && !plano.metasOrfas.length && !plano.ajustes.length

/** O que a consolidação encontrou e fez, em números. */
export interface ResultadoDaConsolidacao {
  campanhasExaminadas: number
  metasExaminadas: number
  copiasDeCampanha: number
  metasRepetidas: number
  metasRemovidas: number
  metasLigadas: number
  metasPreservadas: number
  datasCorrigidas: number
  /** Nomes das campanhas que receberam alguma correção. */
  campanhas: string[]
}

/** Une a cópia à principal sem perder o que só a cópia tinha. */
export function unirCampanhas(principal: EvangelismCampaignEntity, copia: EvangelismCampaignEntity): EvangelismCampaignEntity {
  const porId = <T extends { id: string }>(a: readonly T[], b: readonly T[]) => [...a, ...b.filter((item) => !a.some(({ id }) => id === item.id))]
  const checklist = [...principal.checklist]
  for (const item of copia.checklist) {
    const igual = checklist.findIndex(({ label }) => normalizarNome(label) === normalizarNome(item.label))
    if (igual < 0) checklist.push(item)
    else if (item.completed) checklist[igual] = { ...checklist[igual]!, completed: true }
  }
  const texto = (campo: 'description' | 'notes' | 'location' | 'address' | 'mainSpeaker' | 'responsibleGeneral' | 'learnings') => principal[campo].trim() ? principal[campo] : copia[campo]
  return {
    ...principal,
    description: texto('description'), notes: texto('notes'), location: texto('location'), address: texto('address'), mainSpeaker: texto('mainSpeaker'), responsibleGeneral: texto('responsibleGeneral'), learnings: texto('learnings'),
    goalId: principal.goalId ?? copia.goalId, studyGoalId: principal.studyGoalId ?? copia.studyGoalId ?? null, baptismGoalId: principal.baptismGoalId ?? copia.baptismGoalId ?? null,
    plannedBudget: principal.plannedBudget || copia.plannedBudget,
    planningAreas: [...new Set([...principal.planningAreas, ...copia.planningAreas])],
    team: porId(principal.team, copia.team), points: porId(principal.points, copia.points), tasks: porId(principal.tasks, copia.tasks),
    followUps: porId(principal.followUps, copia.followUps), budgetItems: porId(principal.budgetItems, copia.budgetItems), checklist,
    history: porId(principal.history, copia.history).sort((a, b) => a.at.localeCompare(b.at)),
  }
}
