import { describe, expect, it } from 'vitest'
import { budgetTips, categoryShares, flowBars, monthOutlook } from './monthInsight'
import type { BudgetBillData, BudgetEntity, BudgetExpenseData, BudgetIncomeData, BudgetPlanData, BudgetSnapshot } from './types'

const stamps = { createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z' }
const income = (id: string, amount: number, projected = false): BudgetEntity<BudgetIncomeData> => ({ id, category: 'salary', description: 'Entrada fictícia', amount, date: '2026-08-05', responsible: '', notes: '', recurring: false, projected, ...stamps })
const expense = (id: string, category: BudgetExpenseData['category'], amount: number, projected = false): BudgetEntity<BudgetExpenseData> => ({ id, category, description: 'Despesa fictícia', amount, date: '2026-08-06', status: 'paid', fixed: false, installment: false, installmentsTotal: 0, installmentNumber: 0, notes: '', titheDeducted: false, projected, ...stamps })
const bill = (id: string, amount: number, status: BudgetBillData['status'] = 'pending'): BudgetEntity<BudgetBillData> => ({ id, name: 'Conta Fictícia', category: 'utilities', amount, dueDate: '2026-08-20', recurring: false, status, notes: '', ...stamps })
const plan = (limits: BudgetPlanData['limits']): BudgetEntity<BudgetPlanData> => ({ id: 'plano-ficticio', month: '2026-08', limits, ...stamps })

function snapshot(partes: Partial<BudgetSnapshot> = {}): BudgetSnapshot {
  return { month: '2026-08', incomes: [], expenses: [], bills: [], debts: [], goals: [], plan: null, ...partes }
}

describe('projeção do mês', () => {
  it('soma o que ainda está previsto ao saldo do mês', () => {
    const atual = snapshot({ incomes: [income('a', 3000), income('b', 500, true)], expenses: [expense('c', 'food', 400)], bills: [bill('d', 200)] })
    const resultado = monthOutlook(2600, atual)

    expect(resultado.expectedIncome).toBe(500)
    expect(resultado.planned).toBe(200)
    expect(resultado.projected).toBe(2900)
    expect(resultado.tone).toBe('ok')
    expect(resultado.message).toBe('Suas despesas estão dentro do planejado.')
  })

  it('avisa quando os compromissos previstos passam do saldo disponível', () => {
    const atual = snapshot({ bills: [bill('a', 900)] })
    const resultado = monthOutlook(300, atual)

    expect(resultado.tone).toBe('risco')
    expect(resultado.message).toBe('Atenção: os compromissos previstos ultrapassam o saldo disponível.')
    expect(resultado.projected).toBe(-600)
  })

  // Amarelo quando as entradas previstas ainda cobrem os compromissos.
  it('marca atenção quando o mês só fecha com as entradas previstas', () => {
    const atual = snapshot({ incomes: [income('a', 900, true)], bills: [bill('b', 900)] })
    const resultado = monthOutlook(300, atual)

    expect(resultado.tone).toBe('atencao')
    expect(resultado.projected).toBe(300)
  })

  it('não conta conta já paga como compromisso em aberto', () => {
    expect(monthOutlook(500, snapshot({ bills: [bill('a', 200, 'paid')] })).planned).toBe(0)
  })
})

describe('distribuição e dicas', () => {
  it('mostra as categorias com gasto, da maior para a menor', () => {
    const fatias = categoryShares(snapshot({ expenses: [expense('a', 'food', 300), expense('b', 'transport', 100)] }))

    expect(fatias.map(({ category }) => category)).toEqual(['food', 'transport'])
    expect(fatias[0]).toMatchObject({ amount: 300, percent: 75 })
    expect(categoryShares(snapshot())).toEqual([])
  })

  it('avisa 80% e passagem do limite planejado de cada categoria', () => {
    const atual = snapshot({ expenses: [expense('a', 'food', 400), expense('b', 'transport', 300)], plan: plan({ food: 500, transport: 200 }) })
    const dicas = budgetTips(atual, monthOutlook(1000, atual))

    expect(dicas.find(({ id }) => id === 'limite-food')).toMatchObject({ tone: 'atencao', text: 'Você já utilizou 80% do orçamento de Alimentação.' })
    expect(dicas.find(({ id }) => id === 'limite-transport')).toMatchObject({ tone: 'risco' })
  })

  it('sempre começa pela situação do mês', () => {
    const atual = snapshot()
    expect(budgetTips(atual, monthOutlook(100, atual))[0]).toMatchObject({ id: 'situacao', tone: 'ok' })
  })

  it('põe entradas e saídas na mesma escala', () => {
    expect(flowBars(2000, 500)).toEqual([
      { label: 'Entradas', amount: 2000, percent: 100, tone: 'entrada' },
      { label: 'Saídas', amount: 500, percent: 25, tone: 'saida' },
    ])
  })
})
