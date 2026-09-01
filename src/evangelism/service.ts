import { currentDeviceId } from '../auth/device'
import { decryptPayload, encryptPayload } from '../crypto/vault'
import { db, type ApoioDatabase } from '../db/database'
import { VaultRepository, type EncryptedMutation } from '../db/repository'
import type { VaultRecord } from '../db/types'
import type { AgendaConflict, AgendaEventData, AgendaEventEntity } from '../agenda/types'
import { findAgendaConflicts } from '../agenda/service'
import { DEFAULT_CAMPAIGN_CHECKLIST, type AnnualGoalData, type AnnualGoalEntity, type AnnualGoalInput, type EvangelismCampaignData, type EvangelismCampaignEntity, type EvangelismCampaignInput, type HistoryEntry, type PointSchedule } from './types'

const timestamp = () => new Date().toISOString()
const localDateTime = (date: string, time: string) => `${date}T${time}`
const addDays = (date: string, days: number) => { const next = new Date(`${date}T12:00:00`); next.setDate(next.getDate() + days); return next.toISOString().slice(0, 10) }
const isMonday = (date: string) => new Date(`${date}T12:00:00`).getDay() === 1
const history = (message: string): HistoryEntry => ({ id: crypto.randomUUID(), at: timestamp(), message })

function assertGoal(input: AnnualGoalInput) {
  // O cadastro começa simples: responsável e igrejas entram depois, no
  // acompanhamento, e nenhuma meta precisa de igreja para funcionar.
  if (!input.title.trim() || !input.year || !input.dueDate) throw new Error('Informe título, ano e data de fim da meta.')
  if (input.startDate && input.dueDate < input.startDate) throw new Error('A data de fim não pode ser antes do início.')
  if (input.title.length > 160 || input.description.length > 800 || input.notes.length > 2_000) throw new Error('Revise o tamanho dos textos da meta.')
}
function assertCampaign(input: EvangelismCampaignInput) {
  if (!input.name.trim() || !input.startDate || !input.endDate || input.endDate < input.startDate) throw new Error('Informe nome e período válido para a campanha.')
  if (!input.churchIds.length || !input.responsibleGeneral.trim()) throw new Error('Escolha ao menos uma igreja e informe o responsável geral.')
  if (input.name.length > 160 || input.description.length > 1_000 || input.notes.length > 2_000 || input.learnings.length > 2_000) throw new Error('Revise o tamanho dos textos da campanha.')
  if (input.points.some((point) => !point.name.trim() || !point.responsible.trim())) throw new Error('Informe nome e responsável de cada ponto.')
  if (input.tasks.some((task) => !task.title.trim() || !task.dueDate)) throw new Error('Informe título e prazo de cada tarefa.')
  if (input.budgetItems.some((item) => !item.description.trim() || !Number.isFinite(item.amount) || item.amount < 0)) throw new Error('Revise os itens do orçamento da campanha.')
}

export function defaultCampaignChecklist() { return DEFAULT_CAMPAIGN_CHECKLIST.map((label) => ({ id: crypto.randomUUID(), label, completed: false })) }

export class EvangelismPlanningService {
  private readonly repository: VaultRepository
  constructor(private readonly database: ApoioDatabase = db) { this.repository = new VaultRepository(database) }

