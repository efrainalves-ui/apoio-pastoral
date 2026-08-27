import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { AgendaService } from '../agenda/service'
import { generateMasterKey } from '../crypto/vault'
import { ApoioDatabase } from '../db/database'
import { FamilyBudgetDatabase } from '../family-budget/database'
import { annualSummary, campaignBudget, campaignDashboard, isTaskDueSoon, isTaskUrgent } from './core'
import { buildCampaignReport, campaignReportLines } from './report'
import { defaultCampaignChecklist, EvangelismPlanningService } from './service'
import type { AnnualGoalInput, EvangelismCampaignInput } from './types'

const databases: ApoioDatabase[] = []
const familyDatabases: FamilyBudgetDatabase[] = []
const accountId = 'conta-ficticia-planejamento'
const goal = (overrides: Partial<AnnualGoalInput> = {}): AnnualGoalInput => ({ title: 'Meta missionária fictícia', description: 'Acompanhar uma ação inventada.', area: 'discipleship', year: 2026, churchIds: ['igreja-ficticia-a'], responsible: 'Responsável Fictício', dueDate: '2026-09-30', priority: 'high', status: 'planned', notes: '', references: [], ...overrides })
const campaign = (overrides: Partial<EvangelismCampaignInput> = {}): EvangelismCampaignInput => ({ name: 'Campanha Esperança Fictícia', objective: 'bible_series', churchIds: ['igreja-ficticia-a'], startDate: '2026-09-01', endDate: '2026-09-08', location: 'Salão Fictício', address: 'Endereço inventado', responsibleGeneral: 'Responsável Fictício', mainSpeaker: 'Orador Fictício', team: [], status: 'preparing', description: 'Série totalmente fictícia.', notes: '', goalId: null, planningAreas: ['discipleship'], additionalSchedule: 'none', points: [], tasks: [], checklist: defaultCampaignChecklist(), plannedBudget: 500, budgetItems: [], followUps: [], learnings: '', ...overrides })

afterEach(async () => {
  await Promise.all(databases.splice(0).map((database) => database.delete()))
  await Promise.all(familyDatabases.splice(0).map((database) => database.delete()))
  localStorage.clear()
})

function setup() {
  const database = new ApoioDatabase(`evangelism-${crypto.randomUUID()}`); databases.push(database)
  return { database, service: new EvangelismPlanningService(database), agenda: new AgendaService(database) }
}

