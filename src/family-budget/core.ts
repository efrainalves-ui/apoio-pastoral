import { EXPENSE_CATEGORIES, type BudgetDebtData, type BudgetEntity, type BudgetExpenseData, type BudgetGoalData, type BudgetIncomeData, type BudgetBillData, type BudgetPlanData, type ExpenseCategory } from './types'

export const monthKey = (value: Date | string) => typeof value === 'string' ? value.slice(0, 7) : `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}`
export function shiftMonth(month: string, delta: number) { const [year, number] = month.split('-').map(Number); return monthKey(new Date(year!, number! - 1 + delta, 1)) }
export function monthLabel(month: string) { const [year, number] = month.split('-').map(Number); return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date(year!, number! - 1, 1)) }
export const currency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
export const sum = (values: number[]) => values.reduce((total, value) => total + value, 0)

export function expenseAffectsBalance(expense: BudgetEntity<BudgetExpenseData>) { return !(expense.category === 'tithe' && expense.titheDeducted) }
export function debtPaymentsInMonth(debts: BudgetEntity<BudgetDebtData>[], month: string) { return sum(debts.flatMap((debt) => debt.payments.filter((payment) => monthKey(payment.date) === month).map((payment) => payment.amount))) }
export function goalDepositsInMonth(goals: BudgetEntity<BudgetGoalData>[], month: string) { return sum(goals.flatMap((goal) => goal.deposits.filter((deposit) => monthKey(deposit.date) === month).map((deposit) => deposit.amount))) }

export function monthlySummary(input: { month: string; incomes: BudgetEntity<BudgetIncomeData>[]; expenses: BudgetEntity<BudgetExpenseData>[]; bills: BudgetEntity<BudgetBillData>[]; debts: BudgetEntity<BudgetDebtData>[]; goals: BudgetEntity<BudgetGoalData>[] }) {
  const confirmedIncomes = input.incomes.filter((item) => !item.projected)
  const confirmedExpenses = input.expenses.filter((item) => !item.projected)
  const confirmedBills = input.bills.filter((item) => !item.projected)
  const income = sum(confirmedIncomes.map((item) => item.amount))
  const expense = sum(confirmedExpenses.filter(expenseAffectsBalance).map((item) => item.amount))
  const bills = sum(confirmedBills.map((item) => item.amount))
  const debtPayments = debtPaymentsInMonth(input.debts, input.month)
  const reserved = goalDepositsInMonth(input.goals, input.month)
  const titheRecorded = sum(confirmedExpenses.filter((item) => item.category === 'tithe' && item.titheDeducted).map((item) => item.amount))
  const titheToReturn = sum(confirmedExpenses.filter((item) => item.category === 'tithe' && !item.titheDeducted && item.status !== 'paid').map((item) => item.amount))
  const outflow = expense + bills + debtPayments + reserved
  return { income, outflow, available: income - outflow, reserved, debtTotal: sum(input.debts.filter((debt) => debt.status !== 'paid_off').map((debt) => debt.currentBalance)), titheRecorded, titheToReturn }
}

export function forecastSummary(input: { incomes: BudgetEntity<BudgetIncomeData>[]; expenses: BudgetEntity<BudgetExpenseData>[]; bills: BudgetEntity<BudgetBillData>[]; debts: BudgetEntity<BudgetDebtData>[]; goals: BudgetEntity<BudgetGoalData>[] }) {
  const income = sum(input.incomes.map((item) => item.amount))
  const expenses = sum(input.expenses.filter(expenseAffectsBalance).map((item) => item.amount))
  const bills = sum(input.bills.map((item) => item.amount))
  const installments = sum(input.debts.filter((item) => item.status !== 'paid_off').map((item) => item.installmentAmount))
  const goals = sum(input.goals.map((item) => item.monthlyContribution))
  return { income, expenses, bills, installments, goals, available: income - expenses - bills - installments - goals }
}

export function categorySpending(expenses: BudgetEntity<BudgetExpenseData>[], bills: BudgetEntity<BudgetBillData>[]) {
  return Object.fromEntries(EXPENSE_CATEGORIES.map((category) => [category, sum(expenses.filter((item) => !item.projected && item.category === category && expenseAffectsBalance(item)).map((item) => item.amount)) + sum(bills.filter((item) => !item.projected && item.category === category).map((item) => item.amount))])) as Record<ExpenseCategory, number>
}

export function upcomingBills(bills: BudgetEntity<BudgetBillData>[], from: Date, days = 7) {
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime()
  const end = start + days * 86_400_000
  return bills.filter((bill) => bill.status !== 'paid' && new Date(`${bill.dueDate}T12:00:00`).getTime() >= start && new Date(`${bill.dueDate}T12:00:00`).getTime() <= end)
}

export function effectivePaymentStatus(status: 'paid' | 'pending' | 'overdue', date: string, today = new Date()) {
  if (status === 'paid') return status
  return new Date(`${date}T23:59:59`).getTime() < new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() ? 'overdue' : status
}

export function debtProgress(debt: BudgetEntity<BudgetDebtData>) { return debt.initialAmount > 0 ? Math.min(100, Math.max(0, ((debt.initialAmount - debt.currentBalance) / debt.initialAmount) * 100)) : 0 }
export function debtEndEstimate(debt: BudgetEntity<BudgetDebtData>, extra = 0) {
  const monthly = debt.installmentAmount + extra
  if (debt.currentBalance <= 0) return 0
  return monthly > 0 ? Math.ceil(debt.currentBalance / monthly) : null
}

export const ESSENTIAL_CATEGORIES: ExpenseCategory[] = ['housing', 'utilities', 'food', 'transport', 'health', 'education', 'family']
export function debtPlan(input: { incomes: BudgetEntity<BudgetIncomeData>[]; expenses: BudgetEntity<BudgetExpenseData>[]; bills: BudgetEntity<BudgetBillData>[]; debts: BudgetEntity<BudgetDebtData>[]; mode: 'smallest' | 'interest' }) {
  const income = sum(input.incomes.filter((item) => !item.projected).map((item) => item.amount))
  const essential = sum(input.expenses.filter((item) => !item.projected && ESSENTIAL_CATEGORIES.includes(item.category)).map((item) => item.amount)) + sum(input.bills.filter((item) => !item.projected && ESSENTIAL_CATEGORIES.includes(item.category)).map((item) => item.amount))
  const installments = sum(input.debts.filter((item) => item.status !== 'paid_off').map((item) => item.installmentAmount))
  const available = Math.max(0, income - essential - installments)
  const ordered = input.debts.filter((item) => item.status !== 'paid_off').sort((a, b) => input.mode === 'smallest' ? a.currentBalance - b.currentBalance : (b.interestRate ?? -1) - (a.interestRate ?? -1))
  const months = available > 0 ? Math.ceil(sum(ordered.map((item) => item.currentBalance)) / Math.max(1, installments + available)) : null
  return { income, essential, installments, available, ordered, months }
}

export function planTotals(plan: BudgetEntity<BudgetPlanData> | null, expenses: BudgetEntity<BudgetExpenseData>[], bills: BudgetEntity<BudgetBillData>[]) {
  const planned = sum(Object.values(plan?.limits ?? {}))
  const spent = sum(Object.values(categorySpending(expenses, bills)))
  return { planned, spent }
}
