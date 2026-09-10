import type { Centavos } from '../family-budget/dinheiro'
import { aplicarRegra, type ContextoDoCalculo, type MemoriaDeCalculo, type RegraDeCalculo } from './parametros'

/**
 * Um lançamento do Trabalho.
 *
 * O ciclo tem quatro números que quase nunca são iguais, e tratá-los como um só
 * é o defeito que faz o pastor achar que recebeu o que não recebeu: o que a
 * regra prevê, o que ele pediu, o que foi aprovado e o que caiu na conta.
 *
 * A memória do cálculo fica gravada no lançamento. Quando o FPE mudar, o
 * reembolso de março continua explicável — recalcular o passado em silêncio
 * seria trocar o histórico do pastor por uma conta nova que ele nunca viu.
 */

export const SITUACOES_DO_LANCAMENTO = ['previsto', 'solicitado', 'aprovado', 'recebido', 'negado'] as const
export type SituacaoDoLancamento = (typeof SITUACOES_DO_LANCAMENTO)[number]
export const SITUACAO_DO_LANCAMENTO_LABELS: Record<SituacaoDoLancamento, string> = {
  previsto: 'Previsto', solicitado: 'Solicitado', aprovado: 'Aprovado',
  recebido: 'Recebido', negado: 'Negado',
}

export interface LancamentoDoTrabalhoData {
  subcategoriaId: string
  descricao: string
  /** Data do gasto, em chave local `AAAA-MM-DD`. */
  data: string
  /** Mês de referência `AAAA-MM`, que nem sempre é o mês do gasto. */
  competencia: string

  /** O que o pastor pagou de fato. */
  valorPago: Centavos
  /**
   * A parte do que foi pago que a regra considera.
   *
   * Uma nota de mercado com combustível e compras pessoais entra inteira como
   * pago, mas só o combustível é base elegível. Zero significa "igual ao pago".
   */
  baseElegivel: Centavos

  /** O que a regra prevê que volte. Calculado, não digitado. */
  previsto: Centavos
  /** O que foi efetivamente pedido, que pode ser menos. */
  solicitado: Centavos | null
  aprovado: Centavos | null
  recebido: Centavos | null

  situacao: SituacaoDoLancamento
  /** Quando o dinheiro entrou. */
  dataDoRecebimento: string
  /** Documento que originou o valor: contracheque, relatório, recibo. */
  documento: string
  /** Como o valor chegou: folha, depósito, cartão da instituição. */
  formaDeRecebimento: string

  /** O que a regra usou, congelado no momento do lançamento. */
  memoria: MemoriaDeCalculo | null

  churchId: string | null
  visitId: string | null
  agendaEventId: string | null
  /** Lançamento espelho no orçamento pessoal, quando houver parcela pessoal. */
  lancamentoPessoalId: string | null
  observacao: string
  createdAt: string
  updatedAt: string
}

export type LancamentoDoTrabalho = LancamentoDoTrabalhoData & { id: string }

export function lancamentoVazio(competencia: string, data: string): LancamentoDoTrabalhoData {
  return {
    subcategoriaId: '', descricao: '', data, competencia,
    valorPago: 0, baseElegivel: 0, previsto: 0,
    solicitado: null, aprovado: null, recebido: null,
    situacao: 'previsto', dataDoRecebimento: '', documento: '', formaDeRecebimento: '',
    memoria: null, churchId: null, visitId: null, agendaEventId: null,
    lancamentoPessoalId: null, observacao: '', createdAt: '', updatedAt: '',
  }
}

/** A base que a regra enxerga: o recorte elegível, ou o pago inteiro. */
export function baseDoCalculo(lancamento: Pick<LancamentoDoTrabalhoData, 'valorPago' | 'baseElegivel'>): Centavos {
  return lancamento.baseElegivel > 0 ? lancamento.baseElegivel : lancamento.valorPago
}

/**
 * Recalcula o previsto de um lançamento a partir de uma regra.
 *
 * Chamada só quando o pastor edita o lançamento ou pede o recálculo. Nenhum
 * caminho automático passa por aqui: um valor antigo que muda sozinho é um
 * valor em que ninguém confia.
 */
export function calcularPrevisto(
  lancamento: Pick<LancamentoDoTrabalhoData, 'valorPago' | 'baseElegivel'>,
  regra: RegraDeCalculo,
  contexto: Omit<ContextoDoCalculo, 'valorDaDespesa'>,
): MemoriaDeCalculo {
  return aplicarRegra(regra, { ...contexto, valorDaDespesa: baseDoCalculo(lancamento) })
}

/**
 * Quanto saiu do bolso do pastor, de verdade.
 *
 * Enquanto o dinheiro não entra, o previsto é promessa: o pastor está com o
 * valor inteiro fora do bolso. Depois que entra, sobra a diferença. É por isso
 * que a parcela pessoal olha para o recebido quando ele existe, e não antes.
 */
export function parcelaPessoal(lancamento: Pick<LancamentoDoTrabalhoData, 'valorPago' | 'recebido' | 'situacao'>): Centavos {
  if (lancamento.situacao === 'negado') return lancamento.valorPago
  if (lancamento.recebido === null) return lancamento.valorPago
  return Math.max(0, lancamento.valorPago - lancamento.recebido)
}

/** A diferença entre o que foi aprovado e o que caiu na conta. */
export function diferencaDoRecebimento(lancamento: Pick<LancamentoDoTrabalhoData, 'aprovado' | 'recebido'>): Centavos | null {
  if (lancamento.aprovado === null || lancamento.recebido === null) return null
  return lancamento.recebido - lancamento.aprovado
}

export interface ResumoDoTrabalho {
  pago: Centavos
  previsto: Centavos
  solicitado: Centavos
  aprovado: Centavos
  recebido: Centavos
  /** O que ainda não voltou, de tudo que já foi pedido. */
  aReceber: Centavos
  /** O que saiu do bolso e não volta. */
  doBolso: Centavos
  /** Lançamentos ainda sem desfecho. */
  pendentes: number
}

export function resumoDoTrabalho(lancamentos: readonly LancamentoDoTrabalhoData[]): ResumoDoTrabalho {
  const soma = (valores: ReadonlyArray<Centavos | null>) =>
    valores.reduce<Centavos>((total, valor) => total + (valor ?? 0), 0)

  const recebido = soma(lancamentos.map((lancamento) => lancamento.recebido))
  /*
    Só entra em "a receber" o que já foi pedido. Previsto que ninguém solicitou
    ainda não é crédito contra a instituição — é lembrete.
  */
  const jaPedidos = lancamentos.filter((lancamento) => lancamento.situacao === 'solicitado' || lancamento.situacao === 'aprovado')

  return {
    pago: soma(lancamentos.map((lancamento) => lancamento.valorPago)),
    previsto: soma(lancamentos.map((lancamento) => lancamento.previsto)),
    solicitado: soma(lancamentos.map((lancamento) => lancamento.solicitado)),
    aprovado: soma(lancamentos.map((lancamento) => lancamento.aprovado)),
    recebido,
    aReceber: soma(jaPedidos.map((lancamento) => lancamento.aprovado ?? lancamento.solicitado)) - soma(jaPedidos.map((lancamento) => lancamento.recebido)),
    doBolso: lancamentos.reduce((total, lancamento) => total + parcelaPessoal(lancamento), 0),
    pendentes: lancamentos.filter((lancamento) => lancamento.situacao !== 'recebido' && lancamento.situacao !== 'negado').length,
  }
}