describe('Planejamento Anual e Evangelismo integrados', () => {
  it('cria campanha e meta na mesma confirmação, liga a Agenda e não grava textos legíveis', async () => {
    const { database, service, agenda } = setup(); const key = await generateMasterKey()
    const result = await service.saveCampaign(accountId, key, campaign(), undefined, goal())
    expect(result.goal?.campaignIds).toContain(result.campaign.id)
    expect(result.campaign.goalId).toBe(result.goal?.id)
    expect(result.createdAgendaEvents).toBe(1)
    const events = await agenda.listEvents(accountId, key)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ title: 'Campanha Esperança Fictícia', linkedSource: { type: 'evangelism_campaign', campaignId: result.campaign.id } })
    expect(JSON.stringify(await database.vaultRecords.toArray())).not.toContain('Campanha Esperança Fictícia')
  })

  it('atualiza datas e local no mesmo compromisso, sem duplicar a Agenda, e aceita retorno da Agenda', async () => {
    const { service, agenda } = setup(); const key = await generateMasterKey()
    const created = (await service.saveCampaign(accountId, key, campaign())).campaign
    const updated = (await service.saveCampaign(accountId, key, campaign({ name: 'Campanha Renovada Fictícia', startDate: '2026-09-02', location: 'Praça Fictícia' }), created.id)).campaign
    expect(updated.mainAgendaEventId).toBe(created.mainAgendaEventId)
    expect(await agenda.listEvents(accountId, key)).toHaveLength(1)
    const linked = (await agenda.getEvent(accountId, key, updated.mainAgendaEventId!))!
    const changed = await agenda.updateEvent(accountId, key, linked.id, { ...linked, title: 'Campanha Editada na Agenda', startAt: '2026-09-03T19:00', endAt: '2026-09-03T21:00', mondayException: false })
    await service.syncFromAgendaEvent(accountId, key, changed)
    expect(await service.getCampaign(accountId, key, created.id)).toMatchObject({ name: 'Campanha Editada na Agenda', startDate: '2026-09-03' })
    expect(await agenda.listEvents(accountId, key)).toHaveLength(1)
  })

  it('organiza pontos, equipe, tarefas, orçamento da campanha e acompanhamentos sem duplicar cadastros', async () => {
    const { service, agenda } = setup(); const key = await generateMasterKey()
    const created = (await service.saveCampaign(accountId, key, campaign())).campaign
    const detailed = campaign({
      points: [{ id: 'ponto-ficticio', name: 'Ponto Fictício A', type: 'hall', churchId: 'igreja-ficticia-a', address: 'Local inventado', schedules: [{ id: 'horario-ficticio', date: '2026-09-02', startTime: '19:00', endTime: '21:00', agendaEventId: null }], responsible: 'Pessoa Fictícia A', speaker: 'Pessoa Fictícia B', teamPersonIds: ['pessoa-ficticia-a'], expectedPeople: 20, status: 'preparing', notes: '' }],
      team: [{ id: 'equipe-ficticia', personId: 'pessoa-ficticia-a', role: 'reception' }],
      tasks: [{ id: 'tarefa-ficticia', pointId: 'ponto-ficticio', title: 'Preparar recepção fictícia', description: '', responsibleId: 'pessoa-ficticia-a', responsibleName: 'Pessoa Fictícia A', dueDate: '2026-09-01', priority: 'urgent', status: 'not_started', notes: '', showInAgenda: true, agendaEventId: null }],
      budgetItems: [{ id: 'orcamento-ficticio', kind: 'expense', description: 'Material fictício', amount: 120, category: 'material', responsible: 'Pessoa Fictícia A', status: 'paid', date: '2026-08-28', notes: '' }],
      followUps: [{ id: 'acompanhamento-ficticio', type: 'interest', recordId: 'interessado-ficticio-a', churchId: 'igreja-ficticia-a', displayName: 'Interessado Fictício A', status: 'bible_study', notes: '' }],
    })
    const saved = (await service.saveCampaign(accountId, key, detailed, created.id)).campaign
    expect(saved.points).toHaveLength(1); expect(saved.team).toHaveLength(1); expect(saved.tasks).toHaveLength(1); expect(saved.followUps).toHaveLength(1)
    expect(campaignBudget(saved)).toMatchObject({ planned: 500, realizedExpenses: 120, currentBalance: -120 })
    expect((await agenda.listEvents(accountId, key))).toHaveLength(3)
    await service.saveCampaign(accountId, key, { ...detailed, tasks: [{ ...detailed.tasks[0]!, status: 'completed' }] }, created.id)
    expect((await agenda.listEvents(accountId, key))).toHaveLength(3)
  })

  it('mantém o orçamento de campanha separado do Orçamento Familiar', async () => {
    const { database, service } = setup(); const key = await generateMasterKey()
    const familyDatabase = new FamilyBudgetDatabase(`family-separate-${crypto.randomUUID()}`); familyDatabases.push(familyDatabase)
    await service.saveCampaign(accountId, key, campaign({ budgetItems: [{ id: 'despesa-ficticia', kind: 'expense', description: 'Divulgação fictícia', amount: 80, category: 'publicity', responsible: '', status: 'planned', date: '2026-08-25', notes: '' }] }))
    expect(await familyDatabase.records.count()).toBe(0)
    expect((await database.vaultRecords.where('recordType').equals('evangelism_campaign').count())).toBe(1)
  })

  it('avisa conflitos de horário e permite conferir escalas da equipe', async () => {
    const { service } = setup(); const key = await generateMasterKey()
    const first = (await service.saveCampaign(accountId, key, campaign({ team: [{ id: 'escala-ficticia', personId: 'pessoa-ficticia-a', role: 'music' }] }))).campaign
    expect(await service.teamScheduleWarnings(accountId, key, 'pessoa-ficticia-a', campaign({ startDate: '2026-09-05', endDate: '2026-09-10' }), 'outra-campanha')).toEqual([first.name])
    expect(await service.teamScheduleWarnings(accountId, key, 'pessoa-ficticia-b', campaign(), 'outra-campanha')).toEqual([])
    expect((await service.agendaConflicts(accountId, key, '2026-09-01T19:30', '2026-09-01T20:30'))[0]?.kind).toBe('overlap')
  })

  it('calcula atenção, resumo anual, relatório local e preserva registros ao excluir vínculos', async () => {
    const { service } = setup(); const key = await generateMasterKey()
    const savedGoal = await service.saveGoal(accountId, key, goal())
    const savedCampaign = (await service.saveCampaign(accountId, key, campaign({ goalId: savedGoal.id, tasks: [{ id: 'tarefa-ficticia', pointId: null, title: 'Tarefa Fictícia', description: '', responsibleId: null, responsibleName: '', dueDate: '2026-09-02', priority: 'urgent', status: 'not_started', notes: '', showInAgenda: false, agendaEventId: null }] }))).campaign
    expect(campaignDashboard([savedCampaign], '2026-09-01').urgentTasks).toBe(1)
    expect(isTaskUrgent(savedCampaign.tasks[0]!, '2026-09-01')).toBe(true)
    expect(isTaskDueSoon(savedCampaign.tasks[0]!, '2026-09-01')).toBe(true)
    expect(annualSummary([savedGoal], [savedCampaign], 2026)).toMatchObject({ planned: 1, campaigns: 0 })
    expect(campaignReportLines(savedCampaign)).not.toContain('Pessoa Fictícia')
    expect(new TextDecoder('latin1').decode(buildCampaignReport(savedCampaign))).toContain('%PDF-1.4')
    const copied = await service.copyGoals(accountId, key, [savedGoal.id], 2027)
    expect(copied[0]).toMatchObject({ year: 2027, status: 'planned', dueDate: '2027-09-30' })
    await service.deleteGoal(accountId, key, savedGoal.id)
    expect((await service.getCampaign(accountId, key, savedCampaign.id))?.goalId).toBeNull()
  })
})
