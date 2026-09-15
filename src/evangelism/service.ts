import { currentDeviceId } from '../auth/device'
import { encryptPayload } from '../crypto/vault'
import { db, type ApoioDatabase } from '../db/database'
import { VaultRepository, type EncryptedMutation } from '../db/repository'
import type { VaultRecord } from '../db/types'
import type { AgendaConflict, AgendaEventData, AgendaEventEntity } from '../agenda/types'
import { findAgendaConflicts } from '../agenda/service'
import { localDateKey } from '../shared/dates'
import { DEFAULT_CAMPAIGN_CHECKLIST, type AnnualGoalData, type AnnualGoalEntity, type AnnualGoalInput, type CampaignObjective, type EvangelismCampaignData, type EvangelismCampaignEntity, type EvangelismCampaignInput, type HistoryEntry, type PointSchedule } from './types'
import { readPayload } from '../db/corrupted'
import { nomeDaCampanhaDoRelatorio, objetivoDoNome } from '../integrated-report/campanhas'
import { idDerivado } from '../shared/idDerivado'
import type { CipherEnvelope } from '../crypto/types'
import { filtrarPlano, gruposDeCorrecao, metasDaCampanha, metaTemDadosProprios, planejarConsolidacao, planoVazio, unirCampanhas, type GrupoDeCorrecao, type PlanoDeConsolidacao, type ResultadoDaConsolidacao } from './consolidacao'

/** Quantos estudos bíblicos e batismos a campanha espera; as metas nascem e mudam junto com ela. */
export interface MetasDaCampanha { bible_studies?: number; baptisms?: number }
type TipoApagavel = 'agenda_event' | 'annual_goal' | 'evangelism_campaign'

/** Cópia cifrada, neste aparelho, dos registros como estavam antes de uma correção revisada. */
interface CopiaDaLimpeza { id: string; criadaEm: string; resumo: ResultadoDaConsolidacao; registros: Array<{ recordId: string; recordType: VaultRecord['recordType']; envelope: CipherEnvelope; versaoDepois: number }> }
const chaveDasCopias = (accountId: string) => `apoio-pastoral:limpezas-revisadas:${accountId}`
function lerCopias(accountId: string): CopiaDaLimpeza[] {
  try { const lido = localStorage.getItem(chaveDasCopias(accountId)); const valor: unknown = lido ? JSON.parse(lido) : []; return Array.isArray(valor) ? valor as CopiaDaLimpeza[] : [] } catch { return [] }
}
function guardarCopias(accountId: string, copias: readonly CopiaDaLimpeza[]) {
  try {
    if (copias.length) localStorage.setItem(chaveDasCopias(accountId), JSON.stringify(copias.slice(-10)))
    else localStorage.removeItem(chaveDasCopias(accountId))
  } catch { throw new Error('Não foi possível guardar a cópia de segurança neste aparelho. Nada foi alterado.') }
}
/** Só o conteúdo cifrado: a cópia nunca guarda texto legível. */
const envelopeDe = ({ algorithm, ciphertext, iv, aad, keyVersion }: CipherEnvelope): CipherEnvelope => ({ algorithm, ciphertext, iv, aad, keyVersion })

/** Campanhas que o Relatório Integrado informou para uma igreja num trimestre e que faltam cadastrar. */
export interface PedidoDeCampanhaDoRelatorio {
  relatorioId: string
  churchId: string
  /** Nome da igreja, para o nome provisório da campanha. */
  igreja: string
  trimestre: string
  declaradas: number
  /** Campanhas daquele trimestre já cadastradas que não vieram do relatório. */
  cadastradasSemOrigem: number
  semanaSanta: boolean
}

const timestamp = () => new Date().toISOString()
const localDateTime = (date: string, time: string) => `${date}T${time}`
const addDays = (date: string, days: number) => { const next = new Date(`${date}T12:00:00`); next.setDate(next.getDate() + days); return localDateKey(next) }
const isMonday = (date: string) => new Date(`${date}T12:00:00`).getDay() === 1
const history = (message: string): HistoryEntry => ({ id: crypto.randomUUID(), at: timestamp(), message })

function assertGoal(input: AnnualGoalInput) {
  // O cadastro começa simples: responsável e igrejas entram depois, no
  // acompanhamento, e nenhuma meta precisa de igreja para funcionar.
  if (!input.title.trim() || !input.year || !input.dueDate) throw new Error('Informe título, ano e data de fim da meta.')
  if (input.startDate && input.dueDate < input.startDate) throw new Error('A data de fim não pode ser antes do início.')
  if (input.title.length > 160 || input.description.length > 800 || input.notes.length > 2_000) throw new Error('Revise o tamanho dos textos da meta.')
}
function assertCampaign(input: EvangelismCampaignInput, isNew = false, metas?: MetasDaCampanha) {
  // A campanha informada no Relatório Integrado aconteceu, mas o relatório não traz data nem responsável: ela salva sem eles até alguém completar.
  const doRelatorio = Boolean(input.origemRelatorio)
  if (!input.name.trim()) throw new Error(doRelatorio ? 'Informe o nome da campanha.' : 'Informe nome e período válido para a campanha.')
  if (doRelatorio ? Boolean(input.startDate && input.endDate && input.endDate < input.startDate) : (!input.startDate || !input.endDate || input.endDate < input.startDate)) throw new Error('Informe nome e período válido para a campanha.')
  if (!input.churchIds.length) throw new Error('Escolha ao menos uma igreja envolvida.')
  if (!doRelatorio && !input.responsibleGeneral.trim()) throw new Error('Informe o responsável geral.')
  // Campanhas antigas continuam salvando; as novas nascem ligadas às metas.
  if (isNew && ((!input.studyGoalId && !((metas?.bible_studies ?? 0) > 0)) || (!input.baptismGoalId && !((metas?.baptisms ?? 0) > 0)))) throw new Error('Ligue a campanha a uma meta de estudos bíblicos e a uma meta de batismos.')
  if (input.name.length > 160 || input.description.length > 1_000 || input.notes.length > 2_000 || input.learnings.length > 2_000) throw new Error('Revise o tamanho dos textos da campanha.')
  if (input.points.some((point) => !point.name.trim() || !point.responsible.trim())) throw new Error('Informe nome e responsável de cada ponto.')
  if (input.tasks.some((task) => !task.title.trim() || !task.dueDate)) throw new Error('Informe título e prazo de cada tarefa.')
  if (input.budgetItems.some((item) => !item.description.trim() || !Number.isFinite(item.amount) || item.amount < 0)) throw new Error('Revise os itens do orçamento da campanha.')
}

export function defaultCampaignChecklist() { return DEFAULT_CAMPAIGN_CHECKLIST.map((label) => ({ id: crypto.randomUUID(), label, completed: false })) }

export class EvangelismPlanningService {
  private readonly repository: VaultRepository
  constructor(private readonly database: ApoioDatabase = db) { this.repository = new VaultRepository(database) }

