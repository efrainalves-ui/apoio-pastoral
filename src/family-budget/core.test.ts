import { describe, expect, it } from 'vitest'
import { categorySpending, debtEndEstimate, debtPlan, debtProgress, effectivePaymentStatus, forecastSummary, monthlySummary, upcomingBills } from './core'
import type { BudgetBillData, BudgetDebtData, BudgetEntity, BudgetExpenseData, BudgetGoalData, BudgetIncomeData } from './types'

const stamps = { createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z' }
const income = (id: string, amount: number): BudgetEntity<BudgetIncomeData> => ({ id, category: 'salary', description: 'Entrada fictícia', amount, date: '2026-08-05', responsible: 'Pessoa Fictícia', notes: '', recurring: false, ...stamps })
const expense = (id: string, category: BudgetExpenseData['category'], amount: number, titheDeducted = false): BudgetEntity<BudgetExpenseData> => ({ id, category, description: 'Despesa fictícia', amount, date: '2026-08-06', status: 'paid', fixed: false, installment: false, installmentsTotal: 0, installmentNumber: 0, notes: '', titheDeducted, ...stamps })
const bill = (id: string, amount: number, dueDate = '2026-08-10'): BudgetEntity<BudgetBillData> => ({ id, name: 'Conta Fictícia', category: 'utilities', amount, dueDate, recurring: false, status: 'pending', notes: '', ...stamps })
const debt = (id: string, balance: number, interestRate: number): BudgetEntity<BudgetDebtData> => ({ id, name: `Dívida Fictícia ${id}`, type: 'loan', initialAmount: 1000, currentBalance: balance, installmentAmount: 100, totalInstallments: 10, paidInstallments: 2, dueDay: 10, interestRate, status: 'current', notes: '', payments: [], ...stamps })
const goal = (id: string): BudgetEntity<BudgetGoalData> => ({ id, name: 'Meta Fictícia', targetAmount: 1000, reservedAmount: 100, targetDate: '2027-01-01', category: 'emergency', monthlyContribution: 100, notes: '', deposits: [{ id: 'deposito-ficticio', amount: 100, date: '2026-08-08' }], ...stamps })

describe('cálculos do Orçamento Familiar', () => {
  it('não desconta novamente o dízimo somente registrado e desconta o que precisa ser devolvido', () => {
    const registered = monthlySummary({ month: '2026-08', incomes: [income('entrada', 3000)], expenses: [expense('dizimo-registrado', 'tithe', 300, true)], bills: [], debts: [], goals: [] })
    expect(registered.available).toBe(3000)
    expect(registered.titheRecorded).toBe(300)
    const toReturn = monthlySummary({ month: '2026-08', incomes: [income('entrada', 3000)], expenses: [expense('dizimo-devolver', 'tithe', 300, false)], bills: [], debts: [], goals: [] })
    expect(toReturn.available).toBe(2700)
  })

  it('calcula planejamento, contas próximas e atrasadas', () => {
    expect(categorySpending([expense('moradia', 'housing', 800)], [bill('energia', 150)]).housing).toBe(800)
    expect(categorySpending([expense('moradia', 'housing', 800)], [bill('energia', 150)]).utilities).toBe(150)
    expect(upcomingBills([bill('proxima', 100, '2026-08-05'), bill('distante', 100, '2026-08-20')], new Date('2026-08-01T12:00:00'), 7).map(({ id }) => id)).toEqual(['proxima'])
    expect(effectivePaymentStatus('pending', '2026-07-31', new Date('2026-08-01T12:00:00'))).toBe('overdue')
  })

  it('calcula progresso, previsão e os dois modos do plano de dívidas', () => {
    expect(debtProgress(debt('a', 600, 2))).toBe(40)
    expect(debtEndEstimate(debt('a', 600, 2))).toBe(6)
    const input = { incomes: [income('entrada', 3000)], expenses: [expense('essencial', 'food', 1000)], bills: [], debts: [debt('maior', 900, 2), debt('menor', 300, 8)] }
    const smallest = debtPlan({ ...input, mode: 'smallest' })
    expect(smallest.available).toBe(1800)
    expect(smallest.ordered[0]?.id).toBe('menor')
    expect(debtPlan({ ...input, mode: 'interest' }).ordered[0]?.id).toBe('menor')
  })

  it('inclui depósitos de metas na reserva mensal', () => {
    const summary = monthlySummary({ month: '2026-08', incomes: [income('entrada', 1000)], expenses: [], bills: [], debts: [], goals: [goal('meta')] })
    expect(summary.reserved).toBe(100)
    expect(summary.available).toBe(900)
  })

  it('inclui previsões no cálculo simples do próximo mês', () => {
    const forecast = forecastSummary({
      incomes: [{ ...income('prevista', 3000), projected: true }],
      expenses: [{ ...expense('fixa', 'housing', 900), projected: true }],
      bills: [{ ...bill('conta', 100), projected: true }],
      debts: [debt('divida', 600, 2)],
      goals: [goal('meta')],
    })
    expect(forecast).toMatchObject({ income: 3000, expenses: 900, bills: 100, installments: 100, goals: 100, available: 1800 })
  })
})
