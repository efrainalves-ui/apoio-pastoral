import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { generateMasterKey } from '../crypto/vault'
import { ApoioDatabase } from '../db/database'
import { FamilyBudgetDatabase } from './database'
import { FamilyBudgetService } from './service'
import type { BudgetBillData, BudgetDebtData, BudgetExpenseData, BudgetGoalData, BudgetIncomeData } from './types'

const databases: FamilyBudgetDatabase[] = []
const pastoralDatabases: ApoioDatabase[] = []
afterEach(async () => { await Promise.all(databases.splice(0).map((database) => database.delete())); await Promise.all(pastoralDatabases.splice(0).map((database) => database.delete())) })
const stamps = { createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z' }
const income = (overrides: Partial<BudgetIncomeData> = {}): BudgetIncomeData => ({ category: 'salary', description: 'Salário Fictício', amount: 3000, date: '2026-08-05', responsible: 'Pessoa Fictícia', notes: '', recurring: false, ...stamps, ...overrides })
const expense = (overrides: Partial<BudgetExpenseData> = {}): BudgetExpenseData => ({ category: 'food', description: 'Compra Fictícia', amount: 300, date: '2026-08-06', status: 'paid', fixed: false, installment: false, installmentsTotal: 0, installmentNumber: 0, notes: '', titheDeducted: false, ...stamps, ...overrides })
const bill = (overrides: Partial<BudgetBillData> = {}): BudgetBillData => ({ name: 'Conta Fictícia', category: 'utilities', amount: 120, dueDate: '2026-08-10', recurring: false, status: 'pending', notes: '', ...stamps, ...overrides })
const debt = (): BudgetDebtData => ({ name: 'Dívida Fictícia', type: 'loan', initialAmount: 1200, currentBalance: 1200, installmentAmount: 100, totalInstallments: 12, paidInstallments: 0, dueDay: 10, interestRate: 2, status: 'current', notes: '', payments: [], ...stamps })
const goal = (): BudgetGoalData => ({ name: 'Meta Fictícia', targetAmount: 1000, reservedAmount: 0, targetDate: '2027-01-01', category: 'emergency', monthlyContribution: 100, notes: '', deposits: [], ...stamps })

describe('persistência isolada do Orçamento Familiar', () => {
  it('cadastra, edita e exclui entradas e despesas sem gravar no banco ministerial', async () => {
    const database = new FamilyBudgetDatabase(`budget-${crypto.randomUUID()}`); databases.push(database)
    const pastoral = new ApoioDatabase(`pastoral-${crypto.randomUUID()}`); pastoralDatabases.push(pastoral)
    const service = new FamilyBudgetService(database); const key = await generateMasterKey(); const accountId = 'conta-ficticia'
    const createdIncome = await service.saveIncome(accountId, key, income())
    await service.saveIncome(accountId, key, income({ description: 'Entrada Fictícia Editada', amount: 3200 }), createdIncome.id)
    expect((await service.incomes(accountId, key))[0]).toMatchObject({ id: createdIncome.id, amount: 3200 })
    const createdExpense = await service.saveExpense(accountId, key, expense())
    await service.saveExpense(accountId, key, expense({ description: 'Despesa Fictícia Editada', amount: 250 }), createdExpense.id)
    expect((await service.expenses(accountId, key))[0]).toMatchObject({ id: createdExpense.id, amount: 250 })
    expect(JSON.stringify(await database.records.toArray())).not.toContain('Fictícia Editada')
    expect(await pastoral.vaultRecords.count()).toBe(0)
    await service.remove(accountId, createdIncome.id); await service.remove(accountId, createdExpense.id)
    expect(await service.incomes(accountId, key)).toHaveLength(0); expect(await service.expenses(accountId, key)).toHaveLength(0)
  })

  it('cria previsões mensais para entradas recorrentes, contas fixas e parcelas', async () => {
    const database = new FamilyBudgetDatabase(`budget-recurring-${crypto.randomUUID()}`); databases.push(database)
    const service = new FamilyBudgetService(database); const key = await generateMasterKey(); const accountId = 'conta-ficticia'
    await service.saveIncome(accountId, key, income({ recurring: true }))
    await service.saveExpense(accountId, key, expense({ fixed: true }))
    await service.saveExpense(accountId, key, expense({ description: 'Parcela Fictícia', installment: true, installmentsTotal: 3, installmentNumber: 1 }))
    await service.saveBill(accountId, key, bill({ recurring: true }))
    const september = await service.snapshot(accountId, key, '2026-09')
    expect(september.incomes[0]).toMatchObject({ projected: true })
    expect(september.expenses).toEqual(expect.arrayContaining([expect.objectContaining({ projected: true, description: 'Compra Fictícia' }), expect.objectContaining({ projected: true, description: 'Parcela Fictícia', installmentNumber: 2 })]))
    expect(september.bills[0]).toMatchObject({ projected: true })
    await service.confirmIncome(accountId, key, september.incomes[0]!)
    expect((await service.snapshot(accountId, key, '2026-09')).incomes).toHaveLength(1)
  })

  it('salva planejamento, paga parcela de dívida e deposita em meta', async () => {
    const database = new FamilyBudgetDatabase(`budget-progress-${crypto.randomUUID()}`); databases.push(database)
    const service = new FamilyBudgetService(database); const key = await generateMasterKey(); const accountId = 'conta-ficticia'
    await service.savePlan(accountId, key, { month: '2026-08', limits: { food: 500 }, ...stamps })
    const createdDebt = await service.saveDebt(accountId, key, debt())
    const paid = await service.payDebt(accountId, key, createdDebt, 100, '2026-08-10')
    expect(paid).toMatchObject({ currentBalance: 1100, paidInstallments: 1 })
    const createdGoal = await service.saveGoal(accountId, key, goal())
    const deposited = await service.depositGoal(accountId, key, createdGoal, 150, '2026-08-12')
    expect(deposited).toMatchObject({ reservedAmount: 150 })
    const snapshot = await service.snapshot(accountId, key, '2026-08')
    expect(snapshot.plan?.limits.food).toBe(500)
    expect(snapshot.debts[0]?.payments).toHaveLength(1)
    expect(snapshot.goals[0]?.deposits).toHaveLength(1)
  })
})
