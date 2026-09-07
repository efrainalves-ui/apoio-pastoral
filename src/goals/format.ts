import { ehFinanceira, type GoalArea } from './areas'

/** Dízimos e ofertas aparecem em reais; as demais metas são contagens. */
export function formatGoalValue(area: GoalArea, value: number): string {
  if (!ehFinanceira(area)) return String(value)
  // O separador que o pt-BR põe entre "R$" e o número é um espaço não
  // separável: dentro de uma coluna estreita ele nunca quebra a linha, e o
  // valor sai por cima do vizinho. Foi assim que "R$ 819.370" e "R$ 2.103"
  // apareceram fundidos no cartão.
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value).replace(/\u00a0/gu, ' ')
}

export const MONTH_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