  private async decode<T>(record: VaultRecord, key: CryptoKey, type: 'annual_goal' | 'evangelism_campaign'): Promise<T | null> { const payload = await readPayload(key, record, this.database); return payload?.type === type ? ({ id: record.id, ...(payload.data as object) } as T) : null }
  async listGoals(accountId: string, key: CryptoKey): Promise<AnnualGoalEntity[]> { const values = await Promise.all((await this.repository.list(accountId, 'annual_goal')).map((record) => this.decode<AnnualGoalEntity>(record, key, 'annual_goal'))); return values.filter((item): item is AnnualGoalEntity => Boolean(item)).sort((a, b) => a.dueDate.localeCompare(b.dueDate)) }
  async listCampaigns(accountId: string, key: CryptoKey): Promise<EvangelismCampaignEntity[]> { const values = await Promise.all((await this.repository.list(accountId, 'evangelism_campaign')).map((record) => this.decode<EvangelismCampaignEntity>(record, key, 'evangelism_campaign'))); return values.filter((item): item is EvangelismCampaignEntity => Boolean(item)).map((item) => ({ ...item, team: item.team ?? [], points: item.points ?? [], tasks: item.tasks ?? [], checklist: item.checklist?.length ? item.checklist : defaultCampaignChecklist(), budgetItems: item.budgetItems ?? [], followUps: item.followUps ?? [], history: item.history ?? [], additionalAgendaEventIds: item.additionalAgendaEventIds ?? [], planningAreas: item.planningAreas ?? [] })).sort((a, b) => a.startDate.localeCompare(b.startDate)) }
  /**
   * Cadastra as campanhas que o Relatório Integrado informou e que faltam no Evangelismo.
   *
   * Só depois de o pastor confirmar. A igreja afirmou que elas aconteceram:
   * nascem realizadas, com igreja, ano e trimestre, e sem data, local ou
   * responsável inventados — ficam a completar, sem Agenda. O identificador sai
   * da igreja, do trimestre e da posição, e o que falta é recalculado aqui:
   * tocar duas vezes, reabrir a página ou importar o mesmo PDF não duplica.
   */
  async registrarCampanhasDoRelatorio(accountId: string, key: CryptoKey, pedidos: ReadonlyArray<PedidoDeCampanhaDoRelatorio>): Promise<EvangelismCampaignEntity[]> {
    const campanhas = await this.listCampaigns(accountId, key); const now = timestamp(); const mutations: EncryptedMutation[] = []; const criadas: EvangelismCampaignEntity[] = []
    for (const pedido of pedidos) {
      const jaCriadas = campanhas.filter(({ origemRelatorio }) => origemRelatorio?.churchId === pedido.churchId && origemRelatorio.trimestre === pedido.trimestre).length
      const [ano, numero] = pedido.trimestre.split('-')
      // Recalculado aqui, e não na tela: um segundo toque, antes da tela recarregar, já encontra as criadas.
      const faltam = Math.max(0, pedido.declaradas - pedido.cadastradasSemOrigem - jaCriadas)
      for (let posicao = 1; posicao <= faltam; posicao += 1) {
        const indice = jaCriadas + posicao
        const id = await idDerivado(`relatorio-integrado:campanha:${accountId}:${pedido.churchId}:${pedido.trimestre}:${indice}`)
        if (campanhas.some((campanha) => campanha.id === id)) continue
        const name = nomeDaCampanhaDoRelatorio(pedido.igreja, indice, pedido.declaradas, pedido.semanaSanta)
        const data: EvangelismCampaignData = {
          name, objective: objetivoDoNome(name), churchIds: [pedido.churchId], startDate: '', endDate: '', location: '', address: '', responsibleGeneral: '', mainSpeaker: '', team: [], status: 'completed', description: '', notes: '',
          goalId: null, studyGoalId: null, baptismGoalId: null, planningAreas: [], additionalSchedule: 'none', mainAgendaEventId: null, additionalAgendaEventIds: [],
          points: [], tasks: [], checklist: defaultCampaignChecklist(), plannedBudget: 0, budgetItems: [], followUps: [], learnings: '',
          history: [history(`Informada pela igreja no Relatório Integrado do ${numero}º trimestre de ${ano}.`)], createdAt: now, updatedAt: now,
          aCompletar: true, origemRelatorio: { relatorioId: pedido.relatorioId, churchId: pedido.churchId, trimestre: pedido.trimestre, indice },
        }
        mutations.push(await this.campaignMutation(key, id, data))
        criadas.push({ id, ...data })
      }
    }
    if (mutations.length) await this.repository.applyEncryptedMutations(accountId, currentDeviceId(accountId), mutations)
    return criadas
  }

  /**
   * As campanhas que o botão antigo criou sem nome recebem o nome agora.
   *
   * O mesmo registro, com o mesmo identificador: nada é criado. Como a igreja
   * informou que elas aconteceram, passam a constar como concluídas. A que já
   * tem nome — escrito pelo pastor ou dado antes — não é tocada.
   */
  async nomearCampanhasDoRelatorio(accountId: string, key: CryptoKey, nomes: ReadonlyArray<{ id: string; name: string; objective: CampaignObjective }>): Promise<number> {
    const campanhas = await this.listCampaigns(accountId, key); const now = timestamp(); const mutations: EncryptedMutation[] = []
    for (const { id, name, objective } of nomes) {
      const atual = campanhas.find((campanha) => campanha.id === id)
      if (!atual || atual.name.trim() || !atual.origemRelatorio) continue
      const { id: _id, ...dados } = atual; void _id
      mutations.push(await this.campaignMutation(key, id, { ...dados, name, objective, status: 'completed', aCompletar: !dados.startDate, updatedAt: now, history: [...dados.history, history('Nome dado a partir do Relatório Integrado.')] }))
    }
    if (mutations.length) await this.repository.applyEncryptedMutations(accountId, currentDeviceId(accountId), mutations)
    return mutations.length
  }
  async getGoal(accountId: string, key: CryptoKey, id: string) { return (await this.listGoals(accountId, key)).find((item) => item.id === id) ?? null }
  async getCampaign(accountId: string, key: CryptoKey, id: string) { return (await this.listCampaigns(accountId, key)).find((item) => item.id === id) ?? null }

