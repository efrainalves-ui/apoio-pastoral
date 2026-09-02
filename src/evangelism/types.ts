import type { GoalArea } from '../goals/areas'
export const PLANNING_AREAS = ['identity', 'leadership', 'new_generations', 'discipleship'] as const
export type PlanningArea = (typeof PLANNING_AREAS)[number]
export const PLANNING_AREA_LABELS: Record<PlanningArea, string> = { identity: 'Identidade', leadership: 'Liderança', new_generations: 'Novas gerações', discipleship: 'Discipulado' }
export const PLANNING_AREA_DESCRIPTIONS: Record<PlanningArea, string> = {
  identity: 'Vida espiritual, Bíblia, oração, crenças e preparo espiritual.',
  leadership: 'Formação, acompanhamento e fortalecimento de líderes.',
  new_generations: 'Crianças, adolescentes e jovens envolvidos na vida e missão da igreja.',
  discipleship: 'Interessados, estudos bíblicos, visitas, batismos, integração e acompanhamento.',
}

export type PlanningPriority = 'low' | 'normal' | 'high' | 'urgent'
export const PRIORITY_LABELS: Record<PlanningPriority, string> = { low: 'Baixa', normal: 'Normal', high: 'Alta', urgent: 'Urgente' }
export type AnnualGoalStatus = 'planned' | 'in_progress' | 'completed' | 'paused' | 'cancelled'
export const ANNUAL_GOAL_STATUS_LABELS: Record<AnnualGoalStatus, string> = { planned: 'Planejada', in_progress: 'Em andamento', completed: 'Concluída', paused: 'Pausada', cancelled: 'Cancelada' }
export interface HistoryEntry { id: string; at: string; message: string }
export interface PlanningReference { type: 'person' | 'interest' | 'bible_study' | 'visit' | 'prayer_request' | 'missionary_pair' | 'small_group' | 'sabbath_class' | 'uapg'; id: string; label: string }
export interface GoalChurchTarget { churchId: string; target: number }
export interface GoalChecklistItem { id: string; label: string; done: boolean }
export interface GoalActionPlan { what: string; how: string; where: string; who: string; actions: string; checklist: GoalChecklistItem[] }
export interface GoalBudgetItem { id: string; label: string; planned: number; spent: number }
export interface GoalProgressEntry { month: string; amount: number }

export const emptyActionPlan = (): GoalActionPlan => ({ what: '', how: '', where: '', who: '', actions: '', checklist: [] })

/**
 * Os campos do acompanhamento são opcionais de propósito: metas salvas antes
 * desta etapa continuam abrindo, e o cadastro novo começa só com o essencial.
 */
export interface AnnualGoalData {
  title: string; description: string; area: PlanningArea; year: number; churchIds: string[]; responsible: string; dueDate: string; priority: PlanningPriority; status: AnnualGoalStatus; notes: string
  campaignIds: string[]; agendaEventIds: string[]; references: PlanningReference[]; history: HistoryEntry[]; createdAt: string; updatedAt: string
  startDate?: string
  target?: number
  /** Financeiro, Batismos, Estudos Bíblicos ou UAPG, quando a meta se apoia numa delas. */
  linkedArea?: GoalArea | null
  churchTargets?: GoalChurchTarget[]
  actionPlan?: GoalActionPlan
  budget?: GoalBudgetItem[]
  budgetNotes?: string
  progress?: GoalProgressEntry[]
}
export interface AnnualGoalEntity extends AnnualGoalData { id: string }
export type AnnualGoalInput = Omit<AnnualGoalData, 'campaignIds' | 'agendaEventIds' | 'history' | 'createdAt' | 'updatedAt'>

