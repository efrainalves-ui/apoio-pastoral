import { categorySpending, expenseAffectsBalance, sum } from './core'
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABELS, type BudgetSnapshot, type ExpenseCategory } from './types'

/** Verde para tudo em ordem, amarelo para atenção, vermelho para risco. */
export type BudgetTone = 'ok' | 'atencao' | 'risco'

export interface MonthOutlook {
  available: number
  /** Compromissos que ainda vão pesar no mês: contas em aberto e lançamentos previstos. */
  planned: number
  /** Entradas ainda previstas para o mês. */
  expectedIncome: number
  /** Saldo estimado no fim do mês. */
  projected: number
  tone: BudgetTone
  message: string
}

/**
 * Projeção do fim do mês a partir do que já está cadastrado. Não altera nenhum
 * cálculo existente: apenas soma o que ainda está previsto ao saldo do mês.
 */
export function monthOutlook(available: number, snapshot: BudgetSnapshot): MonthOutlook {
  const expectedIncome = sum(snapshot.incomes.filter((item) => item.projected).map((item) => item.amount))
  const expectedExpenses = sum(snapshot.expenses.filter((item) => item.projected && expenseAffectsBalance(item)).map((item) => item.amount))
  const openBills = sum(snapshot.bills.filter((item) => item.status !== 'paid' || item.projected).map((item) => item.amount))
  const planned = expectedExpenses + openBills
  const projected = available + expectedIncome - planned

  if (projected < 0) return { available, planned, expectedIncome, projected, tone: 'risco', message: 'Atenção: os compromissos previstos ultrapassam o saldo disponível.' }
  if (planned > 0 && planned > available) return { available, planned, expectedIncome, projected, tone: 'atencao', message: 'Os compromissos previstos dependem das entradas que ainda vão entrar.' }
  return { available, planned, expectedIncome, projected, tone: 'ok', message: 'Suas despesas estão dentro do planejado.' }
}

export interface CategoryShare { category: ExpenseCategory; label: string; amount: number; percent: number }

/** Distribuição das despesas do mês por categoria, da maior para a menor. */
export function categoryShares(snapshot: BudgetSnapshot): CategoryShare[] {
  const spending = categorySpending(snapshot.expenses, snapshot.bills)
  const total = sum(Object.values(spending))
  return EXPENSE_CATEGORIES
    .map((category) => ({ category, label: EXPENSE_CATEGORY_LABELS[category], amount: spending[category], percent: total > 0 ? Math.round((spending[category] / total) * 100) : 0 }))
    .filter(({ amount }) => amount > 0)
    .sort((a, b) => b.amount - a.amount)
}

export interface BudgetTip { id: string; tone: BudgetTone; text: string }

/** Dicas curtas, sempre a partir do que o próprio pastor cadastrou. */
export function budgetTips(snapshot: BudgetSnapshot, outlook: MonthOutlook): BudgetTip[] {
  const tips: BudgetTip[] = [{ id: 'situacao', tone: outlook.tone, text: outlook.message }]
  const spending = categorySpending(snapshot.expenses, snapshot.bills)

  for (const [category, limit] of Object.entries(snapshot.plan?.limits ?? {}) as Array<[ExpenseCategory, number]>) {
    if (!limit || limit <= 0) continue
    const usado = Math.round((spending[category] / limit) * 100)
    if (usado >= 100) tips.push({ id: `limite-${category}`, tone: 'risco', text: `Você passou do planejado em ${EXPENSE_CATEGORY_LABELS[category]}.` })
    else if (usado >= 80) tips.push({ id: `limite-${category}`, tone: 'atencao', text: `Você já utilizou ${usado}% do orçamento de ${EXPENSE_CATEGORY_LABELS[category]}.` })
  }

  return tips
}

export interface FlowBar { label: string; amount: number; percent: number; tone: 'entrada' | 'saida' }

/** Barras de entradas e saídas na mesma escala, para comparar de olhada. */
export function flowBars(income: number, outflow: number): FlowBar[] {
  const maior = Math.max(income, outflow, 1)
  return [
    { label: 'Entradas', amount: income, percent: Math.round((income / maior) * 100), tone: 'entrada' },
    { label: 'Saídas', amount: outflow, percent: Math.round((outflow / maior) * 100), tone: 'saida' },
  ]
}