  private async goalMutation(accountId: string, key: CryptoKey, id: string, data: AnnualGoalData): Promise<EncryptedMutation> { return { recordId: id, recordType: 'annual_goal', envelope: await encryptPayload(key, { schemaVersion: 1, type: 'annual_goal', data }, id) } }
  private async campaignMutation(key: CryptoKey, id: string, data: EvangelismCampaignData): Promise<EncryptedMutation> { return { recordId: id, recordType: 'evangelism_campaign', envelope: await encryptPayload(key, { schemaVersion: 1, type: 'evangelism_campaign', data }, id) } }
  private async agendaMutation(key: CryptoKey, id: string, data: AgendaEventData): Promise<EncryptedMutation> { return { recordId: id, recordType: 'agenda_event', envelope: await encryptPayload(key, { schemaVersion: 1, type: 'agenda_event', data }, id) } }
  private agendaData(current: AgendaEventEntity | null, source: NonNullable<AgendaEventData['linkedSource']>, title: string, startAt: string, endAt: string, churchId: string | null, location: string, address: string, notes = ''): AgendaEventData { const now = timestamp(); return { title, category: 'event', churchId, location, address, visitTarget: 'none', sermonId: null, sermonSnapshot: null, ceremonyDetails: null, linkedSource: source, startAt, endAt, allDay: false, reminderMinutes: 60, notes, includeInItinerary: true, mondayException: isMonday(startAt.slice(0, 10)), createdAt: current?.createdAt ?? now, updatedAt: now } }

  async saveGoal(accountId: string, key: CryptoKey, input: AnnualGoalInput, id?: string): Promise<AnnualGoalEntity> {
    assertGoal(input); const current = id ? await this.getGoal(accountId, key, id) : null; if (id && !current) throw new Error('Meta anual não encontrada.')
    const goalId = id ?? crypto.randomUUID(); const now = timestamp(); const data: AnnualGoalData = { ...input, title: input.title.trim(), description: input.description.trim(), responsible: input.responsible.trim(), notes: input.notes.trim(), churchIds: [...new Set(input.churchIds)], campaignIds: current?.campaignIds ?? [], agendaEventIds: current?.agendaEventIds ?? [], history: [...(current?.history ?? []), history(current ? 'Meta anual atualizada.' : 'Meta anual criada.')], createdAt: current?.createdAt ?? now, updatedAt: now }
    await this.repository.applyEncryptedMutations(accountId, currentDeviceId(accountId), [await this.goalMutation(accountId, key, goalId, data)]); return { id: goalId, ...data }
  }

  /** Liga um compromisso já existente da Agenda à meta, sem repetir vínculo. */
  async linkGoalAgendaEvent(accountId: string, key: CryptoKey, goalId: string, eventId: string): Promise<AnnualGoalEntity> {
    const goal = await this.getGoal(accountId, key, goalId); if (!goal) throw new Error('Meta anual não encontrada.')
    if (goal.agendaEventIds.includes(eventId)) return goal
    const { id, ...current } = goal; const data: AnnualGoalData = { ...current, agendaEventIds: [...current.agendaEventIds, eventId], updatedAt: timestamp(), history: [...current.history, history('Compromisso da Agenda ligado à meta.')] }
    await this.repository.applyEncryptedMutations(accountId, currentDeviceId(accountId), [await this.goalMutation(accountId, key, id, data)]); return { id, ...data }
  }

  async unlinkGoalAgendaEvent(accountId: string, key: CryptoKey, goalId: string, eventId: string): Promise<AnnualGoalEntity> {
    const goal = await this.getGoal(accountId, key, goalId); if (!goal) throw new Error('Meta anual não encontrada.')
    const { id, ...current } = goal; const data: AnnualGoalData = { ...current, agendaEventIds: current.agendaEventIds.filter((value) => value !== eventId), updatedAt: timestamp(), history: [...current.history, history('Compromisso desligado da meta; ele continua na Agenda.')] }
    await this.repository.applyEncryptedMutations(accountId, currentDeviceId(accountId), [await this.goalMutation(accountId, key, id, data)]); return { id, ...data }
  }

  /**
   * Cria o compromisso na Agenda e o liga à meta. Se já houver um compromisso
   * ligado com o mesmo nome no mesmo dia, ele é reaproveitado — nada duplica.
   */
  async createGoalAgendaEvent(accountId: string, key: CryptoKey, goalId: string, input: { title: string; date: string; startTime: string; endTime: string; churchId: string | null; location: string }): Promise<{ goal: AnnualGoalEntity; eventId: string; reused: boolean }> {
    const goal = await this.getGoal(accountId, key, goalId); if (!goal) throw new Error('Meta anual não encontrada.')
    if (!input.title.trim() || !input.date) throw new Error('Informe o nome e a data do compromisso.')
    const events = (await Promise.all((await this.repository.list(accountId, 'agenda_event')).map(async (record) => { const payload = await readPayload(key, record, this.database); return payload?.type === 'agenda_event' ? ({ id: record.id, ...(payload.data as object) } as AgendaEventEntity) : null }))).filter((item): item is AgendaEventEntity => Boolean(item))
    const existente = events.find((event) => goal.agendaEventIds.includes(event.id) && event.title.trim().toLocaleLowerCase('pt-BR') === input.title.trim().toLocaleLowerCase('pt-BR') && event.startAt.slice(0, 10) === input.date)
    if (existente) return { goal, eventId: existente.id, reused: true }
    const eventId = crypto.randomUUID()
    // Compromisso comum da Agenda: o vínculo mora na meta, então ele continua
    // valendo por si mesmo se a meta for excluída.
    const agora = timestamp()
    const data: AgendaEventData = { title: input.title.trim(), category: 'event', churchId: input.churchId, location: input.location.trim(), address: '', visitTarget: 'none', sermonId: null, sermonSnapshot: null, ceremonyDetails: null, linkedSource: null, startAt: localDateTime(input.date, input.startTime || '19:00'), endAt: localDateTime(input.date, input.endTime || '20:30'), allDay: false, reminderMinutes: 60, notes: '', includeInItinerary: true, mondayException: isMonday(input.date), createdAt: agora, updatedAt: agora }
    const { id, ...current } = goal; const goalData: AnnualGoalData = { ...current, agendaEventIds: [...current.agendaEventIds, eventId], updatedAt: timestamp(), history: [...current.history, history('Compromisso criado na Agenda a partir da meta.')] }
    await this.repository.applyEncryptedMutations(accountId, currentDeviceId(accountId), [await this.agendaMutation(key, eventId, data), await this.goalMutation(accountId, key, id, goalData)])
    return { goal: { id, ...goalData }, eventId, reused: false }
  }