export const CAMPAIGN_OBJECTIVES = ['holy_week', 'spring_evangelism', 'bible_series', 'harvest', 'social_action', 'bible_class', 'youth_evangelism', 'other'] as const
export type CampaignObjective = (typeof CAMPAIGN_OBJECTIVES)[number]
export const CAMPAIGN_OBJECTIVE_LABELS: Record<CampaignObjective, string> = { holy_week: 'Semana Santa', spring_evangelism: 'Evangelismo de Primavera', bible_series: 'Série bíblica', harvest: 'Colheita', social_action: 'Ação social', bible_class: 'Classe bíblica', youth_evangelism: 'Evangelismo jovem', other: 'Outro' }
export type CampaignStatus = 'planning' | 'preparing' | 'happening' | 'completed' | 'cancelled'
export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = { planning: 'Em planejamento', preparing: 'Em preparação', happening: 'Acontecendo', completed: 'Concluída', cancelled: 'Cancelada' }
export type TeamRole = 'general' | 'speaker' | 'music' | 'reception' | 'media' | 'sound' | 'children' | 'bible_classes' | 'visitation' | 'other'
export const TEAM_ROLE_LABELS: Record<TeamRole, string> = { general: 'Responsável geral', speaker: 'Orador', music: 'Música', reception: 'Recepção', media: 'Mídia', sound: 'Som', children: 'Ministério infantil', bible_classes: 'Classes bíblicas', visitation: 'Visitação', other: 'Outro papel' }
export interface TeamAssignment { id: string; personId: string; role: TeamRole }
export type PointType = 'church' | 'group' | 'home' | 'hall' | 'square' | 'other'
export const POINT_TYPE_LABELS: Record<PointType, string> = { church: 'Igreja', group: 'Grupo', home: 'Casa', hall: 'Salão', square: 'Praça', other: 'Outro local' }
export type PointStatus = 'planned' | 'preparing' | 'active' | 'completed' | 'cancelled'
export interface PointSchedule { id: string; date: string; startTime: string; endTime: string; agendaEventId: string | null }
export interface EvangelismPoint { id: string; name: string; type: PointType; churchId: string | null; address: string; schedules: PointSchedule[]; responsible: string; speaker: string; teamPersonIds: string[]; expectedPeople: number | null; status: PointStatus; notes: string }
export type EvangelismTaskStatus = 'not_started' | 'in_progress' | 'completed' | 'waiting'
export const EVANGELISM_TASK_STATUS_LABELS: Record<EvangelismTaskStatus, string> = { not_started: 'Não iniciada', in_progress: 'Em andamento', completed: 'Concluída', waiting: 'Aguardando' }
export interface EvangelismTask { id: string; pointId: string | null; title: string; description: string; responsibleId: string | null; responsibleName: string; dueDate: string; priority: PlanningPriority; status: EvangelismTaskStatus; notes: string; showInAgenda: boolean; agendaEventId: string | null }
export interface CampaignChecklistItem { id: string; label: string; completed: boolean }
export const DEFAULT_CAMPAIGN_CHECKLIST = ['Definir tema e datas', 'Confirmar orador', 'Confirmar local', 'Montar equipe', 'Preparar divulgação', 'Organizar recepção', 'Preparar classes bíblicas', 'Organizar som e mídia', 'Preparar material', 'Definir acompanhamento posterior', 'Fazer avaliação final']
export type BudgetKind = 'income' | 'expense'
export type BudgetCategory = 'publicity' | 'material' | 'transport' | 'food' | 'sound' | 'decoration' | 'rent' | 'social_action' | 'offering' | 'donation' | 'authorized_resource' | 'other'
export const BUDGET_CATEGORY_LABELS: Record<BudgetCategory, string> = { publicity: 'Divulgação', material: 'Material', transport: 'Transporte', food: 'Alimentação', sound: 'Som', decoration: 'Decoração', rent: 'Aluguel', social_action: 'Ação social', offering: 'Oferta', donation: 'Doação', authorized_resource: 'Recurso autorizado', other: 'Outra' }
export type BudgetStatus = 'planned' | 'paid' | 'pending' | 'cancelled'
export const BUDGET_STATUS_LABELS: Record<BudgetStatus, string> = { planned: 'Previsto', paid: 'Pago', pending: 'Pendente', cancelled: 'Cancelado' }
export interface CampaignBudgetItem { id: string; kind: BudgetKind; description: string; amount: number; category: BudgetCategory; responsible: string; status: BudgetStatus; date: string; notes: string }
export type FollowUpType = 'person' | 'interest' | 'bible_study' | 'prayer_request' | 'visit' | 'missionary_pair' | 'small_group' | 'sabbath_class' | 'uapg'
export type FollowUpStatus = 'first_contact' | 'bible_study' | 'following' | 'decision' | 'baptism_preparation' | 'integrated' | 'no_recent_contact'
export const FOLLOW_UP_STATUS_LABELS: Record<FollowUpStatus, string> = { first_contact: 'Primeiro contato', bible_study: 'Em estudo bíblico', following: 'Acompanhando', decision: 'Decisão', baptism_preparation: 'Preparação para batismo', integrated: 'Integrado', no_recent_contact: 'Sem contato recente' }
export interface CampaignFollowUp { id: string; type: FollowUpType; recordId: string; churchId: string | null; displayName: string; status: FollowUpStatus; notes: string }
export type AdditionalSchedule = 'none' | 'daily' | 'weekly'
export interface EvangelismCampaignData {
  name: string; objective: CampaignObjective; churchIds: string[]; startDate: string; endDate: string; location: string; address: string; responsibleGeneral: string; mainSpeaker: string; team: TeamAssignment[]; status: CampaignStatus; description: string; notes: string
  goalId: string | null; /** Toda campanha nova se apoia numa meta de estudos bíblicos e numa de batismos. */ studyGoalId?: string | null; baptismGoalId?: string | null; planningAreas: PlanningArea[]; additionalSchedule: AdditionalSchedule; mainAgendaEventId: string | null; additionalAgendaEventIds: string[]
  points: EvangelismPoint[]; tasks: EvangelismTask[]; checklist: CampaignChecklistItem[]; plannedBudget: number; budgetItems: CampaignBudgetItem[]; followUps: CampaignFollowUp[]; learnings: string; history: HistoryEntry[]; createdAt: string; updatedAt: string
}
export interface EvangelismCampaignEntity extends EvangelismCampaignData { id: string }
export type EvangelismCampaignInput = Omit<EvangelismCampaignData, 'mainAgendaEventId' | 'additionalAgendaEventIds' | 'history' | 'createdAt' | 'updatedAt'>

export interface CampaignDashboardSummary { planning: number; preparing: number; happening: number; completed: number; urgentTasks: number; dueSoonTasks: number }
export interface CampaignBudgetSummary { planned: number; income: number; realizedExpenses: number; projectedBalance: number; currentBalance: number; pending: number }
