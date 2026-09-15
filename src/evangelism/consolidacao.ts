import type { AgendaEventEntity } from '../agenda/types'
import { rotuloDoTrimestre } from '../integrated-report/types'
import { anoDaCampanha, fimDaCampanha, periodoCurto } from './periodo'
import type { AnnualGoalEntity, EvangelismCampaignEntity } from './types'

/**
 * Revisão das repetições entre Evangelismo e Planejamento Anual.
 *
 * A campanha do Evangelismo é a fonte. As metas de estudos e de batismos que o
 * formulário da campanha cria são derivadas dela: mesmo nome, mesmas datas.
 *
 * As cópias vinham do formulário, que gravava as duas metas antes de conferir a
 * campanha. Cada tentativa recusada deixava metas com o nome da campanha e sem
 * campanha; sem término, o fim ia para 31 de dezembro.
 *
 * Aqui só se analisa: o plano é puro, determinístico e não grava nada. A
 * correção acontece no serviço, grupo a grupo, depois da confirmação do pastor.
 *
 * Uma meta só é apontada como cópia técnica quando tudo abaixo vale ao mesmo
 * tempo — nome igual, sozinho, não basta:
 * - é de estudos bíblicos ou de batismos;
 * - nenhuma campanha existente aponta para ela, nem ela para uma campanha existente;
 * - o título é o nome de uma única campanha do mesmo ano;
 * - o pastor não a marcou como mantida separada;
 * - para ser removida, não tem nada que só o pastor escreveria.
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

export interface CampanhaDuplicada { principalId: string; copiaIds: string[]; /** Compromissos da Agenda que só existiam como projeção das cópias. */ compromissos: string[] }
export interface MetaOrfa { metaId: string; campanhaId: string; area: AreaDaMetaDaCampanha; acao: 'ligar' | 'remover' | 'manter' }
export interface AjusteDeMeta { metaId: string; campanhaId: string; title: string; startDate: string; dueDate: string; year: number; churchIds: string[] }

export interface PlanoDeConsolidacao {
  campanhasExaminadas: number
  metasExaminadas: number
  campanhasDuplicadas: CampanhaDuplicada[]
  metasOrfas: MetaOrfa[]
  ajustes: AjusteDeMeta[]
  compromissosDaCopia: string[]
}

const chaveDaCampanha = (campanha: EvangelismCampaignEntity) =>
  [normalizarNome(campanha.name), campanha.startDate, fimDaCampanha(campanha), [...campanha.churchIds].sort().join(','), campanha.origemRelatorio ? `${campanha.origemRelatorio.churchId}:${campanha.origemRelatorio.trimestre}:${campanha.origemRelatorio.indice}` : ''].join('|')

const conteudo = (campanha: EvangelismCampaignEntity) => campanha.points.length + campanha.tasks.length + campanha.team.length + campanha.followUps.length + campanha.budgetItems.length