  async saveCampaign(accountId: string, key: CryptoKey, input: EvangelismCampaignInput, id?: string, createGoal?: AnnualGoalInput, metas?: MetasDaCampanha): Promise<{ campaign: EvangelismCampaignEntity; goal: AnnualGoalEntity | null; createdAgendaEvents: number }> {
    assertCampaign(input, !id, metas); if (createGoal) assertGoal(createGoal)
    const current = id ? await this.getCampaign(accountId, key, id) : null; if (id && !current) throw new Error('Campanha não encontrada.')
    const goals = await this.listGoals(accountId, key); const campaignId = id ?? crypto.randomUUID(); const now = timestamp()
    let goalId = input.goalId; let goal = goalId ? goals.find((item) => item.id === goalId) ?? null : null
    if (goalId && !goal) throw new Error('A meta anual escolhida não foi encontrada.')
    for (const linkedId of [input.studyGoalId, input.baptismGoalId]) if (linkedId && !goals.some((item) => item.id === linkedId)) throw new Error('A meta escolhida não foi encontrada.')
    if (createGoal) { goalId = crypto.randomUUID(); goal = { id: goalId, ...createGoal, title: createGoal.title.trim(), description: createGoal.description.trim(), responsible: createGoal.responsible.trim(), notes: createGoal.notes.trim(), campaignIds: [campaignId], agendaEventIds: [], references: createGoal.references ?? [], history: [history('Meta criada junto com a campanha.')], createdAt: now, updatedAt: now } }

    const agendaRecords = await this.repository.list(accountId, 'agenda_event'); const agendaEvents = (await Promise.all(agendaRecords.map(async (record) => { const payload = await readPayload(key, record, this.database); return payload?.type === 'agenda_event' ? ({ id: record.id, ...(payload.data as object) } as AgendaEventEntity) : null }))).filter((event): event is AgendaEventEntity => Boolean(event))
    const byId = new Map(agendaEvents.map((event) => [event.id, event])); const mutations: EncryptedMutation[] = []; const desiredAgendaIds = new Set<string>()
    // Sem data não há compromisso: a campanha informada no relatório não vira evento futuro na Agenda.
    const semData = !input.startDate; const endDate = input.endDate || input.startDate

    // As metas de estudos e de batismos são da campanha: nascem e mudam com ela, na mesma gravação.
    // Antes eram gravadas pela tela antes de a campanha ser conferida, e cada tentativa recusada deixava cópias.
    const vinculos = { studyGoalId: input.studyGoalId ?? null, baptismGoalId: input.baptismGoalId ?? null }
    const derivadas: EncryptedMutation[] = []
    for (const area of ['bible_studies', 'baptisms'] as const) {
      const campo = area === 'bible_studies' ? 'studyGoalId' : 'baptismGoalId'
      const alvo = metas?.[area] ?? 0
      const ligadaId = vinculos[campo]
      const existente = ligadaId ? goals.find((item) => item.id === ligadaId) ?? null : null
      if (!(alvo > 0) && existente?.linkedArea !== area) continue
      // Sem data não há período para a meta e nenhum dia é inventado: a campanha salva normalmente, e a meta espera as datas.
      if (semData) continue
      const metaId = existente?.id ?? await idDerivado(`campanha:${campaignId}:meta:${area}`)
      const base: AnnualGoalData = existente
        ? (({ id: _metaId, ...resto }) => { void _metaId; return resto })(existente)
        : { title: '', description: '', area: 'discipleship', year: 0, churchIds: [], responsible: '', dueDate: '', priority: 'normal', status: 'planned', notes: '', campaignIds: [], agendaEventIds: [], references: [], history: [history('Meta criada junto com a campanha.')], createdAt: now, updatedAt: now }
      derivadas.push(await this.goalMutation(accountId, key, metaId, {
        ...base, title: input.name.trim(), linkedArea: area, year: Number(input.startDate.slice(0, 4)), startDate: input.startDate, dueDate: endDate,
        target: alvo > 0 ? alvo : base.target ?? 0, churchIds: [...new Set(input.churchIds)], campaignIds: [...new Set([...base.campaignIds, campaignId])], updatedAt: now,
      }))
      vinculos[campo] = metaId
    }
    const mainAgendaEventId = semData ? current?.mainAgendaEventId ?? null : current?.mainAgendaEventId ?? crypto.randomUUID(); if (mainAgendaEventId && !semData) desiredAgendaIds.add(mainAgendaEventId)
    if (mainAgendaEventId && !semData) mutations.push(await this.agendaMutation(key, mainAgendaEventId, this.agendaData(byId.get(mainAgendaEventId) ?? null, { type: 'evangelism_campaign', id: campaignId, campaignId }, input.name.trim(), localDateTime(input.startDate, '19:00'), localDateTime(input.startDate, '21:00'), input.churchIds[0] ?? null, input.location, input.address, input.description)))

    const additionalDates: string[] = []; if (!semData && input.additionalSchedule !== 'none') { let cursor = addDays(input.startDate, input.additionalSchedule === 'daily' ? 1 : 7); const step = input.additionalSchedule === 'daily' ? 1 : 7; while (cursor <= endDate) { additionalDates.push(cursor); cursor = addDays(cursor, step) } }
    const additionalAgendaEventIds: string[] = []
    for (const [index, date] of additionalDates.entries()) { const eventId = current?.additionalAgendaEventIds[index] ?? crypto.randomUUID(); additionalAgendaEventIds.push(eventId); desiredAgendaIds.add(eventId); mutations.push(await this.agendaMutation(key, eventId, this.agendaData(byId.get(eventId) ?? null, { type: 'evangelism_campaign', id: campaignId, campaignId }, `${input.name.trim()} · encontro`, localDateTime(date, '19:00'), localDateTime(date, '21:00'), input.churchIds[0] ?? null, input.location, input.address))) }

    const points = input.points.map((point) => ({ ...point, id: point.id || crypto.randomUUID(), name: point.name.trim(), schedules: point.schedules.map((schedule) => ({ ...schedule, id: schedule.id || crypto.randomUUID(), agendaEventId: schedule.agendaEventId ?? crypto.randomUUID() })) }))
    for (const point of points) for (const schedule of point.schedules) { const eventId = schedule.agendaEventId; desiredAgendaIds.add(eventId); mutations.push(await this.agendaMutation(key, eventId, this.agendaData(byId.get(eventId) ?? null, { type: 'evangelism_point', id: point.id, campaignId }, `${input.name.trim()} · ${point.name}`, localDateTime(schedule.date, schedule.startTime), localDateTime(schedule.date, schedule.endTime), point.churchId, point.name, point.address, point.notes))) }

    const tasks = input.tasks.map((task) => ({ ...task, id: task.id || crypto.randomUUID(), agendaEventId: task.showInAgenda ? task.agendaEventId ?? crypto.randomUUID() : null }))
    for (const task of tasks.filter(({ showInAgenda }) => showInAgenda)) { const eventId = task.agendaEventId!; desiredAgendaIds.add(eventId); mutations.push(await this.agendaMutation(key, eventId, this.agendaData(byId.get(eventId) ?? null, { type: 'evangelism_task', id: task.id, campaignId }, `Lembrete · ${task.title}`, localDateTime(task.dueDate, '09:00'), localDateTime(task.dueDate, '10:00'), input.churchIds[0] ?? null, input.location, input.address, task.description))) }

    const oldAgendaIds = new Set([...(current?.additionalAgendaEventIds ?? []), ...(current?.points ?? []).flatMap((point) => point.schedules.map(({ agendaEventId }) => agendaEventId).filter(Boolean) as string[]), ...(current?.tasks ?? []).map(({ agendaEventId }) => agendaEventId).filter(Boolean) as string[]])
    for (const oldId of oldAgendaIds) if (!desiredAgendaIds.has(oldId) && byId.has(oldId)) mutations.push({ recordId: oldId, recordType: 'agenda_event', operation: 'delete', envelope: await encryptPayload(key, { schemaVersion: 1, type: 'agenda_event_tombstone', data: { deletedAt: now } }, oldId) })

    // Sem data, a campanha do relatório continua a completar; com data, deixa de estar.
    const { aCompletar: _aCompletar, ...semMarca } = input; void _aCompletar
    const data: EvangelismCampaignData = { ...semMarca, studyGoalId: vinculos.studyGoalId, baptismGoalId: vinculos.baptismGoalId, ...(input.origemRelatorio && semData ? { aCompletar: true } : {}), endDate, name: input.name.trim(), description: input.description.trim(), notes: input.notes.trim(), responsibleGeneral: input.responsibleGeneral.trim(), mainSpeaker: input.mainSpeaker.trim(), goalId, churchIds: [...new Set(input.churchIds)], planningAreas: [...new Set(input.planningAreas)], mainAgendaEventId, additionalAgendaEventIds, points, tasks, checklist: input.checklist.length ? input.checklist : defaultCampaignChecklist(), budgetItems: input.budgetItems.map((item) => ({ ...item, id: item.id || crypto.randomUUID() })), followUps: input.followUps.map((item) => ({ ...item, id: item.id || crypto.randomUUID() })), history: [...(current?.history ?? []), history(current ? 'Campanha atualizada e Agenda conferida.' : 'Campanha criada e adicionada à Agenda.')], createdAt: current?.createdAt ?? now, updatedAt: now }
    mutations.push(await this.campaignMutation(key, campaignId, data))

    // As metas ligadas guardam de quais campanhas vieram, sem repetir vínculo.
    const outrasMetas = [vinculos.studyGoalId, vinculos.baptismGoalId].filter((value): value is string => Boolean(value) && value !== goalId && !derivadas.some(({ recordId }) => recordId === value))
    for (const linkedId of [...new Set(outrasMetas)]) {
      const alvo = goals.find(({ id: goalItemId }) => goalItemId === linkedId)
      if (!alvo) continue
      const { id: alvoId, ...alvoData } = alvo
      mutations.push(await this.goalMutation(accountId, key, alvoId, { ...alvoData, campaignIds: [...new Set([...alvoData.campaignIds, campaignId])], updatedAt: now, history: alvoData.campaignIds.includes(campaignId) ? alvoData.history : [...alvoData.history, history('Campanha vinculada à meta.')] }))
    }
    const antigas = [current?.studyGoalId, current?.baptismGoalId].filter((value): value is string => Boolean(value) && ![vinculos.studyGoalId, vinculos.baptismGoalId, goalId ?? null].includes(value ?? null))
    for (const linkedId of [...new Set(antigas)]) {
      const alvo = goals.find(({ id: goalItemId }) => goalItemId === linkedId)
      if (!alvo) continue
      const { id: alvoId, ...alvoData } = alvo
      mutations.push(await this.goalMutation(accountId, key, alvoId, { ...alvoData, campaignIds: alvoData.campaignIds.filter((value) => value !== campaignId), updatedAt: now, history: [...alvoData.history, history('Campanha desvinculada da meta.')] }))
    }
    if (current?.goalId && current.goalId !== goalId) { const previous = goals.find(({ id: goalItemId }) => goalItemId === current.goalId); if (previous) { const { id: previousId, ...previousData } = previous; mutations.push(await this.goalMutation(accountId, key, previousId, { ...previousData, campaignIds: previousData.campaignIds.filter((value) => value !== campaignId), updatedAt: now, history: [...previousData.history, history('Campanha desvinculada da meta.')] })) } }
    if (goal) { const { id: savedGoalId, ...goalData } = goal; const savedGoal: AnnualGoalData = { ...goalData, campaignIds: [...new Set([...goalData.campaignIds, campaignId])], agendaEventIds: [...new Set([...goalData.agendaEventIds, ...(mainAgendaEventId ? [mainAgendaEventId] : []), ...additionalAgendaEventIds])], updatedAt: now, history: goalData.history.some(({ message }) => message === 'Campanha vinculada à meta.') ? goalData.history : [...goalData.history, history('Campanha vinculada à meta.')] }; mutations.push(await this.goalMutation(accountId, key, savedGoalId, savedGoal)); goal = { id: savedGoalId, ...savedGoal } }
    const unique = new Map<string, EncryptedMutation>(); for (const mutation of [...mutations, ...derivadas]) unique.set(mutation.recordId, mutation); await this.repository.applyEncryptedMutations(accountId, currentDeviceId(accountId), [...unique.values()])
    return { campaign: { id: campaignId, ...data }, goal, createdAgendaEvents: desiredAgendaIds.size }
  }

