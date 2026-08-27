import type { CipherEnvelope } from '../crypto/types'

export const INCOME_CATEGORIES = ['salary', 'fixed_report', 'travel_report', 'thirteenth_salary', 'vacation', 'spouse_income', 'other'] as const
export type IncomeCategory = (typeof INCOME_CATEGORIES)[number]
export const INCOME_CATEGORY_LABELS: Record<IncomeCategory, string> = {
  salary: 'Salário', fixed_report: 'Relatório fixo', travel_report: 'Relatório de viagem', thirteenth_salary: 'Décimo terceiro',
  vacation: 'Férias', spouse_income: 'Renda do cônjuge', other: 'Outra entrada',
}

export const EXPENSE_CATEGORIES = ['housing', 'utilities', 'food', 'transport', 'health', 'education', 'family', 'leisure', 'offerings', 'tithe', 'reserve', 'debts', 'other'] as const
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]
export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  housing: 'Moradia', utilities: 'Água, luz e internet', food: 'Alimentação', transport: 'Transporte', health: 'Saúde',
  education: 'Educação', family: 'Família', leisure: 'Lazer', offerings: 'Ofertas e doações', tithe: 'Dízimo', reserve: 'Reserva', debts: 'Dívidas', other: 'Outras despesas',
}

export type PaymentStatus = 'paid' | 'pending' | 'overdue'
export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = { paid: 'Paga', pending: 'Pendente', overdue: 'Atrasada' }
export type DebtStatus = 'current' | 'overdue' | 'paid_off'
export const DEBT_STATUS_LABELS: Record<DebtStatus, string> = { current: 'Em dia', overdue: 'Atrasada', paid_off: 'Quitada' }
export type DebtType = 'card' | 'loan' | 'financing' | 'person' | 'store' | 'other'
export const DEBT_TYPE_LABELS: Record<DebtType, string> = { card: 'Cartão', loan: 'Empréstimo', financing: 'Financiamento', person: 'Pessoa', store: 'Loja', other: 'Outro' }
export type GoalCategory = 'emergency' | 'study' | 'travel' | 'home' | 'vehicle' | 'purchase' | 'other'
export const GOAL_CATEGORY_LABELS: Record<GoalCategory, string> = { emergency: 'Reserva de emergência', study: 'Estudo', travel: 'Viagem', home: 'Casa', vehicle: 'Veículo', purchase: 'Compra', other: 'Outra' }

export interface BudgetTimestamps { createdAt: string; updatedAt: string }
export interface BudgetIncomeData extends BudgetTimestamps {
  category: IncomeCategory; description: string; amount: number; date: string; responsible: string; notes: string; recurring: boolean; recurrenceId?: string
}
export interface BudgetExpenseData extends BudgetTimestamps {
  category: ExpenseCategory; description: string; amount: number; date: string; status: PaymentStatus; fixed: boolean; recurrenceId?: string;
  installment: boolean; installmentsTotal: number; installmentNumber: number; notes: string; titheDeducted: boolean
}
export interface BudgetBillData extends BudgetTimestamps {
  name: string; category: ExpenseCategory; amount: number; dueDate: string; recurring: boolean; recurrenceId?: string; status: PaymentStatus; notes: string
}
export interface DebtPayment { id: string; amount: number; date: string }
export interface BudgetDebtData extends BudgetTimestamps {
  name: string; type: DebtType; initialAmount: number; currentBalance: number; installmentAmount: number; totalInstallments: number;
  paidInstallments: number; dueDay: number; interestRate: number | null; status: DebtStatus; notes: string; payments: DebtPayment[]
}
export interface GoalDeposit { id: string; amount: number; date: string }
export interface BudgetGoalData extends BudgetTimestamps {
  name: string; targetAmount: number; reservedAmount: number; targetDate: string; category: GoalCategory; monthlyContribution: number; notes: string; deposits: GoalDeposit[]
}
export interface BudgetPlanData extends BudgetTimestamps { month: string; limits: Partial<Record<ExpenseCategory, number>> }
export interface BudgetSkipData extends BudgetTimestamps { recordType: 'income' | 'expense' | 'bill'; recurrenceId: string; month: string }

export type FamilyBudgetRecordType = 'income' | 'expense' | 'bill' | 'debt' | 'goal' | 'plan' | 'skip'
export type BudgetDataByType = {
  income: BudgetIncomeData; expense: BudgetExpenseData; bill: BudgetBillData; debt: BudgetDebtData; goal: BudgetGoalData; plan: BudgetPlanData; skip: BudgetSkipData
}
export type BudgetEntity<T extends object> = T & { id: string; projected?: boolean; sourceId?: string }

export interface FamilyBudgetStoredRecord extends CipherEnvelope {
  id: string; accountId: string; recordType: FamilyBudgetRecordType; createdAt: string; updatedAt: string
}

export interface BudgetSnapshot {
  month: string
  incomes: BudgetEntity<BudgetIncomeData>[]
  expenses: BudgetEntity<BudgetExpenseData>[]
  bills: BudgetEntity<BudgetBillData>[]
  debts: BudgetEntity<BudgetDebtData>[]
  goals: BudgetEntity<BudgetGoalData>[]
  plan: BudgetEntity<BudgetPlanData> | null
}