export const chaveDeCampanhaRepetida = (principalId: string) => `campanha:${principalId}`
export const chaveDeMetasDaCampanha = (campanhaId: string) => `metas:${campanhaId}`

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
    const principal = ordenado[0]!
    // O que o pastor já revisou e decidiu manter separado não volta a ser apontado.
    const copias = ordenado.slice(1).filter((copia) => !(principal.mantidaSeparadaDe ?? []).includes(copia.id) && !(copia.mantidaSeparadaDe ?? []).includes(principal.id))
    if (!copias.length) continue
    const compromissos = copias.flatMap(({ mainAgendaEventId, additionalAgendaEventIds }) => [mainAgendaEventId, ...additionalAgendaEventIds])
      .filter((id): id is string => Boolean(id) && eventos.some((evento) => evento.id === id))
    campanhasDuplicadas.push({ principalId: principal.id, copiaIds: copias.map(({ id }) => id), compromissos })
  }
  const copias = new Set(campanhasDuplicadas.flatMap(({ copiaIds }) => copiaIds))
  const reais = campanhas.filter(({ id }) => !copias.has(id))
  const existe = new Set(campanhas.map(({ id }) => id))

  // 2. Metas derivadas sem campanha.
  const apontadas = new Set(campanhas.flatMap(({ studyGoalId, baptismGoalId, goalId }) => [studyGoalId, baptismGoalId, goalId]).filter(Boolean))
  const metasOrfas: MetaOrfa[] = []
  const ocupado = new Map<string, boolean>()
  for (const campanha of reais) {
    const copiasDela = campanhasDuplicadas.find(({ principalId }) => principalId === campanha.id)?.copiaIds ?? []
    for (const area of AREAS) {
      const campo = campoDaArea(area)
      const ids = [campanha[campo], ...copiasDela.map((id) => campanhas.find((item) => item.id === id)?.[campo])]
      ocupado.set(`${campanha.id}:${area}`, ids.some((id) => id && metas.some((meta) => meta.id === id)))
    }
  }
  const candidatas = metas
    .filter((meta) => (meta.linkedArea === 'bible_studies' || meta.linkedArea === 'baptisms') && !meta.mantidaSeparada && !apontadas.has(meta.id) && !meta.campaignIds.some((id) => existe.has(id)))
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
      if (!derivadasIds.has(meta.id) || removidas.has(meta.id) || meta.mantidaSeparada) continue
      if (meta.linkedArea !== 'bible_studies' && meta.linkedArea !== 'baptisms') continue
      const alvo: AjusteDeMeta = { metaId: meta.id, campanhaId: campanha.id, title: campanha.name, startDate: campanha.startDate, dueDate: fimDaCampanha(campanha), year: Number(campanha.startDate.slice(0, 4)), churchIds: [...campanha.churchIds] }
      const igual = meta.title === alvo.title && (meta.startDate ?? '') === alvo.startDate && meta.dueDate === alvo.dueDate && meta.year === alvo.year
        && meta.campaignIds.includes(campanha.id)
      if (!igual) ajustes.push(alvo)
    }
  }

  return { campanhasExaminadas: campanhas.length, metasExaminadas: metas.length, campanhasDuplicadas, metasOrfas, ajustes, compromissosDaCopia: campanhasDuplicadas.flatMap(({ compromissos }) => compromissos) }
}

export const planoVazio = (plano: PlanoDeConsolidacao) => !plano.campanhasDuplicadas.length && !plano.metasOrfas.length && !plano.ajustes.length

/** Só as partes do plano que o pastor escolheu aplicar. */
export function filtrarPlano(plano: PlanoDeConsolidacao, chaves: ReadonlySet<string>): PlanoDeConsolidacao {
  const campanhasDuplicadas = plano.campanhasDuplicadas.filter(({ principalId }) => chaves.has(chaveDeCampanhaRepetida(principalId)))
  return {
    ...plano,
    campanhasDuplicadas,
    metasOrfas: plano.metasOrfas.filter(({ campanhaId }) => chaves.has(chaveDeMetasDaCampanha(campanhaId))),
    ajustes: plano.ajustes.filter(({ campanhaId }) => chaves.has(chaveDeMetasDaCampanha(campanhaId))),
    compromissosDaCopia: campanhasDuplicadas.flatMap(({ compromissos }) => compromissos),
  }
}

/** O que a correção encontrou e fez, em números. */
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
  const texto = (campo: CampoDeTexto) => principal[campo].trim() ? principal[campo] : copia[campo]
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

type CampoDeTexto = 'description' | 'notes' | 'location' | 'address' | 'mainSpeaker' | 'responsibleGeneral' | 'learnings'
const CAMPOS_DE_TEXTO: ReadonlyArray<[CampoDeTexto, string]> = [['description', 'Descrição'], ['notes', 'Observações'], ['location', 'Local'], ['address', 'Endereço'], ['mainSpeaker', 'Orador'], ['responsibleGeneral', 'Responsável geral'], ['learnings', 'Aprendizados']]

// ---------------------------------------------------------------------------
// Tela de revisão: cada grupo descreve, antes de qualquer gravação, o que fica,
// o que é preservado, o que é ligado e o que sai — e por quê.
// ---------------------------------------------------------------------------