  private async decode<T>(record: VaultRecord, key: CryptoKey, type: 'annual_goal' | 'evangelism_campaign'): Promise<T | null> { const payload = await decryptPayload(key, record); return payload.type === type ? ({ id: record.id, ...(payload.data as object) } as T) : null }
  async listGoals(accountId: string, key: CryptoKey): Promise<AnnualGoalEntity[]> { const values = await Promise.all((await this.repository.list(accountId, 'annual_goal')).map((record) => this.decode<AnnualGoalEntity>(record, key, 'annual_goal'))); return values.filter((item): item is AnnualGoalEntity => Boolean(item)).sort((a, b) => a.dueDate.localeCompare(b.dueDate)) }
  async listCampaigns(accountId: string, key: CryptoKey): Promise<EvangelismCampaignEntity[]> { const values = await Promise.all((await this.repository.list(accountId, 'evangelism_campaign')).map((record) => this.decode<EvangelismCampaignEntity>(record, key, 'evangelism_campaign'))); return values.filter((item): item is EvangelismCampaignEntity => Boolean(item)).map((item) => ({ ...item, team: item.team ?? [], points: item.points ?? [], tasks: item.tasks ?? [], checklist: item.checklist?.length ? item.checklist : defaultCampaignChecklist(), budgetItems: item.budgetItems ?? [], followUps: item.followUps ?? [], history: item.history ?? [], additionalAgendaEventIds: item.additionalAgendaEventIds ?? [], planningAreas: item.planningAreas ?? [] })).sort((a, b) => a.startDate.localeCompare(b.startDate)) }
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
    const events = (await Promise.all((await this.repository.list(accountId, 'agenda_event')).map(async (record) => { const payload = await decryptPayload(key, record); return payload.type === 'agenda_event' ? ({ id: record.id, ...(payload.data as object) } as AgendaEventEntity) : null }))).filter((item): item is AgendaEventEntity => Boolean(item))
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

