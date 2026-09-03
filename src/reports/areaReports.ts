import { AGENDA_CATEGORY_LABELS, type AgendaEventEntity } from '../agenda/types'
import type { VisitEntity, VisitRoundEntity } from '../care/types'
import type { GoalArea } from '../goals/areas'
import { GOAL_AREA_LABELS } from '../goals/areas'
import { formatGoalValue } from '../goals/format'

const dataCurta = (valor: string) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(new Date(valor))

/**
 * Cada área monta o próprio relatório. As linhas ficam aqui, separadas da tela,
 * para o conteúdo poder ser conferido em teste sem abrir PDF.
 */
export function visitReportLines(visits: VisitEntity[], rounds: VisitRoundEntity[], scopeName: string): string[] {
  const pendentes = rounds.reduce((total, round) => total + Math.max(0, round.targetFamilyIds.length - round.visitedFamilyIds.length), 0)
  return [
    `Abrangência: ${scopeName}`,
    `Visitas: ${visits.length}`,
    `Pessoas: ${visits.filter((visit) => visit.targetType === 'person').length}`,
    `Famílias: ${visits.filter((visit) => visit.targetType === 'family').length}`,
    `Pendentes na rodada: ${pendentes}`,
  ]
}

/**
 * Relatório de agenda. `includeNames` libera o título e as observações, que são
 * onde os nomes aparecem — "Visita a Fulana", "Batismo de Beltrano". Sem marcar,
 * saem data, tipo e local: o relatório continua servindo para prestar contas do
 * trabalho sem entregar quem foi visitado.
 */
export function agendaReportLines(events: AgendaEventEntity[], churchName: (id: string | null) => string, includeNames = false): string[] {
  return [
    `Compromissos incluídos: ${events.length}`,
    ...events.flatMap((event) => [
      `${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', ...(event.allDay ? {} : { timeStyle: 'short' as const }) }).format(new Date(event.startAt))} · ${AGENDA_CATEGORY_LABELS[event.category]}`,
      ...(includeNames ? [event.title] : []),
      [churchName(event.churchId), event.location, event.address].filter(Boolean).join(' · '),
      ...(includeNames && event.notes ? [event.notes] : []),
      '',
    ]),
  ]
}

export interface GoalReportArea { area: GoalArea; target: number; result: number; percent: number }

export function goalsReportLines(year: number, areas: GoalReportArea[], mission: { interests: number; studies: number; pairs: number; classes: number; groups: number; uapgs: number }): string[] {
  return [
    `Ano: ${year}`,
    ...areas.map(({ area, target, result, percent }) => `${GOAL_AREA_LABELS[area]}: ${formatGoalValue(area, result)} de ${target > 0 ? formatGoalValue(area, target) : 'meta a definir'}${target > 0 ? ` · ${percent}%` : ''}`),
    '',
    'Missão e discipulado',
    `Interessados: ${mission.interests}`,
    `Estudos bíblicos: ${mission.studies}`,
    `Duplas missionárias ativas: ${mission.pairs}`,
    `Classes da Escola Sabatina: ${mission.classes}`,
    `Pequenos Grupos ativos: ${mission.groups}`,
    `UAPG ativas: ${mission.uapgs}`,
  ]
}

/**
 * Histórico de pregações. O título vem do compromisso e pode carregar nome de
 * pessoa — um batismo, um casamento, uma dedicação anotados ali. Por isso ele
 * segue a mesma regra do itinerário: sem marcar, saem data e igreja.
 */
export function sermonReportLines(preachings: AgendaEventEntity[], sermonCount: number, churchName: (id: string | null) => string, includeNames = false): string[] {
  return [
    `Pregações: ${preachings.length}`,
    ...preachings.map((event) => [
      dataCurta(event.startAt),
      churchName(event.churchId),
      ...(includeNames ? [event.sermonSnapshot?.title ?? event.title] : []),
    ].join(' · ')),
    `Sermões no acervo: ${sermonCount}`,
  ]
}