export interface RegistroDoGrupo { id: string; tipo: 'campanha' | 'meta'; nome: string; inicio: string; fim: string; churchIds: string[]; origem: string; acao: string }
export interface GrupoDeCorrecao {
  chave: string
  tipo: 'campanha_repetida' | 'metas_da_campanha'
  titulo: string
  principal: RegistroDoGrupo
  registros: RegistroDoGrupo[]
  preservado: string[]
  vinculado: string[]
  removido: string[]
  motivo: string
  /** Seguro: nada que só um dos registros tenha deixa de existir. Entra em "Aplicar todas as correções seguras". */
  seguro: boolean
}

/** O que só a cópia tem e passaria para a principal ao unir. */
function exclusivosDaCopia(copia: EvangelismCampaignEntity, principal: EvangelismCampaignEntity): string[] {
  const novos = <T extends { id: string }>(lista: readonly T[], base: readonly T[]) => lista.filter(({ id }) => !base.some((item) => item.id === id)).length
  const itens: string[] = []
  const contar = (quantidade: number, rotulo: string) => { if (quantidade) itens.push(`${quantidade} ${rotulo}`) }
  contar(novos(copia.followUps, principal.followUps), 'acompanhamento(s)')
  contar(novos(copia.points, principal.points), 'ponto(s) de evangelismo')
  contar(novos(copia.tasks, principal.tasks), 'tarefa(s)')
  contar(novos(copia.team, principal.team), 'pessoa(s) na equipe')
  contar(novos(copia.budgetItems, principal.budgetItems), 'item(ns) de orçamento')
  for (const [campo, rotulo] of CAMPOS_DE_TEXTO) if (copia[campo].trim() && copia[campo].trim() !== principal[campo].trim()) itens.push(`${rotulo}: ${copia[campo].trim()}`)
  if (copia.plannedBudget && copia.plannedBudget !== principal.plannedBudget) itens.push(`Orçamento previsto de R$ ${copia.plannedBudget.toFixed(2)}`)
  return itens
}

const nomeDaArea = (meta: AnnualGoalEntity) => meta.linkedArea === 'bible_studies' ? 'estudos bíblicos' : meta.linkedArea === 'baptisms' ? 'batismos' : 'planejamento'
const periodoDaMeta = (meta: AnnualGoalEntity) => meta.startDate ? periodoCurto(meta.startDate, meta.dueDate) : `até ${periodoCurto(meta.dueDate)}`

