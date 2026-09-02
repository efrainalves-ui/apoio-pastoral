import type { GoalEntity, GoalEntryEntity, GoalHistoryEntity, GoalMetric } from './types'

/** As quatro metas que o pastor acompanha. */
export type GoalArea = 'financial' | 'baptisms' | 'bible_studies' | 'uapg'

export const GOAL_AREAS: GoalArea[] = ['financial', 'baptisms', 'bible_studies', 'uapg']

export const GOAL_AREA_LABELS: Record<GoalArea, string> = {
  financial: 'Financeiro',
  baptisms: 'Batismos',
  bible_studies: 'Estudos Bíblicos',
  uapg: 'UAPG — Unidades de Ação e Pequenos Grupos Integrados',
}

/** Nome curto, para o resumo da tela inicial. */
export const GOAL_AREA_SHORT: Record<GoalArea, string> = {
  financial: 'Financeiro', baptisms: 'Batismos', bible_studies: 'Estudos', uapg: 'UAPG',
}

/**
 * Batismos, rebatismos e profissões de fé viram uma única meta para o pastor.
 * Os lançamentos antigos continuam existindo com o indicador de origem; aqui
 * eles apenas somam no mesmo lugar.
 */
export const AREA_METRICS: Record<GoalArea, GoalMetric[]> = {
  financial: ['tithes_offerings'],
  baptisms: ['baptisms', 'rebaptisms', 'professions_faith'],
  bible_studies: ['bible_studies'],
  uapg: ['uapg'],
}

/** Onde a meta anual daquela área é guardada. */
export const AREA_TARGET_METRIC: Record<GoalArea, GoalMetric> = {
  financial: 'tithes_offerings', baptisms: 'baptisms', bible_studies: 'bible_studies', uapg: 'uapg',
}

/** Áreas alimentadas por PDF; as outras vêm do que já está cadastrado. */
export const AREA_USES_PDF: Record<GoalArea, boolean> = {
  financial: true, baptisms: true, bible_studies: false, uapg: false,
}

export interface AreaSources {
  entries: GoalEntryEntity[]
  studies: Array<{ churchId: string; startedAt: string }>
  uapgs: Array<{ churchId: string; createdAt: string; active: boolean }>
  /** Resultados de anos fechados, guardados só para comparação. */
  history?: GoalHistoryEntity[]
}

export interface AreaResult { churchId: string; date: string; amount: number }

/**
 * Resultados da área no ano. Estudos e UAPG são lidos dos próprios cadastros,
 * para o pastor não precisar lançar a mesma informação duas vezes.
 */
export function areaResults(area: GoalArea, sources: AreaSources, year: number): AreaResult[] {
  const ano = String(year)
  if (area === 'bible_studies') {
    return sources.studies
      .filter(({ startedAt }) => startedAt.startsWith(ano))
      .map(({ churchId, startedAt }) => ({ churchId, date: startedAt.slice(0, 10), amount: 1 }))
  }
  if (area === 'uapg') {
    return sources.uapgs
      .filter(({ active, createdAt }) => active && createdAt.startsWith(ano))
      .map(({ churchId, createdAt }) => ({ churchId, date: createdAt.slice(0, 10), amount: 1 }))
  }
  const metrics = AREA_METRICS[area]
  return sources.entries
    .filter((entry) => metrics.includes(entry.metric) && entry.date.startsWith(ano))
    .map(({ churchId, date, amount }) => ({ churchId, date, amount }))
}

export interface AreaProgress {
  area: GoalArea
  target: number
  result: number
  percent: number
  missing: number
  /** Soma das metas das igrejas, para conferir com a meta do distrito. */
  churchTargetsSum: number
  targetsMismatch: boolean
  reached: boolean
}

export function districtTarget(goals: GoalEntity[], area: GoalArea, year: number): number {
  return goals.find((goal) => goal.churchId === null && goal.year === year && goal.metric === AREA_TARGET_METRIC[area])?.target ?? 0
}

export function churchTarget(goals: GoalEntity[], area: GoalArea, year: number, churchId: string): number {
  return goals.find((goal) => goal.churchId === churchId && goal.year === year && goal.metric === AREA_TARGET_METRIC[area])?.target ?? 0
}

export function areaProgress(area: GoalArea, goals: GoalEntity[], sources: AreaSources, year: number): AreaProgress {
  const target = districtTarget(goals, area, year)
  // O resultado do distrito é a soma do que veio das igrejas, contado uma vez só.
  const result = areaResults(area, sources, year).reduce((soma, item) => soma + item.amount, 0)
  const churchTargetsSum = goals
    .filter((goal) => goal.churchId !== null && goal.year === year && goal.metric === AREA_TARGET_METRIC[area])
    .reduce((soma, goal) => soma + goal.target, 0)

  return {
    area,
    target,
    result,
    percent: target > 0 ? Math.min(100, Math.round((result / target) * 100)) : 0,
    missing: Math.max(0, target - result),
    churchTargetsSum,
    targetsMismatch: target > 0 && churchTargetsSum > 0 && churchTargetsSum !== target,
    reached: target > 0 && result >= target,
  }
}

/** Resultado mês a mês, de janeiro a dezembro. */
export function monthlyResults(area: GoalArea, sources: AreaSources, year: number): number[] {
  const meses = Array.from({ length: 12 }, () => 0)
  for (const item of areaResults(area, sources, year)) {
    const mes = Number(item.date.slice(5, 7)) - 1
    if (mes >= 0 && mes < 12) meses[mes] = (meses[mes] ?? 0) + item.amount
  }
  return meses
}

export interface ChurchProgress { churchId: string; target: number; result: number; percent: number }

/** Metas e resultados por igreja, sem ordenar por desempenho. */
export function churchProgress(area: GoalArea, goals: GoalEntity[], sources: AreaSources, year: number, churchIds: string[]): ChurchProgress[] {
  const resultados = areaResults(area, sources, year)
  return churchIds.map((churchId) => {
    const target = churchTarget(goals, area, year, churchId)
    const result = resultados.filter((item) => item.churchId === churchId).reduce((soma, item) => soma + item.amount, 0)
    return { churchId, target, result, percent: target > 0 ? Math.min(100, Math.round((result / target) * 100)) : 0 }
  })
}

/**
 * Resultado de um ano já encerrado. Vale o consolidado que o pastor registrou;
 * sem ele, vale o que estiver lançado naquele ano. Nunca soma os dois.
 */
export function previousResult(area: GoalArea, sources: AreaSources, year: number): number {
  const consolidado = (sources.history ?? []).find((item) => item.area === area && item.year === year)
  if (consolidado) return consolidado.amount
  return areaResults(area, sources, year).reduce((soma, item) => soma + item.amount, 0)
}

export interface AreaComparison extends AreaProgress {
  /** Resultado do ano anterior, quando existe. */
  previous: number
  hasPrevious: boolean
  /** Diferença do ano corrente para o anterior. */
  difference: number
}

export function areaComparison(area: GoalArea, goals: GoalEntity[], sources: AreaSources, year: number): AreaComparison {
  const progresso = areaProgress(area, goals, sources, year)
  const previous = previousResult(area, sources, year - 1)
  return { ...progresso, previous, hasPrevious: previous > 0, difference: progresso.result - previous }
}