  async deleteGoal(accountId: string, key: CryptoKey, goalId: string) { const goal = await this.getGoal(accountId, key, goalId); if (!goal) throw new Error('Meta anual não encontrada.'); const campaigns = (await this.listCampaigns(accountId, key)).filter((item) => item.goalId === goalId || item.studyGoalId === goalId || item.baptismGoalId === goalId); const now = timestamp(); const mutations: EncryptedMutation[] = [{ recordId: goalId, recordType: 'annual_goal', operation: 'delete', envelope: await encryptPayload(key, { schemaVersion: 1, type: 'annual_goal_tombstone', data: { deletedAt: now } }, goalId) }]; for (const campaign of campaigns) { const { id, ...data } = campaign; mutations.push(await this.campaignMutation(key, id, { ...data, goalId: data.goalId === goalId ? null : data.goalId, studyGoalId: data.studyGoalId === goalId ? null : data.studyGoalId ?? null, baptismGoalId: data.baptismGoalId === goalId ? null : data.baptismGoalId ?? null, updatedAt: now, history: [...data.history, history('Meta anual removida; campanha preservada.')] })) } await this.repository.applyEncryptedMutations(accountId, currentDeviceId(accountId), mutations) }
  private async listarEventos(accountId: string, key: CryptoKey): Promise<AgendaEventEntity[]> { return (await Promise.all((await this.repository.list(accountId, 'agenda_event')).map(async (record) => { const payload = await readPayload(key, record, this.database); return payload?.type === 'agenda_event' ? ({ id: record.id, ...(payload.data as object) } as AgendaEventEntity) : null }))).filter((event): event is AgendaEventEntity => Boolean(event)) }
  private async tombstone(key: CryptoKey, tipo: TipoApagavel, id: string, deletedAt: string): Promise<EncryptedMutation> { return { recordId: id, recordType: tipo, operation: 'delete', envelope: await encryptPayload(key, { schemaVersion: 1, type: `${tipo}_tombstone`, data: { deletedAt } }, id) } }

