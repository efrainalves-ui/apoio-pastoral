import { describe, expect, it } from 'vitest'
import { contaAntiga, eLegado, entradaAntiga, lerOAntigo, saidaAntiga } from './adaptador'
import { resumoDoMes } from './calculos'
import { acharSubcategoria } from './catalogo'
import { emCentavos } from './dinheiro'
import type { BudgetBillData, BudgetEntity, BudgetExpenseData, BudgetIncomeData } from './types'

const carimbos = { createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z' }

const entrada = (overrides: Partial<BudgetIncomeData> = {}): BudgetEntity<BudgetIncomeData> => ({
  id: 'e1', category: 'salary', description: 'Salário fictício', amount: 3000, date: '2026-08-05',
  responsible: '', notes: '', recurring: false, ...carimbos, ...overrides,
})

const despesa = (overrides: Partial<BudgetExpenseData> = {}): BudgetEntity<BudgetExpenseData> => ({
  id: 'd1', category: 'food', description: 'Compra fictícia', amount: 300.5, date: '2026-08-10',
  status: 'paid', fixed: false, installment: false, installmentsTotal: 0, installmentNumber: 0,
  notes: '', titheDeducted: false, ...carimbos, ...overrides,
})

const conta = (overrides: Partial<BudgetBillData> = {}): BudgetEntity<BudgetBillData> => ({
  id: 'c1', name: 'Energia fictícia', category: 'utilities', amount: 120, dueDate: '2026-08-15',
  recurring: true, status: 'pending', notes: '', ...carimbos, ...overrides,
})

describe('adaptador do dado antigo', () => {
  it('lê a entrada antiga sem perder centavo', () => {
    const lida = entradaAntiga(entrada({ amount: 3000.45 }))
    expect(lida.valor).toBe(emCentavos(3000.45))
    expect(lida.natureza).toBe('entrada')
    expect(lida.situacao).toBe('recebida')
  })

  it('cai na subcategoria genérica em vez de chutar uma específica', () => {
    /*
      A categoria antiga "Alimentação" não diz se foi mercado ou padaria.
      Chutar "Supermercado" daria um relatório mais bonito e mais falso.
    */
    const lida = saidaAntiga(despesa({ category: 'food' }))
    expect(lida.subcategoria).toBe('alimentacao.outra-alimentacao')
    expect(acharSubcategoria(lida.subcategoria)?.categoria.nome).toBe('Alimentação')
  })

  it('toda categoria antiga aponta para uma subcategoria que existe', () => {
    const categorias = ['housing', 'utilities', 'food', 'transport', 'health', 'education', 'family', 'leisure', 'offerings', 'tithe', 'reserve', 'debts', 'other'] as const
    for (const category of categorias) {
      expect(acharSubcategoria(saidaAntiga(despesa({ category })).subcategoria)).not.toBeNull()
    }
    const entradas = ['salary', 'fixed_report', 'travel_report', 'thirteenth_salary', 'vacation', 'spouse_income', 'other'] as const
    for (const category of entradas) {
      expect(acharSubcategoria(entradaAntiga(entrada({ category })).subcategoria)).not.toBeNull()
    }
  })

  it('dízimo antigo continua sendo dízimo', () => {
    expect(saidaAntiga(despesa({ category: 'tithe' })).subcategoria).toBe('generosidade.dizimo')
  })

  it('a situação antiga vira a nova', () => {
    expect(saidaAntiga(despesa({ status: 'paid' })).situacao).toBe('paga')
    expect(saidaAntiga(despesa({ status: 'pending' })).situacao).toBe('pendente')
    expect(saidaAntiga(despesa({ status: 'overdue' })).situacao).toBe('pendente')
  })

  it('conta que se repetia é despesa fixa', () => {
    expect(contaAntiga(conta({ recurring: true })).tipo).toBe('fixa')
    expect(contaAntiga(conta({ recurring: false })).tipo).toBe('variavel')
  })

  it('parcelamento antigo é preservado', () => {
    const lida = saidaAntiga(despesa({ installment: true, installmentsTotal: 12, installmentNumber: 4 }))
    expect(lida.parcelamento).toMatchObject({ total: 12, numero: 4 })
  })

  it('tudo o que vem do antigo se identifica como legado', () => {
    const lidos = lerOAntigo({ incomes: [entrada()], expenses: [despesa()], bills: [conta()] })
    expect(lidos).toHaveLength(3)
    expect(lidos.every(eLegado)).toBe(true)
  })

  /*
    O ponto do adaptador: o dado antigo entra nas somas novas sem ter sido
    reescrito no banco. Se ele ficasse de fora, o pastor abriria a tela nova e
    veria a casa sem renda nenhuma.
  */
  it('o dado antigo entra nas somas novas', () => {
    const resumo = resumoDoMes(lerOAntigo({
      incomes: [entrada({ amount: 3000 })],
      expenses: [despesa({ amount: 300, status: 'paid' })],
      bills: [conta({ amount: 120, status: 'pending' })],
    }))
    expect(resumo.recebido).toBe(emCentavos(3000))
    expect(resumo.pago).toBe(emCentavos(300))
    expect(resumo.comprometido).toBe(emCentavos(120))
    expect(resumo.livre).toBe(emCentavos(2580))
  })
})
