import type { GoalArea } from './areas'

/** Financeiro aparece em reais; as demais metas são contagens. */
export function formatGoalValue(area: GoalArea, value: number): string {
  if (area !== 'financial') return String(value)
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value)
}

export const MONTH_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