  async saveCampaign(accountId: string, key: CryptoKey, input: EvangelismCampaignInput, id?: string, createGoal?: AnnualGoalInput): Promise<{ campaign: EvangelismCampaignEntity; goal: AnnualGoalEntity | null; createdAgendaEvents: number }> {
    assertCampaign(input); if (createGoal) assertGoal(createGoal)
    const current = id ? await this.getCampaign(accountId, key, id) : null; if (id && !current) throw new Error('Campanha não encontrada.')
    const goals = await this.listGoals(accountId, key); const campaignId = id ?? crypto.randomUUID(); const now = timestamp()
    let goalId = input.goalId; let goal = goalId ? goals.find((item) => item.id === goalId) ?? null : null
    if (goalId && !goal) throw new Error('A meta anual escolhida não foi encontrada.')
    if (createGoal) { goalId = crypto.randomUUID(); goal = { id: goalId, ...createGoal, title: createGoal.title.trim(), description: createGoal.description.trim(), responsible: createGoal.responsible.trim(), notes: createGoal.notes.trim(), campaignIds: [campaignId], agendaEventIds: [], references: createGoal.references ?? [], history: [history('Meta criada junto com a campanha.')], createdAt: now, updatedAt: now } }

    const agendaRecords = await this.repository.list(accountId, 'agenda_event'); const agendaEvents = (await Promise.all(agendaRecords.map(async (record) => { const payload = await decryptPayload(key, record); return payload.type === 'agenda_event' ? ({ id: record.id, ...(payload.data as object) } as AgendaEventEntity) : null }))).filter((event): event is AgendaEventEntity => Boolean(event))
    const byId = new Map(agendaEvents.map((event) => [event.id, event])); const mutations: EncryptedMutation[] = []; const desiredAgendaIds = new Set<string>()
    const mainAgendaEventId = current?.mainAgendaEventId ?? crypto.randomUUID(); desiredAgendaIds.add(mainAgendaEventId)
    const mainData = this.agendaData(byId.get(mainAgendaEventId) ?? null, { type: 'evangelism_campaign', id: campaignId, campaignId }, input.name.trim(), localDateTime(input.startDate, '19:00'), localDateTime(input.startDate, '21:00'), input.churchIds[0] ?? null, input.location, input.address, input.description)
    mutations.push(await this.agendaMutation(key, mainAgendaEventId, mainData))

    const additionalDates: string[] = []; if (input.additionalSchedule !== 'none') { let cursor = addDays(input.startDate, input.additionalSchedule === 'daily' ? 1 : 7); const step = input.additionalSchedule === 'daily' ? 1 : 7; while (cursor <= input.endDate) { additionalDates.push(cursor); cursor = addDays(cursor, step) } }
    const additionalAgendaEventIds: string[] = []
    for (const [index, date] of additionalDates.entries()) { const eventId = current?.additionalAgendaEventIds[index] ?? crypto.randomUUID(); additionalAgendaEventIds.push(eventId); desiredAgendaIds.add(eventId); mutations.push(await this.agendaMutation(key, eventId, this.agendaData(byId.get(eventId) ?? null, { type: 'evangelism_campaign', id: campaignId, campaignId }, `${input.name.trim()} · encontro`, localDateTime(date, '19:00'), localDateTime(date, '21:00'), input.churchIds[0] ?? null, input.location, input.address))) }

    const points = input.points.map((point) => ({ ...point, id: point.id || crypto.randomUUID(), name: point.name.trim(), schedules: point.schedules.map((schedule) => ({ ...schedule, id: schedule.id || crypto.randomUUID(), agendaEventId: schedule.agendaEventId ?? crypto.randomUUID() })) }))
    for (const point of points) for (const schedule of point.schedules) { const eventId = schedule.agendaEventId; desiredAgendaIds.add(eventId); mutations.push(await this.agendaMutation(key, eventId, this.agendaData(byId.get(eventId) ?? null, { type: 'evangelism_point', id: point.id, campaignId }, `${input.name.trim()} · ${point.name}`, localDateTime(schedule.date, schedule.startTime), localDateTime(schedule.date, schedule.endTime), point.churchId, point.name, point.address, point.notes))) }

    const tasks = input.tasks.map((task) => ({ ...task, id: task.id || crypto.randomUUID(), agendaEventId: task.showInAgenda ? task.agendaEventId ?? crypto.randomUUID() : null }))
    for (const task of tasks.filter(({ showInAgenda }) => showInAgenda)) { const eventId = task.agendaEventId!; desiredAgendaIds.add(eventId); mutations.push(await this.agendaMutation(key, eventId, this.agendaData(byId.get(eventId) ?? null, { type: 'evangelism_task', id: task.id, campaignId }, `Lembrete · ${task.title}`, localDateTime(task.dueDate, '09:00'), localDateTime(task.dueDate, '10:00'), input.churchIds[0] ?? null, input.location, input.address, task.description))) }

    const oldAgendaIds = new Set([...(current?.additionalAgendaEventIds ?? []), ...(current?.points ?? []).flatMap((point) => point.schedules.map(({ agendaEventId }) => agendaEventId).filter(Boolean) as string[]), ...(current?.tasks ?? []).map(({ agendaEventId }) => agendaEventId).filter(Boolean) as string[]])
    for (const oldId of oldAgendaIds) if (!desiredAgendaIds.has(oldId) && byId.has(oldId)) mutations.push({ recordId: oldId, recordType: 'agenda_event', operation: 'delete', envelope: await encryptPayload(key, { schemaVersion: 1, type: 'agenda_event_tombstone', data: { deletedAt: now } }, oldId) })

    const data: EvangelismCampaignData = { ...input, name: input.name.trim(), description: input.description.trim(), notes: input.notes.trim(), responsibleGeneral: input.responsibleGeneral.trim(), mainSpeaker: input.mainSpeaker.trim(), goalId, churchIds: [...new Set(input.churchIds)], planningAreas: [...new Set(input.planningAreas)], mainAgendaEventId, additionalAgendaEventIds, points, tasks, checklist: input.checklist.length ? input.checklist : defaultCampaignChecklist(), budgetItems: input.budgetItems.map((item) => ({ ...item, id: item.id || crypto.randomUUID() })), followUps: input.followUps.map((item) => ({ ...item, id: item.id || crypto.randomUUID() })), history: [...(current?.history ?? []), history(current ? 'Campanha atualizada e Agenda conferida.' : 'Campanha criada e adicionada à Agenda.')], createdAt: current?.createdAt ?? now, updatedAt: now }
    mutations.push(await this.campaignMutation(key, campaignId, data))

    if (current?.goalId && current.goalId !== goalId) { const previous = goals.find(({ id: goalItemId }) => goalItemId === current.goalId); if (previous) { const { id: previousId, ...previousData } = previous; mutations.push(await this.goalMutation(accountId, key, previousId, { ...previousData, campaignIds: previousData.campaignIds.filter((value) => value !== campaignId), updatedAt: now, history: [...previousData.history, history('Campanha desvinculada da meta.')] })) } }
    if (goal) { const { id: savedGoalId, ...goalData } = goal; const savedGoal: AnnualGoalData = { ...goalData, campaignIds: [...new Set([...goalData.campaignIds, campaignId])], agendaEventIds: [...new Set([...goalData.agendaEventIds, mainAgendaEventId, ...additionalAgendaEventIds])], updatedAt: now, history: goalData.history.some(({ message }) => message === 'Campanha vinculada à meta.') ? goalData.history : [...goalData.history, history('Campanha vinculada à meta.')] }; mutations.push(await this.goalMutation(accountId, key, savedGoalId, savedGoal)); goal = { id: savedGoalId, ...savedGoal } }
    const unique = new Map<string, EncryptedMutation>(); for (const mutation of mutations) unique.set(mutation.recordId, mutation); await this.repository.applyEncryptedMutations(accountId, currentDeviceId(accountId), [...unique.values()])
    return { campaign: { id: campaignId, ...data }, goal, createdAgendaEvents: desiredAgendaIds.size }
  }

