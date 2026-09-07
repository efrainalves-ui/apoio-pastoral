import { areaProgress, areaResults, type AreaSources, type GoalArea } from '../goals/areas'
import type { AnnualGoalEntity, GoalBudgetItem, GoalProgressEntry } from './types'

export interface GoalTracking {
  target: number
  result: number
  percent: number
  missing: number
  /** Quando a meta se apoia numa das quatro áreas, o resultado vem de lá. */
  automatic: boolean
  churchTargetsSum: number
  targetsMismatch: boolean
  status: 'in_progress' | 'reached' | 'missed'
}

function totalManual(progress: GoalProgressEntry[] | undefined): number {
  return (progress ?? []).reduce((soma, item) => soma + item.amount, 0)
}

/**
 * Resultado da meta. Se ela estiver ligada a Financeiro, Batismos, Estudos ou
 * UAPG, o número vem da própria área — o pastor não lança a mesma coisa duas
 * vezes. Sem vínculo, vale o que ele registrou mês a mês.
 */
export function trackGoal(goal: AnnualGoalEntity, sources: AreaSources, hoje: Date = new Date()): GoalTracking {
  const target = goal.target ?? 0
  const automatic = Boolean(goal.linkedArea)
  const result = goal.linkedArea
    ? areaProgress(goal.linkedArea, [], sources, goal.year).result
    : totalManual(goal.progress)

  const churchTargetsSum = (goal.churchTargets ?? []).reduce((soma, item) => soma + item.target, 0)
  const encerrada = goal.dueDate ? new Date(`${goal.dueDate}T23:59:59`).getTime() < hoje.getTime() : false

  return {
    target,
    result,
    percent: target > 0 ? Math.min(100, Math.round((result / target) * 100)) : 0,
    missing: Math.max(0, target - result),
    automatic,
    churchTargetsSum,
    targetsMismatch: target > 0 && churchTargetsSum > 0 && churchTargetsSum !== target,
    status: target > 0 && result >= target ? 'reached' : encerrada ? 'missed' : 'in_progress',
  }
}

export const GOAL_STATUS_LABELS: Record<GoalTracking['status'], string> = {
  in_progress: 'Em andamento', reached: 'Alcançada', missed: 'Não alcançada',
}

/** Resultado mês a mês: da área vinculada ou do que foi registrado à mão. */
export function goalMonthlyResults(goal: AnnualGoalEntity, sources: AreaSources): number[] {
  const meses = Array.from({ length: 12 }, () => 0)
  if (goal.linkedArea) {
    for (const item of areaResults(goal.linkedArea, sources, goal.year)) {
      const mes = Number(item.date.slice(5, 7)) - 1
      if (mes >= 0 && mes < 12) meses[mes] = (meses[mes] ?? 0) + item.amount
    }
    return meses
  }
  for (const item of goal.progress ?? []) {
    const mes = Number(item.month.slice(5, 7)) - 1
    if (mes >= 0 && mes < 12) meses[mes] = (meses[mes] ?? 0) + item.amount
  }
  return meses
}

export interface GoalChurchResult { churchId: string; target: number; result: number; percent: number }

/** Só faz sentido quando o pastor dividiu a meta entre igrejas. */
export function goalChurchResults(goal: AnnualGoalEntity, sources: AreaSources): GoalChurchResult[] {
  const resultados = goal.linkedArea ? areaResults(goal.linkedArea, sources, goal.year) : []
  return (goal.churchTargets ?? []).map(({ churchId, target }) => {
    const result = resultados.filter((item) => item.churchId === churchId).reduce((soma, item) => soma + item.amount, 0)
    return { churchId, target, result, percent: target > 0 ? Math.min(100, Math.round((result / target) * 100)) : 0 }
  })
}

export interface GoalBudget { planned: number; spent: number; balance: number }

/** Orçamento da meta pastoral, separado do Orçamento Familiar. */
export function goalBudget(items: GoalBudgetItem[] | undefined): GoalBudget {
  const planned = (items ?? []).reduce((soma, item) => soma + item.planned, 0)
  const spent = (items ?? []).reduce((soma, item) => soma + item.spent, 0)
  return { planned, spent, balance: planned - spent }
}

export const LINKABLE_AREAS: GoalArea[] = ['tithes', 'offerings', 'baptisms', 'bible_studies', 'uapg']
