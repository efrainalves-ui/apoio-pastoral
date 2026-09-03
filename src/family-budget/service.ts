import { decryptRecord, encryptPayload } from '../crypto/vault'
import { familyBudgetDb, type FamilyBudgetDatabase } from './database'
import { monthKey } from './core'
import type { BudgetBillData, BudgetDataByType, BudgetEntity, BudgetExpenseData, BudgetGoalData, BudgetIncomeData, BudgetPayloadType, BudgetPlanData, BudgetSkipData, BudgetSnapshot, FamilyBudgetStoredRecord } from './types'

const now = () => new Date().toISOString()
const dayInMonth = (date: string, month: string) => `${month}-${String(Math.min(Number(date.slice(8, 10)) || 1, new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate())).padStart(2, '0')}`

export class FamilyBudgetService {
  constructor(private readonly database: FamilyBudgetDatabase = familyBudgetDb) {}

  private async decode<T extends BudgetPayloadType>(record: FamilyBudgetStoredRecord, masterKey: CryptoKey, type: T): Promise<BudgetEntity<BudgetDataByType[T]> | null> {
    const payload = await decryptRecord(masterKey, record)
    return payload?.type === `family_budget_${type}` ? { id: record.id, ...(payload.data as BudgetDataByType[T]) } : null
  }

  private async list<T extends BudgetPayloadType>(accountId: string, masterKey: CryptoKey, type: T): Promise<BudgetEntity<BudgetDataByType[T]>[]> {
    const records = await this.database.records.where('accountId').equals(accountId).filter((record) => record.recordType === type).toArray()
    return (await Promise.all(records.map((record) => this.decode(record, masterKey, type)))).flatMap((item) => item ? [item] : [])
  }

  private async save<T extends BudgetPayloadType>(accountId: string, masterKey: CryptoKey, type: T, input: BudgetDataByType[T], id: string = crypto.randomUUID()): Promise<BudgetEntity<BudgetDataByType[T]>> {
    const existing = await this.database.records.get(id)
    if (existing && existing.accountId !== accountId) throw new Error('Este registro pertence a outra conta.')
    const timestamp = now()
    const data = { ...input, createdAt: input.createdAt || timestamp, updatedAt: timestamp }
    const envelope = await encryptPayload(masterKey, { schemaVersion: 1, type: `family_budget_${type}`, data }, id)
    await this.database.records.put({ id, accountId, recordType: type, createdAt: existing?.createdAt ?? timestamp, updatedAt: timestamp, ...envelope })
    return { id, ...data }
  }

  async remove(accountId: string, id: string) { const record = await this.database.records.get(id); if (!record || record.accountId !== accountId) throw new Error('Registro não encontrado.'); await this.database.records.delete(id) }
  async incomes(accountId: string, masterKey: CryptoKey) { return this.list(accountId, masterKey, 'income') }
  async expenses(accountId: string, masterKey: CryptoKey) { return this.list(accountId, masterKey, 'expense') }
  async bills(accountId: string, masterKey: CryptoKey) { return this.list(accountId, masterKey, 'bill') }
  async debts(accountId: string, masterKey: CryptoKey) { return this.list(accountId, masterKey, 'debt') }
  async goals(accountId: string, masterKey: CryptoKey) { return this.list(accountId, masterKey, 'goal') }
  async plans(accountId: string, masterKey: CryptoKey) { return this.list(accountId, masterKey, 'plan') }
  async saveIncome(accountId: string, masterKey: CryptoKey, input: BudgetIncomeData, id?: string) { const nextId: string = id ?? crypto.randomUUID(); return this.save(accountId, masterKey, 'income', { ...input, ...(input.recurring ? { recurrenceId: input.recurrenceId ?? nextId } : {}) }, nextId) }
  async saveExpense(accountId: string, masterKey: CryptoKey, input: BudgetExpenseData, id?: string) { const nextId: string = id ?? crypto.randomUUID(); return this.save(accountId, masterKey, 'expense', { ...input, ...(input.fixed || input.installment ? { recurrenceId: input.recurrenceId ?? nextId } : {}) }, nextId) }
  async saveBill(accountId: string, masterKey: CryptoKey, input: BudgetBillData, id?: string) { const nextId: string = id ?? crypto.randomUUID(); return this.save(accountId, masterKey, 'bill', { ...input, ...(input.recurring ? { recurrenceId: input.recurrenceId ?? nextId } : {}) }, nextId) }
  async saveDebt(accountId: string, masterKey: CryptoKey, input: BudgetDataByType['debt'], id?: string) { return this.save(accountId, masterKey, 'debt', input, id) }
  async saveGoal(accountId: string, masterKey: CryptoKey, input: BudgetGoalData, id?: string) { return this.save(accountId, masterKey, 'goal', input, id) }
  async savePlan(accountId: string, masterKey: CryptoKey, input: BudgetPlanData, id?: string) { return this.save(accountId, masterKey, 'plan', input, id) }