export function gruposDeCorrecao(
  plano: PlanoDeConsolidacao,
  campanhas: readonly EvangelismCampaignEntity[],
  metas: readonly AnnualGoalEntity[],
  eventos: readonly AgendaEventEntity[] = [],
): GrupoDeCorrecao[] {
  const campanha = (id: string) => campanhas.find((item) => item.id === id)
  const meta = (id: string) => metas.find((item) => item.id === id)
  const registroDaCampanha = (item: EvangelismCampaignEntity, acao: string): RegistroDoGrupo => ({
    id: item.id, tipo: 'campanha', nome: item.name, inicio: item.startDate, fim: fimDaCampanha(item), churchIds: [...item.churchIds],
    origem: item.origemRelatorio ? `Relatório Integrado · ${rotuloDoTrimestre(item.origemRelatorio.trimestre)}` : 'Evangelismo', acao,
  })
  const registroDaMeta = (item: AnnualGoalEntity, acao: string): RegistroDoGrupo => ({
    id: item.id, tipo: 'meta', nome: `Meta de ${nomeDaArea(item)} · ${item.title}`, inicio: item.startDate ?? '', fim: item.dueDate, churchIds: [...item.churchIds], origem: 'Planejamento Anual', acao,
  })
  const grupos: GrupoDeCorrecao[] = []

  for (const { principalId, copiaIds, compromissos } of plano.campanhasDuplicadas) {
    const principal = campanha(principalId); if (!principal) continue
    const copiasDoGrupo = copiaIds.flatMap((id) => { const item = campanha(id); return item ? [item] : [] })
    const exclusivos = copiasDoGrupo.flatMap((copia) => exclusivosDaCopia(copia, principal))
    grupos.push({
      chave: chaveDeCampanhaRepetida(principalId), tipo: 'campanha_repetida', titulo: principal.name,
      principal: registroDaCampanha(principal, 'Mantida'),
      registros: copiasDoGrupo.map((copia) => registroDaCampanha(copia, 'Unir à principal')),
      preservado: [...exclusivos, 'Histórico das duas campanhas'],
      vinculado: metas.filter((item) => item.campaignIds.some((id) => copiaIds.includes(id))).map((item) => `${registroDaMeta(item, '').nome} passa para a campanha mantida`),
      removido: [
        ...copiasDoGrupo.map((copia) => `Campanha repetida: ${copia.name} · ${periodoCurto(copia.startDate, fimDaCampanha(copia))}`),
        ...compromissos.flatMap((id) => { const evento = eventos.find((item) => item.id === id); return evento ? [`Compromisso repetido na Agenda: ${evento.title} · ${periodoCurto(evento.startAt.slice(0, 10))}`] : [] }),
      ],
      motivo: 'Mesmo nome, mesmas datas e mesmas igrejas: é a mesma campanha gravada mais de uma vez.',
      seguro: exclusivos.length === 0,
    })
  }

  const campanhasComMetas = [...new Set([...plano.metasOrfas.map(({ campanhaId }) => campanhaId), ...plano.ajustes.map(({ campanhaId }) => campanhaId)])]
  for (const campanhaId of campanhasComMetas) {
    const dona = campanha(campanhaId); if (!dona) continue
    const orfas = plano.metasOrfas.filter((item) => item.campanhaId === campanhaId)
    const ajustes = plano.ajustes.filter((item) => item.campanhaId === campanhaId && !orfas.some(({ metaId, acao }) => metaId === item.metaId && acao === 'remover'))
    const acaoDaOrfa = { remover: 'Remover', ligar: 'Ligar à campanha', manter: 'Preservar e ligar à campanha' } as const
    const registros = [
      ...orfas.flatMap((orfa) => { const item = meta(orfa.metaId); return item ? [registroDaMeta(item, acaoDaOrfa[orfa.acao])] : [] }),
      ...ajustes.filter(({ metaId }) => !orfas.some((orfa) => orfa.metaId === metaId)).flatMap((ajuste) => { const item = meta(ajuste.metaId); return item ? [registroDaMeta(item, 'Alinhar nome e datas com a campanha')] : [] }),
    ]
    const preservado = orfas.flatMap((orfa) => {
      const item = meta(orfa.metaId); if (!item) return []
      if (orfa.acao === 'manter') return [`Anotações, resultados e plano de ${registroDaMeta(item, '').nome}`]
      if (orfa.acao === 'ligar') return [`${registroDaMeta(item, '').nome}${item.target ? ` · quantidade esperada ${item.target}` : ''}`]
      return []
    })
    const motivos = [
      orfas.length ? 'Metas de estudos ou batismos com o nome desta campanha, no mesmo ano, sem campanha ligada. As marcadas para remover não têm anotações, resultados, plano, orçamento nem compromissos.' : '',
      ajustes.length ? 'Meta da campanha com nome ou datas diferentes dos da campanha.' : '',
    ].filter(Boolean)
    grupos.push({
      chave: chaveDeMetasDaCampanha(campanhaId), tipo: 'metas_da_campanha', titulo: dona.name,
      principal: registroDaCampanha(dona, 'Mantida'), registros,
      preservado: preservado.length ? preservado : ['Metas já ligadas à campanha continuam como estão'],
      vinculado: [
        ...orfas.filter(({ acao }) => acao !== 'remover').flatMap((orfa) => { const item = meta(orfa.metaId); return item ? [`${registroDaMeta(item, '').nome} → ${dona.name}`] : [] }),
        ...ajustes.flatMap((ajuste) => { const item = meta(ajuste.metaId); return item ? [`${registroDaMeta(item, '').nome}: ${periodoDaMeta(item)} → ${periodoCurto(ajuste.startDate, ajuste.dueDate)}`] : [] }),
      ],
      removido: orfas.filter(({ acao }) => acao === 'remover').flatMap((orfa) => { const item = meta(orfa.metaId); return item ? [`${registroDaMeta(item, '').nome} · ${periodoDaMeta(item)}`] : [] }),
      motivo: motivos.join(' '),
      seguro: true,
    })
  }
  return grupos
}
