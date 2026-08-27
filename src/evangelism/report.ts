import { buildLocalReportPdf } from '../reports/localPdf'
import { campaignBudget } from './core'
import { CAMPAIGN_OBJECTIVE_LABELS, CAMPAIGN_STATUS_LABELS, FOLLOW_UP_STATUS_LABELS, type EvangelismCampaignEntity } from './types'

export function campaignReportLines(campaign: EvangelismCampaignEntity, includePeople = false): string[] {
  const budget = campaignBudget(campaign); const activeTasks = campaign.tasks.filter(({ status }) => status !== 'completed')
  return [
    `Campanha: ${campaign.name}`,
    `Objetivo: ${CAMPAIGN_OBJECTIVE_LABELS[campaign.objective]}`,
    `Período: ${campaign.startDate} a ${campaign.endDate}`,
    `Situação: ${CAMPAIGN_STATUS_LABELS[campaign.status]}`,
    `Pontos realizados: ${campaign.points.filter(({ status }) => status === 'completed').length} de ${campaign.points.length}`,
    `Eventos organizados: ${1 + campaign.additionalAgendaEventIds.length + campaign.points.reduce((total, point) => total + point.schedules.length, 0)}`,
    `Equipe: ${campaign.team.length} participação(ões)`,
    `Orçamento previsto: R$ ${budget.planned.toFixed(2)}`,
    `Entradas registradas: R$ ${budget.income.toFixed(2)}`,
    `Despesas realizadas: R$ ${budget.realizedExpenses.toFixed(2)}`,
    `Tarefas pendentes: ${activeTasks.length}`,
    `Acompanhamentos: ${campaign.followUps.length}`,
    ...Object.entries(FOLLOW_UP_STATUS_LABELS).map(([status, label]) => `${label}: ${campaign.followUps.filter((item) => item.status === status).length}`),
    ...(includePeople ? campaign.followUps.map((item) => `${item.displayName} · ${FOLLOW_UP_STATUS_LABELS[item.status]}`) : []),
    '', 'Aprendizados:', campaign.learnings || 'Ainda não registrados.',
  ]
}
export function buildCampaignReport(campaign: EvangelismCampaignEntity, includePeople = false) { return buildLocalReportPdf(`Encerramento · ${campaign.name}`, campaignReportLines(campaign, includePeople)) }
export function previewCampaignReport(campaign: EvangelismCampaignEntity, includePeople = false) { const bytes = buildCampaignReport(campaign, includePeople); const url = URL.createObjectURL(new Blob([new Uint8Array(bytes).buffer], { type: 'application/pdf' })); window.open(url, '_blank', 'noopener'); window.setTimeout(() => URL.revokeObjectURL(url), 60_000) }