  async deleteGoal(accountId: string, key: CryptoKey, goalId: string) { const goal = await this.getGoal(accountId, key, goalId); if (!goal) throw new Error('Meta anual não encontrada.'); const campaigns = (await this.listCampaigns(accountId, key)).filter(({ goalId: linkedGoalId }) => linkedGoalId === goalId); const now = timestamp(); const mutations: EncryptedMutation[] = [{ recordId: goalId, recordType: 'annual_goal', operation: 'delete', envelope: await encryptPayload(key, { schemaVersion: 1, type: 'annual_goal_tombstone', data: { deletedAt: now } }, goalId) }]; for (const campaign of campaigns) { const { id, ...data } = campaign; mutations.push(await this.campaignMutation(key, id, { ...data, goalId: null, updatedAt: now, history: [...data.history, history('Meta anual removida; campanha preservada.')] })) } await this.repository.applyEncryptedMutations(accountId, currentDeviceId(accountId), mutations) }
  async deleteCampaign(accountId: string, key: CryptoKey, campaignId: string) { const campaign = await this.getCampaign(accountId, key, campaignId); if (!campaign) throw new Error('Campanha não encontrada.'); const ids = [campaign.mainAgendaEventId, ...campaign.additionalAgendaEventIds, ...campaign.points.flatMap((point) => point.schedules.map(({ agendaEventId }) => agendaEventId)), ...campaign.tasks.map(({ agendaEventId }) => agendaEventId)].filter(Boolean) as string[]; const existingIds = new Set((await this.repository.list(accountId, 'agenda_event')).map(({ id }) => id)); const now = timestamp(); const mutations: EncryptedMutation[] = [{ recordId: campaignId, recordType: 'evangelism_campaign', operation: 'delete', envelope: await encryptPayload(key, { schemaVersion: 1, type: 'evangelism_campaign_tombstone', data: { deletedAt: now } }, campaignId) }]; for (const eventId of ids) if (existingIds.has(eventId)) mutations.push({ recordId: eventId, recordType: 'agenda_event', operation: 'delete', envelope: await encryptPayload(key, { schemaVersion: 1, type: 'agenda_event_tombstone', data: { deletedAt: now } }, eventId) }); if (campaign.goalId) { const goal = await this.getGoal(accountId, key, campaign.goalId); if (goal) { const { id, ...data } = goal; mutations.push(await this.goalMutation(accountId, key, id, { ...data, campaignIds: data.campaignIds.filter((value) => value !== campaignId), agendaEventIds: data.agendaEventIds.filter((value) => !ids.includes(value)), updatedAt: now, history: [...data.history, history('Campanha removida; meta preservada.')] })) } } await this.repository.applyEncryptedMutations(accountId, currentDeviceId(accountId), mutations) }
  async copyGoals(accountId: string, key: CryptoKey, goalIds: string[], targetYear: number): Promise<AnnualGoalEntity[]> { const sources = (await this.listGoals(accountId, key)).filter(({ id }) => goalIds.includes(id)); const copies: AnnualGoalEntity[] = []; for (const source of sources) { const due = source.dueDate ? `${targetYear}${source.dueDate.slice(4)}` : `${targetYear}-12-31`; copies.push(await this.saveGoal(accountId, key, { title: source.title, description: source.description, area: source.area, year: targetYear, churchIds: source.churchIds, responsible: source.responsible, dueDate: due, priority: source.priority, status: 'planned', notes: source.notes, references: source.references, ...(source.startDate ? { startDate: `${targetYear}${source.startDate.slice(4)}` } : {}), ...(source.target === undefined ? {} : { target: source.target }), linkedArea: source.linkedArea ?? null })) } return copies }
  async agendaConflicts(accountId: string, key: CryptoKey, startAt: string, endAt: string, editingId?: string): Promise<AgendaConflict[]> { const events = (await Promise.all((await this.repository.list(accountId, 'agenda_event')).map(async (record) => { const payload = await decryptPayload(key, record); return payload.type === 'agenda_event' ? ({ id: record.id, ...(payload.data as object) } as AgendaEventEntity) : null }))).filter((event): event is AgendaEventEntity => Boolean(event)); const candidate = { title: 'Conferência de horário', category: 'event' as const, churchId: null, location: '', address: '', visitTarget: 'none' as const, sermonId: null, sermonSnapshot: null, ceremonyDetails: null, linkedSource: null, startAt, endAt, allDay: false, reminderMinutes: null, notes: '', includeInItinerary: true, mondayException: true }; return findAgendaConflicts(candidate, events, editingId) }
  async teamScheduleWarnings(accountId: string, key: CryptoKey, personId: string, campaign: Pick<EvangelismCampaignInput, 'startDate' | 'endDate'>, editingCampaignId?: string): Promise<string[]> { const campaigns = await this.listCampaigns(accountId, key); return campaigns.filter((item) => item.id !== editingCampaignId && item.status !== 'completed' && item.status !== 'cancelled' && item.startDate <= campaign.endDate && item.endDate >= campaign.startDate && (item.team.some((assignment) => assignment.personId === personId) || item.points.some((point) => point.teamPersonIds.includes(personId)))).map((item) => item.name) }
  async syncFromAgendaEvent(accountId: string, key: CryptoKey, event: AgendaEventEntity) { const source = event.linkedSource; if (!source) return; const campaign = await this.getCampaign(accountId, key, source.campaignId); if (!campaign) return; const { id, ...data } = campaign; if (source.type === 'evangelism_campaign' && event.id === campaign.mainAgendaEventId) { await this.saveCampaign(accountId, key, { ...data, name: event.title.replace(/^(Campanha · )/u, ''), startDate: event.startAt.slice(0, 10), location: event.location, address: event.address }, id); return } if (source.type === 'evangelism_point') { const points = data.points.map((point) => point.id !== source.id ? point : { ...point, name: event.title.split(' · ').slice(1).join(' · ') || point.name, schedules: point.schedules.map((schedule): PointSchedule => schedule.agendaEventId === event.id ? { ...schedule, date: event.startAt.slice(0, 10), startTime: event.startAt.slice(11, 16), endTime: event.endAt.slice(11, 16) } : schedule) }); await this.saveCampaign(accountId, key, { ...data, points }, id); return } const tasks = data.tasks.map((task) => task.id === source.id ? { ...task, title: event.title.replace(/^Lembrete · /u, ''), dueDate: event.startAt.slice(0, 10) } : task); await this.saveCampaign(accountId, key, { ...data, tasks }, id) }
}