  /**
   * O que sai junto com a campanha.
   *
   * Sai o que só existia por causa dela: os compromissos que ela projetou na
   * Agenda e as metas de estudos e batismos criadas pelo formulário dela, desde
   * que ninguém tenha escrito nada nelas. Metas com vida própria ficam, só sem o
   * vínculo. Compromisso comum da Agenda ligado a uma dessas metas não é
   * projeção: só sai se o pastor confirmar.
   */
  private async exclusaoDaCampanha(accountId: string, key: CryptoKey, campaignId: string) {
    const campaign = await this.getCampaign(accountId, key, campaignId); if (!campaign) throw new Error('Campanha não encontrada.')
    const [goals, events] = await Promise.all([this.listGoals(accountId, key), this.listarEventos(accountId, key)])
    const projecoes = new Set([campaign.mainAgendaEventId, ...campaign.additionalAgendaEventIds, ...campaign.points.flatMap((point) => point.schedules.map(({ agendaEventId }) => agendaEventId)), ...campaign.tasks.map(({ agendaEventId }) => agendaEventId), ...events.filter(({ linkedSource }) => linkedSource?.campaignId === campaignId).map(({ id }) => id)].filter((id): id is string => Boolean(id)))
    const ligadas = metasDaCampanha(campaign, goals)
    const derivada = (goal: AnnualGoalEntity) => (goal.linkedArea === 'bible_studies' || goal.linkedArea === 'baptisms') && (goal.id === campaign.studyGoalId || goal.id === campaign.baptismGoalId)
      && goal.campaignIds.every((id) => id === campaignId) && !metaTemDadosProprios({ ...goal, agendaEventIds: goal.agendaEventIds.filter((id) => !projecoes.has(id)) })
    const independentes = events.filter((event) => !projecoes.has(event.id) && !event.linkedSource && ligadas.some(({ agendaEventIds }) => agendaEventIds.includes(event.id)))
    return { campaign, ligadas, projecoes, derivada, independentes, existentes: new Set(events.map(({ id }) => id)) }
  }

  async planejarExclusaoDaCampanha(accountId: string, key: CryptoKey, campaignId: string): Promise<{ metasRemovidas: number; metasPreservadas: number; compromissosIndependentes: Array<{ id: string; title: string; startAt: string }> }> {
    const { ligadas, derivada, independentes } = await this.exclusaoDaCampanha(accountId, key, campaignId)
    return { metasRemovidas: ligadas.filter(derivada).length, metasPreservadas: ligadas.filter((goal) => !derivada(goal)).length, compromissosIndependentes: independentes.map(({ id, title, startAt }) => ({ id, title, startAt })) }
  }

  async deleteCampaign(accountId: string, key: CryptoKey, campaignId: string, apagarCompromissos: readonly string[] = []) {
    const { campaign, ligadas, projecoes, derivada, independentes, existentes } = await this.exclusaoDaCampanha(accountId, key, campaignId)
    const now = timestamp()
    const apagar = new Set([...projecoes].filter((id) => existentes.has(id)))
    for (const event of independentes) if (apagarCompromissos.includes(event.id)) apagar.add(event.id)
    const mutations: EncryptedMutation[] = [await this.tombstone(key, 'evangelism_campaign', campaign.id, now)]
    for (const id of apagar) mutations.push(await this.tombstone(key, 'agenda_event', id, now))
    for (const goal of ligadas) {
      if (derivada(goal)) { mutations.push(await this.tombstone(key, 'annual_goal', goal.id, now)); continue }
      const { id, ...data } = goal
      mutations.push(await this.goalMutation(accountId, key, id, { ...data, campaignIds: data.campaignIds.filter((value) => value !== campaignId), agendaEventIds: data.agendaEventIds.filter((value) => !apagar.has(value)), updatedAt: now, history: [...data.history, history('Campanha removida; meta preservada.')] }))
    }
    await this.repository.applyEncryptedMutations(accountId, currentDeviceId(accountId), mutations)
  }

  /** Só lê: encontra o que parece repetido e descreve cada correção. Nada é gravado. */
  async analisarCorrecoes(accountId: string, key: CryptoKey): Promise<GrupoDeCorrecao[]> {
    const [campanhas, metas, eventos] = await this.dadosDaRevisao(accountId, key)
    return gruposDeCorrecao(planejarConsolidacao(campanhas, metas, eventos), campanhas, metas, eventos)
  }

  private async dadosDaRevisao(accountId: string, key: CryptoKey): Promise<[EvangelismCampaignEntity[], AnnualGoalEntity[], AgendaEventEntity[]]> {
    return Promise.all([this.listCampaigns(accountId, key), this.listGoals(accountId, key), this.listarEventos(accountId, key)])
  }

  /**
   * Aplica só os grupos confirmados.
   *
   * O plano é refeito com os dados de agora e filtrado pelas chaves escolhidas.
   * Antes de gravar, a versão cifrada de cada registro que vai mudar é guardada
   * neste aparelho; se não for possível guardá-la, nada é alterado.
   */
  async aplicarCorrecoes(accountId: string, key: CryptoKey, chaves: readonly string[]): Promise<ResultadoDaConsolidacao> {
    const [campanhas, metas, eventos] = await this.dadosDaRevisao(accountId, key)
    const plano = filtrarPlano(planejarConsolidacao(campanhas, metas, eventos), new Set(chaves))
    const { mutations, resultado } = await this.mutacoesDaCorrecao(accountId, key, plano, campanhas, metas, eventos)
    if (!mutations.length) return resultado
    const antes = await this.database.vaultRecords.bulkGet(mutations.map(({ recordId }) => recordId))
    const copia: CopiaDaLimpeza = {
      // Só números: nomes de campanhas não saem do cofre cifrado.
      id: crypto.randomUUID(), criadaEm: timestamp(), resumo: { ...resultado, campanhas: [] },
      registros: antes.flatMap((registro) => registro ? [{ recordId: registro.id, recordType: registro.recordType, envelope: envelopeDe(registro), versaoDepois: 0 }] : []),
    }
    const anteriores = lerCopias(accountId)
    guardarCopias(accountId, [...anteriores, copia])
    await this.repository.applyEncryptedMutations(accountId, currentDeviceId(accountId), mutations)
    const depois = await this.database.vaultRecords.bulkGet(copia.registros.map(({ recordId }) => recordId))
    const confirmada = { ...copia, registros: copia.registros.map((registro, indice) => ({ ...registro, versaoDepois: depois[indice]?.version ?? 0 })) }
    try { guardarCopias(accountId, [...anteriores, confirmada]) } catch { /* a cópia sem as versões finais continua guardada; desfazer passa a pular os registros */ }
    return resultado
  }

