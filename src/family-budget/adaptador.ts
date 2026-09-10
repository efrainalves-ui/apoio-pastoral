import { emCentavos } from './dinheiro'
import type { Lancamento } from './lancamento'
import type {
  BudgetBillData, BudgetEntity, BudgetExpenseData, BudgetIncomeData,
  ExpenseCategory, IncomeCategory,
} from './types'

/**
 * O que já estava gravado, lido no formato novo.
 *
 * Migrar de verdade — reescrever cada registro financeiro do pastor num banco
 * cifrado — é o passo mais arriscado desta reconstrução, e não é um passo que
 * se dá de passagem. Enquanto ele não vem, o dado antigo continua exatamente
 * onde está e é apenas **lido** no formato novo, para aparecer nas telas e
 * entrar nas somas.
 *
 * Nada aqui grava. Um lançamento adaptado carrega `legado`, e a tela não
 * oferece editar o que ela não sabe gravar de volta.
 */

export type LancamentoLegado = Lancamento & { legado: true }

/*
  As categorias antigas eram treze e não tinham subcategoria. Cada uma cai na
  subcategoria genérica da família nova correspondente — "Outra despesa de
  moradia", e não um chute em "Aluguel". Chutar daria um relatório mais bonito
  e mais falso.
*/
const ENTRADA_ANTIGA: Record<IncomeCategory, string> = {
  salary: 'remuneracao.salario',
  thirteenth_salary: 'remuneracao.13-salario',
  vacation: 'remuneracao.ferias',
  spouse_income: 'outras-entradas.outra-entrada',
  fixed_report: 'outras-entradas.outra-entrada',
  travel_report: 'outras-entradas.outra-entrada',
  other: 'outras-entradas.outra-entrada',
}

const SAIDA_ANTIGA: Record<ExpenseCategory, string> = {
  housing: 'moradia.outra-despesa-de-moradia',
  utilities: 'moradia.outra-despesa-de-moradia',
  food: 'alimentacao.outra-alimentacao',
  transport: 'transporte.outro-transporte',
  health: 'saude.outra-despesa-de-saude',
  education: 'educacao.outra-despesa-educacional',
  family: 'filhos.outra-despesa-familiar',
  leisure: 'lazer.outro-lazer',
  offerings: 'generosidade.outra-contribuicao',
  tithe: 'generosidade.dizimo',
  reserve: 'outros.despesa-nao-classificada',
  debts: 'dividas.outro-compromisso-financeiro',
  other: 'outros.outra-despesa',
}

const mes = (data: string) => data.slice(0, 7)

function comum(id: string, criado: string, atualizado: string) {
  return {
    id,
    contaId: null, cartaoId: null, integranteId: null, referenteA: null,
    recorrencia: 'nenhuma' as const, serieId: null, parcelamento: null, descontadoNaFonte: false,
    createdAt: criado, updatedAt: atualizado, legado: true as const,
  }
}

export function entradaAntiga(registro: BudgetEntity<BudgetIncomeData>): LancamentoLegado {
  return {
    ...comum(registro.id, registro.createdAt, registro.updatedAt),
    natureza: 'entrada',
    descricao: registro.description || 'Entrada sem descrição',
    valor: emCentavos(registro.amount),
    subcategoria: ENTRADA_ANTIGA[registro.category] ?? 'outras-entradas.outra-entrada',
    data: registro.date,
    competencia: mes(registro.date),
    vencimento: '',
    // O modelo antigo não tinha "prevista": o que estava lá já tinha entrado.
    situacao: 'recebida',
    tipo: 'variavel',
    formaDePagamento: null,
    observacao: registro.notes,
  }
}

export function saidaAntiga(registro: BudgetEntity<BudgetExpenseData>): LancamentoLegado {
  return {
    ...comum(registro.id, registro.createdAt, registro.updatedAt),
    natureza: 'saida',
    descricao: registro.description || 'Saída sem descrição',
    valor: emCentavos(registro.amount),
    subcategoria: SAIDA_ANTIGA[registro.category] ?? 'outros.outra-despesa',
    data: registro.date,
    competencia: mes(registro.date),
    vencimento: registro.date,
    situacao: registro.status === 'paid' ? 'paga' : 'pendente',
    tipo: registro.fixed ? 'fixa' : 'variavel',
    formaDePagamento: null,
    observacao: registro.notes,
    parcelamento: registro.installment && registro.installmentsTotal > 0
      ? { total: registro.installmentsTotal, numero: registro.installmentNumber || 1, serie: registro.recurrenceId ?? registro.id }
      : null,
  }
}

export function contaAntiga(registro: BudgetEntity<BudgetBillData>): LancamentoLegado {
  return {
    ...comum(registro.id, registro.createdAt, registro.updatedAt),
    natureza: 'saida',
    descricao: registro.name || 'Conta sem nome',
    valor: emCentavos(registro.amount),
    subcategoria: SAIDA_ANTIGA[registro.category] ?? 'outros.outra-despesa',
    data: registro.dueDate,
    competencia: mes(registro.dueDate),
    vencimento: registro.dueDate,
    situacao: registro.status === 'paid' ? 'paga' : 'pendente',
    // Conta que se repete todo mês é despesa fixa, e era isso que `recurring` dizia.
    tipo: registro.recurring ? 'fixa' : 'variavel',
    formaDePagamento: null,
    observacao: registro.notes,
  }
}

export interface RegistrosAntigos {
  incomes: BudgetEntity<BudgetIncomeData>[]
  expenses: BudgetEntity<BudgetExpenseData>[]
  bills: BudgetEntity<BudgetBillData>[]
}

/** Tudo o que já estava gravado, no formato novo, sem tocar no que está no banco. */
export function lerOAntigo(registros: RegistrosAntigos): LancamentoLegado[] {
  return [
    ...registros.incomes.map(entradaAntiga),
    ...registros.expenses.map(saidaAntiga),
    ...registros.bills.map(contaAntiga),
  ]
}

export function eLegado(lancamento: Lancamento): lancamento is LancamentoLegado {
  return (lancamento as LancamentoLegado).legado === true
}
