import { ALLOWANCE_CATEGORIES, type AllowanceCategory, type MileageEntity, type WorkAllowanceEntity, type WorkExpenseEntity } from './types'

/** Mês de uma data ISO, no formato `AAAA-MM`. */
export function monthOf(date: string): string { return date.slice(0, 7) }

export function inMonth<T extends { date: string }>(itens: T[], month: string): T[] {
  return itens.filter((item) => monthOf(item.date) === month)
}

export function currency(valor: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor)
}

/**
 * Saldo de um auxílio: o que entrou, o que saiu por ele e o que sobrou.
 *
 * `fromPocket` é a pergunta que dá nome a este módulo. Quando a despesa passa
 * do auxílio, a diferença saiu do bolso do pastor — e ele precisa ver esse
 * número, não descobri-lo fazendo conta de cabeça no fim do mês.
 */
export interface AllowanceBalance {
  category: AllowanceCategory
  received: number
  spent: number
  /** Sobra do auxílio. Zero quando a despesa passou dele. */
  balance: number
  /** Quanto da despesa passou do auxílio e saiu do bolso. */
  fromPocket: boolean
  overspent: number
}

export function allowanceBalance(
  category: AllowanceCategory,
  allowances: WorkAllowanceEntity[],
  expenses: WorkExpenseEntity[],
): AllowanceBalance {
  const received = allowances.filter((item) => item.category === category).reduce((total, item) => total + item.amount, 0)
  const spent = expenses.filter((item) => item.allowanceCategory === category).reduce((total, item) => total + item.amount, 0)
  const overspent = Math.max(0, spent - received)
  return { category, received, spent, balance: Math.max(0, received - spent), fromPocket: overspent > 0, overspent }
}

export function allowanceBalances(
  allowances: WorkAllowanceEntity[],
  expenses: WorkExpenseEntity[],
): AllowanceBalance[] {
  return ALLOWANCE_CATEGORIES
    .map((category) => allowanceBalance(category, allowances, expenses))
    .filter((linha) => linha.received > 0 || linha.spent > 0)
}

export interface WorkMonthSummary {
  received: number
  spent: number
  /** Sobra somada dos auxílios que não foram gastos por inteiro. */
  balance: number
  /**
   * Tudo que o pastor pagou do próprio bolso: o que passou de cada auxílio,
   * mais as despesas que não têm auxílio nenhum apontado.
   */
  fromPocket: number
  kilometers: number
  mileageAmount: number
}

export function workMonthSummary(
  allowances: WorkAllowanceEntity[],
  expenses: WorkExpenseEntity[],
  mileage: MileageEntity[],
): WorkMonthSummary {
  const balances = ALLOWANCE_CATEGORIES.map((category) => allowanceBalance(category, allowances, expenses))
  const semAuxilio = expenses
    .filter((item) => item.allowanceCategory === null)
    .reduce((total, item) => total + item.amount, 0)
  return {
    received: allowances.reduce((total, item) => total + item.amount, 0),
    spent: expenses.reduce((total, item) => total + item.amount, 0),
    balance: balances.reduce((total, linha) => total + linha.balance, 0),
    fromPocket: semAuxilio + balances.reduce((total, linha) => total + linha.overspent, 0),
    kilometers: mileage.reduce((total, item) => total + item.kilometers, 0),
    mileageAmount: mileage.reduce((total, item) => total + (item.amount ?? 0), 0),
  }
}

export interface MileageByChurch { churchId: string | null; kilometers: number; amount: number; trips: number }

/** Quilometragem somada por igreja, da maior para a menor. */
export function mileageByChurch(mileage: MileageEntity[]): MileageByChurch[] {
  const porIgreja = new Map<string, MileageByChurch>()
  for (const item of mileage) {
    const chave = item.churchId ?? ''
    const atual = porIgreja.get(chave) ?? { churchId: item.churchId, kilometers: 0, amount: 0, trips: 0 }
    atual.kilometers += item.kilometers
    atual.amount += item.amount ?? 0
    atual.trips += 1
    porIgreja.set(chave, atual)
  }
  return [...porIgreja.values()].sort((esquerda, direita) => direita.kilometers - esquerda.kilometers)
}

/** Meses com algum registro, do mais recente para o mais antigo. */
export function monthsWithRecords(
  allowances: WorkAllowanceEntity[],
  expenses: WorkExpenseEntity[],
  mileage: MileageEntity[],
): string[] {
  const meses = new Set([...allowances, ...expenses, ...mileage].map(({ date }) => monthOf(date)))
  return [...meses].filter(Boolean).sort((esquerda, direita) => direita.localeCompare(esquerda))
}