  /** "Manter separados": fica registrado nos próprios registros, e o grupo não volta a ser apontado em nenhum aparelho. */
  async manterSeparados(accountId: string, key: CryptoKey, chave: string): Promise<void> {
    const [campanhas, metas, eventos] = await this.dadosDaRevisao(accountId, key)
    const plano = filtrarPlano(planejarConsolidacao(campanhas, metas, eventos), new Set([chave]))
    const now = timestamp(); const mutations: EncryptedMutation[] = []
    for (const { principalId, copiaIds } of plano.campanhasDuplicadas) {
      const principal = campanhas.find(({ id }) => id === principalId); if (!principal) continue
      const { id: _id, ...dados } = principal; void _id
      mutations.push(await this.campaignMutation(key, principalId, { ...dados, mantidaSeparadaDe: [...new Set([...(dados.mantidaSeparadaDe ?? []), ...copiaIds])], updatedAt: now, history: [...dados.history, history(`Revisão: mantida separada de ${copiaIds.length} campanha(s) de mesmo nome.`)] }))
    }
    for (const metaId of new Set([...plano.metasOrfas.map((orfa) => orfa.metaId), ...plano.ajustes.map((ajuste) => ajuste.metaId)])) {
      const meta = metas.find(({ id }) => id === metaId); if (!meta) continue
      const { id: _id, ...dados } = meta; void _id
      mutations.push(await this.goalMutation(accountId, key, metaId, { ...dados, mantidaSeparada: true, updatedAt: now, history: [...dados.history, history('Revisão: mantida separada da campanha de mesmo nome.')] }))
    }
    if (mutations.length) await this.repository.applyEncryptedMutations(accountId, currentDeviceId(accountId), mutations)
  }

  /** A limpeza mais recente que ainda pode ser desfeita neste aparelho. */
  ultimaLimpeza(accountId: string): { criadaEm: string; registros: number; resumo: ResultadoDaConsolidacao } | null {
    const copia = lerCopias(accountId).at(-1)
    return copia ? { criadaEm: copia.criadaEm, registros: copia.registros.length, resumo: copia.resumo } : null
  }

  /**
   * Volta cada registro à versão guardada antes da limpeza.
   *
   * Registro alterado depois da limpeza (em qualquer aparelho) não é
   * sobrescrito: a mudança mais nova é do pastor, e fica.
   */
  async desfazerUltimaLimpeza(accountId: string, key: CryptoKey): Promise<{ restaurados: number; ignorados: number }> {
    void key
    const copias = lerCopias(accountId); const copia = copias.at(-1)
    if (!copia) return { restaurados: 0, ignorados: 0 }
    const atuais = await this.database.vaultRecords.bulkGet(copia.registros.map(({ recordId }) => recordId))
    const mutations: EncryptedMutation[] = []; let ignorados = 0
    copia.registros.forEach((registro, indice) => {
      const atual = atuais[indice]
      if (!atual || !registro.versaoDepois || atual.version !== registro.versaoDepois) { ignorados += 1; return }
      mutations.push({ recordId: registro.recordId, recordType: registro.recordType, envelope: registro.envelope })
    })
    if (mutations.length) await this.repository.applyEncryptedMutations(accountId, currentDeviceId(accountId), mutations)
    guardarCopias(accountId, copias.slice(0, -1))
    return { restaurados: mutations.length, ignorados }
  }