  private async projected<T extends 'income' | 'expense' | 'bill'>(accountId: string, masterKey: CryptoKey, type: T, month: string, all: BudgetEntity<BudgetDataByType[T]>[]) {
    const skips = await this.list(accountId, masterKey, 'skip')
    const recurring = all.filter((item) => type === 'income' ? (item as BudgetIncomeData).recurring : type === 'expense' ? (item as BudgetExpenseData).fixed || ((item as BudgetExpenseData).installment && (item as BudgetExpenseData).installmentNumber < (item as BudgetExpenseData).installmentsTotal) : (item as BudgetBillData).recurring)
    const groups = new Map<string, BudgetEntity<BudgetDataByType[T]>>()
    for (const item of recurring) {
      const recurrenceId = item.recurrenceId ?? item.id
      const date = type === 'bill' ? (item as BudgetBillData).dueDate : (item as BudgetIncomeData | BudgetExpenseData).date
      if (monthKey(date) < month && (!groups.get(recurrenceId) || groups.get(recurrenceId)!.updatedAt < item.updatedAt)) groups.set(recurrenceId, item)
    }
    return [...groups.entries()].flatMap(([recurrenceId, item]) => {
      const already = all.some((candidate) => candidate.recurrenceId === recurrenceId && monthKey(type === 'bill' ? (candidate as BudgetBillData).dueDate : (candidate as BudgetIncomeData | BudgetExpenseData).date) === month)
      const skipped = skips.some((skip) => skip.recordType === type && skip.recurrenceId === recurrenceId && skip.month === month)
      if (already || skipped) return []
      const dateKey = type === 'bill' ? 'dueDate' : 'date'
      const sourceDate = type === 'bill' ? (item as BudgetBillData).dueDate : (item as BudgetIncomeData | BudgetExpenseData).date
      const installmentPatch = type === 'expense' && (item as BudgetExpenseData).installment ? { installmentNumber: (item as BudgetExpenseData).installmentNumber + 1 } : {}
      return [{ ...item, ...installmentPatch, id: `projected:${type}:${recurrenceId}:${month}`, [dateKey]: dayInMonth(sourceDate, month), projected: true, sourceId: item.id }]
    })
  }

  async snapshot(accountId: string, masterKey: CryptoKey, month: string): Promise<BudgetSnapshot> {
    const [allIncomes, allExpenses, allBills, debts, goals, plans] = await Promise.all([this.incomes(accountId, masterKey), this.expenses(accountId, masterKey), this.bills(accountId, masterKey), this.debts(accountId, masterKey), this.goals(accountId, masterKey), this.plans(accountId, masterKey)])
    const incomes = allIncomes.filter((item) => monthKey(item.date) === month)
    const expenses = allExpenses.filter((item) => monthKey(item.date) === month)
    const bills = allBills.filter((item) => monthKey(item.dueDate) === month)
    return {
      month,
      incomes: [...incomes, ...await this.projected(accountId, masterKey, 'income', month, allIncomes)],
      expenses: [...expenses, ...await this.projected(accountId, masterKey, 'expense', month, allExpenses)],
      bills: [...bills, ...await this.projected(accountId, masterKey, 'bill', month, allBills)], debts, goals,
      plan: plans.find((plan) => plan.month === month) ?? null,
    }
  }

  async skipProjection(accountId: string, masterKey: CryptoKey, type: BudgetSkipData['recordType'], recurrenceId: string, month: string) {
    const timestamp = now(); return this.save(accountId, masterKey, 'skip', { recordType: type, recurrenceId, month, createdAt: timestamp, updatedAt: timestamp })
  }
  async confirmIncome(accountId: string, masterKey: CryptoKey, item: BudgetEntity<BudgetIncomeData>) { const timestamp = now(); return this.saveIncome(accountId, masterKey, { ...item, ...(item.recurrenceId ? { recurrenceId: item.recurrenceId } : {}), createdAt: timestamp, updatedAt: timestamp }) }
  async confirmExpense(accountId: string, masterKey: CryptoKey, item: BudgetEntity<BudgetExpenseData>) { const timestamp = now(); return this.saveExpense(accountId, masterKey, { ...item, ...(item.recurrenceId ? { recurrenceId: item.recurrenceId } : {}), createdAt: timestamp, updatedAt: timestamp }) }
  async confirmBill(accountId: string, masterKey: CryptoKey, item: BudgetEntity<BudgetBillData>) { const timestamp = now(); return this.saveBill(accountId, masterKey, { ...item, ...(item.recurrenceId ? { recurrenceId: item.recurrenceId } : {}), createdAt: timestamp, updatedAt: timestamp }) }
  async payDebt(accountId: string, masterKey: CryptoKey, debt: BudgetEntity<BudgetDataByType['debt']>, amount: number, date: string) {
    if (!(amount > 0)) throw new Error('Informe um valor de pagamento válido.')
    const balance = Math.max(0, debt.currentBalance - amount)
    return this.saveDebt(accountId, masterKey, { ...debt, currentBalance: balance, paidInstallments: Math.min(debt.totalInstallments || debt.paidInstallments + 1, debt.paidInstallments + 1), status: balance === 0 ? 'paid_off' : debt.status === 'paid_off' ? 'current' : debt.status, payments: [...debt.payments, { id: crypto.randomUUID(), amount, date }] }, debt.id)
  }
  async depositGoal(accountId: string, masterKey: CryptoKey, goal: BudgetEntity<BudgetGoalData>, amount: number, date: string) {
    if (!(amount > 0)) throw new Error('Informe um valor de depósito válido.')
    return this.saveGoal(accountId, masterKey, { ...goal, reservedAmount: goal.reservedAmount + amount, deposits: [...goal.deposits, { id: crypto.randomUUID(), amount, date }] }, goal.id)
  }
}