  private async mutacoesDaCorrecao(accountId: string, key: CryptoKey, plano: PlanoDeConsolidacao, campanhas: EvangelismCampaignEntity[], metas: AnnualGoalEntity[], eventos: AgendaEventEntity[]): Promise<{ mutations: EncryptedMutation[]; resultado: ResultadoDaConsolidacao }> {
    const contar = (acao: 'ligar' | 'remover' | 'manter') => plano.metasOrfas.filter((orfa) => orfa.acao === acao).length
    const resultado: ResultadoDaConsolidacao = {
      campanhasExaminadas: plano.campanhasExaminadas, metasExaminadas: plano.metasExaminadas,
      copiasDeCampanha: plano.campanhasDuplicadas.reduce((soma, { copiaIds }) => soma + copiaIds.length, 0),
      metasRepetidas: plano.metasOrfas.length, metasRemovidas: contar('remover'), metasLigadas: contar('ligar'), metasPreservadas: contar('manter'),
      datasCorrigidas: plano.ajustes.length, campanhas: [],
    }
    if (planoVazio(plano)) return { mutations: [], resultado }

    const now = timestamp()
    const campanhasPorId = new Map(campanhas.map((campanha) => [campanha.id, campanha])); const metasPorId = new Map(metas.map((meta) => [meta.id, meta]))
    const campanhasMudadas = new Set<string>(); const metasMudadas = new Set<string>(); const apagar: Array<{ tipo: TipoApagavel; id: string }> = []
    const notas = new Map<string, string[]>(); const anotar = (id: string, texto: string) => notas.set(id, [...(notas.get(id) ?? []), texto])
    const rotulo = (area: 'bible_studies' | 'baptisms') => area === 'bible_studies' ? 'estudos bíblicos' : 'batismos'

    for (const { principalId, copiaIds } of plano.campanhasDuplicadas) {
      let principal = campanhasPorId.get(principalId)!
      for (const copiaId of copiaIds) {
        principal = unirCampanhas(principal, campanhasPorId.get(copiaId)!)
        apagar.push({ tipo: 'evangelism_campaign', id: copiaId }); campanhasPorId.delete(copiaId)
        for (const meta of metasPorId.values()) if (meta.campaignIds.includes(copiaId)) { metasPorId.set(meta.id, { ...meta, campaignIds: [...new Set(meta.campaignIds.map((id) => id === copiaId ? principalId : id))] }); metasMudadas.add(meta.id) }
      }
      campanhasPorId.set(principalId, principal); campanhasMudadas.add(principalId); anotar(principalId, `${copiaIds.length} cópia(s) técnica(s) unida(s) a esta campanha.`)
    }
    for (const id of plano.compromissosDaCopia) apagar.push({ tipo: 'agenda_event', id })
    const eventosMudados = eventos.flatMap((evento) => {
      const origem = evento.linkedSource; const grupo = origem ? plano.campanhasDuplicadas.find(({ copiaIds }) => copiaIds.includes(origem.campaignId)) : undefined
      return origem && grupo && !plano.compromissosDaCopia.includes(evento.id) ? [{ ...evento, linkedSource: { ...origem, campaignId: grupo.principalId } }] : []
    })

    for (const orfa of plano.metasOrfas) {
      const meta = metasPorId.get(orfa.metaId); const campanha = campanhasPorId.get(orfa.campanhaId); if (!meta || !campanha) continue
      const campo = orfa.area === 'bible_studies' ? 'studyGoalId' : 'baptismGoalId'
      if (orfa.acao === 'remover') {
        const ligadaId = campanha[campo]; const ligada = ligadaId ? metasPorId.get(ligadaId) : undefined
        if (ligada && !((ligada.target ?? 0) > 0) && (meta.target ?? 0) > 0) { metasPorId.set(ligada.id, { ...ligada, target: meta.target ?? 0 }); metasMudadas.add(ligada.id) }
        apagar.push({ tipo: 'annual_goal', id: meta.id }); metasPorId.delete(meta.id); metasMudadas.delete(meta.id)
        anotar(campanha.id, `meta repetida de ${rotulo(orfa.area)} removida.`)
        continue
      }
      metasPorId.set(meta.id, { ...meta, campaignIds: [...new Set([...meta.campaignIds.filter((id) => campanhasPorId.has(id)), campanha.id])] }); metasMudadas.add(meta.id)
      if (orfa.acao === 'ligar') { campanhasPorId.set(campanha.id, { ...campanha, [campo]: meta.id }); campanhasMudadas.add(campanha.id); anotar(campanha.id, `meta de ${rotulo(orfa.area)} ligada a esta campanha.`) }
      else anotar(campanha.id, `meta de ${rotulo(orfa.area)} com anotações próprias preservada e ligada a esta campanha.`)
    }

    for (const ajuste of plano.ajustes) {
      const meta = metasPorId.get(ajuste.metaId); if (!meta) continue
      if (meta.dueDate !== ajuste.dueDate || (meta.startDate ?? '') !== ajuste.startDate) anotar(ajuste.campanhaId, 'datas da meta alinhadas com as da campanha.')
      metasPorId.set(meta.id, { ...meta, title: ajuste.title, startDate: ajuste.startDate, dueDate: ajuste.dueDate, year: ajuste.year, churchIds: ajuste.churchIds, campaignIds: [...new Set([...meta.campaignIds.filter((id) => campanhasPorId.has(id)), ajuste.campanhaId])] })
      metasMudadas.add(meta.id)
    }

    const mutations: EncryptedMutation[] = []
    for (const id of new Set([...campanhasMudadas, ...notas.keys()])) {
      const campanha = campanhasPorId.get(id); if (!campanha) continue
      const { id: _id, ...dados } = campanha; void _id
      mutations.push(await this.campaignMutation(key, id, { ...dados, updatedAt: now, history: [...dados.history, ...(notas.get(id) ?? []).map((texto) => history(`Correção revisada: ${texto}`))] }))
    }
    for (const id of metasMudadas) {
      const meta = metasPorId.get(id); if (!meta) continue
      const { id: _id, ...dados } = meta; void _id
      mutations.push(await this.goalMutation(accountId, key, id, { ...dados, updatedAt: now, history: [...dados.history, history('Correção revisada com a campanha do Evangelismo.')] }))
    }
    for (const evento of eventosMudados) { const { id, ...dados } = evento; mutations.push(await this.agendaMutation(key, id, { ...dados, updatedAt: now })) }
    for (const { tipo, id } of apagar) mutations.push(await this.tombstone(key, tipo, id, now))
    const unicas = new Map<string, EncryptedMutation>(); for (const mutation of mutations) unicas.set(mutation.recordId, mutation)
    resultado.campanhas = [...notas.keys()].map((id) => campanhasPorId.get(id)?.name ?? '').filter(Boolean)
    return { mutations: [...unicas.values()], resultado }
  }
  async copyGoals(accountId: string, key: CryptoKey, goalIds: string[], targetYear: number): Promise<AnnualGoalEntity[]> { const sources = (await this.listGoals(accountId, key)).filter(({ id }) => goalIds.includes(id)); const copies: AnnualGoalEntity[] = []; for (const source of sources) { const due = source.dueDate ? `${targetYear}${source.dueDate.slice(4)}` : `${targetYear}-12-31`; copies.push(await this.saveGoal(accountId, key, { title: source.title, description: source.description, area: source.area, year: targetYear, churchIds: source.churchIds, responsible: source.responsible, dueDate: due, priority: source.priority, status: 'planned', notes: source.notes, references: source.references, ...(source.startDate ? { startDate: `${targetYear}${source.startDate.slice(4)}` } : {}), ...(source.target === undefined ? {} : { target: source.target }), linkedArea: source.linkedArea ?? null })) } return copies }
  async agendaConflicts(accountId: string, key: CryptoKey, startAt: string, endAt: string, editingId?: string): Promise<AgendaConflict[]> { const events = (await Promise.all((await this.repository.list(accountId, 'agenda_event')).map(async (record) => { const payload = await readPayload(key, record, this.database); return payload?.type === 'agenda_event' ? ({ id: record.id, ...(payload.data as object) } as AgendaEventEntity) : null }))).filter((event): event is AgendaEventEntity => Boolean(event)); const candidate = { title: 'Conferência de horário', category: 'event' as const, churchId: null, location: '', address: '', visitTarget: 'none' as const, sermonId: null, sermonSnapshot: null, ceremonyDetails: null, linkedSource: null, startAt, endAt, allDay: false, reminderMinutes: null, notes: '', includeInItinerary: true, mondayException: true }; return findAgendaConflicts(candidate, events, editingId) }
  async teamScheduleWarnings(accountId: string, key: CryptoKey, personId: string, campaign: Pick<EvangelismCampaignInput, 'startDate' | 'endDate'>, editingCampaignId?: string): Promise<string[]> { const campaigns = await this.listCampaigns(accountId, key); return campaigns.filter((item) => item.id !== editingCampaignId && item.status !== 'completed' && item.status !== 'cancelled' && item.startDate <= campaign.endDate && item.endDate >= campaign.startDate && (item.team.some((assignment) => assignment.personId === personId) || item.points.some((point) => point.teamPersonIds.includes(personId)))).map((item) => item.name) }
  async syncFromAgendaEvent(accountId: string, key: CryptoKey, event: AgendaEventEntity) { const source = event.linkedSource; if (!source) return; const campaign = await this.getCampaign(accountId, key, source.campaignId); if (!campaign) return; const { id, ...data } = campaign; if (source.type === 'evangelism_campaign' && event.id === campaign.mainAgendaEventId) { await this.saveCampaign(accountId, key, { ...data, name: event.title.replace(/^(Campanha · )/u, ''), startDate: event.startAt.slice(0, 10), location: event.location, address: event.address }, id); return } if (source.type === 'evangelism_point') { const points = data.points.map((point) => point.id !== source.id ? point : { ...point, name: event.title.split(' · ').slice(1).join(' · ') || point.name, schedules: point.schedules.map((schedule): PointSchedule => schedule.agendaEventId === event.id ? { ...schedule, date: event.startAt.slice(0, 10), startTime: event.startAt.slice(11, 16), endTime: event.endAt.slice(11, 16) } : schedule) }); await this.saveCampaign(accountId, key, { ...data, points }, id); return } const tasks = data.tasks.map((task) => task.id === source.id ? { ...task, title: event.title.replace(/^Lembrete · /u, ''), dueDate: event.startAt.slice(0, 10) } : task); await this.saveCampaign(accountId, key, { ...data, tasks }, id) }
}
