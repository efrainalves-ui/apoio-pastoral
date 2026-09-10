import type { Centavos } from './dinheiro'
import type { NaturezaDoLancamento } from './catalogo'

/**
 * O lançamento único das finanças pessoais.
 *
 * O modelo antigo tinha cinco formas separadas — entrada, despesa, conta,
 * dívida, meta — e cada uma carregava um pedaço diferente da verdade. "Conta de
 * luz" e "despesa de luz" eram coisas distintas no banco e a mesma coisa na
 * vida. Aqui há um lançamento só, e as diferenças viram dimensões dele.
 *
 * Elas não são a mesma coisa e não podem virar categoria: cartão de crédito é
 * forma de pagamento, Pix é forma de pagamento, "pago" é situação. Uma compra
 * de mercado no cartão é `alimentacao.supermercado` paga com `cartao` — e a
 * fatura desse cartão não é uma segunda despesa.
 */

export const SITUACOES_DE_ENTRADA = ['prevista', 'recebida'] as const
export type SituacaoDeEntrada = (typeof SITUACOES_DE_ENTRADA)[number]
export const SITUACAO_DE_ENTRADA_LABELS: Record<SituacaoDeEntrada, string> = {
  prevista: 'Prevista', recebida: 'Recebida',
}

export const SITUACOES_DE_SAIDA = ['pendente', 'paga'] as const
export type SituacaoDeSaida = (typeof SITUACOES_DE_SAIDA)[number]
export const SITUACAO_DE_SAIDA_LABELS: Record<SituacaoDeSaida, string> = {
  pendente: 'Pendente', paga: 'Paga',
}

/**
 * "Atrasada" não é situação gravada: é `pendente` com vencimento no passado.
 *
 * Gravá-la criaria um estado que envelhece sozinho e precisa de alguém para
 * atualizá-lo todo dia. Derivar da data não precisa.
 */
export type SituacaoVisivel = SituacaoDeSaida | 'atrasada'

export function situacaoVisivel(situacao: SituacaoDeSaida, vencimento: string, hoje: string): SituacaoVisivel {
  if (situacao === 'paga') return 'paga'
  return vencimento && vencimento < hoje ? 'atrasada' : 'pendente'
}

export const FORMAS_DE_PAGAMENTO = ['dinheiro', 'pix', 'debito', 'credito', 'boleto', 'debito_automatico', 'transferencia', 'outro'] as const
export type FormaDePagamento = (typeof FORMAS_DE_PAGAMENTO)[number]
export const FORMA_DE_PAGAMENTO_LABELS: Record<FormaDePagamento, string> = {
  dinheiro: 'Dinheiro', pix: 'Pix', debito: 'Cartão de débito', credito: 'Cartão de crédito',
  boleto: 'Boleto', debito_automatico: 'Débito automático', transferencia: 'Transferência', outro: 'Outro',
}

export const RECORRENCIAS = ['nenhuma', 'semanal', 'quinzenal', 'mensal', 'bimestral', 'trimestral', 'semestral', 'anual'] as const
export type Recorrencia = (typeof RECORRENCIAS)[number]
export const RECORRENCIA_LABELS: Record<Recorrencia, string> = {
  nenhuma: 'Não se repete', semanal: 'Semanal', quinzenal: 'Quinzenal', mensal: 'Mensal',
  bimestral: 'Bimestral', trimestral: 'Trimestral', semestral: 'Semestral', anual: 'Anual',
}

export type TipoDeDespesa = 'fixa' | 'variavel'
export const TIPO_DE_DESPESA_LABELS: Record<TipoDeDespesa, string> = { fixa: 'Fixa', variavel: 'Variável' }

export interface Parcelamento {
  /** Quantas parcelas a compra tem no total, contando as pagas antes do aplicativo. */
  total: number
  /** Qual delas é esta. Começa em 1. */
  numero: number
  /** Identificador comum a todas as parcelas da mesma compra. */
  serie: string
}

export interface LancamentoData {
  natureza: NaturezaDoLancamento
  descricao: string
  valor: Centavos
  /** Código de subcategoria do catálogo, como `alimentacao.supermercado`. */
  subcategoria: string
  /** Quando o dinheiro entrou ou saiu, em chave local `AAAA-MM-DD`. */
  data: string
  /**
   * A que mês o valor se refere, em `AAAA-MM`.
   *
   * Salário de agosto recebido em 5 de setembro tem data em setembro e
   * competência em agosto. Sem essa separação o relatório de agosto mostra a
   * casa sem renda e o de setembro com renda dobrada.
   */
  competencia: string
  /** Só para saídas: quando vence. Vazio quando não há prazo. */
  vencimento: string
  situacao: SituacaoDeEntrada | SituacaoDeSaida
  tipo: TipoDeDespesa
  formaDePagamento: FormaDePagamento | null
  contaId: string | null
  cartaoId: string | null
  /** Quem recebeu a entrada, ou quem pagou a saída. */
  integranteId: string | null
  /** Para quem foi a saída, quando é diferente de quem pagou. */
  referenteA: string | null
  recorrencia: Recorrencia
  /** Identificador comum às ocorrências da mesma série recorrente. */
  serieId: string | null
  parcelamento: Parcelamento | null
  /**
   * Dízimo que já saiu do salário antes de ele cair na conta.
   *
   * Ele precisa aparecer no acompanhamento — é dízimo devolvido, e o pastor
   * quer ver o total do ano. Mas não pode diminuir o disponível de novo: o
   * dinheiro nunca chegou à conta, e descontá-lo outra vez faria a família
   * parecer ter menos do que tem.
   */
  descontadoNaFonte: boolean
  observacao: string
  createdAt: string
  updatedAt: string
}

export type Lancamento = LancamentoData & { id: string }

/**
 * A transferência entre contas não é entrada nem saída.
 *
 * Mandar mil reais da corrente para a poupança não deixou a família mais rica
 * nem mais pobre — o dinheiro só mudou de lugar. Se isso virasse um lançamento
 * comum, a receita do mês subiria mil e a despesa também, e a taxa de economia
 * mentiria nos dois sentidos. Por isso mora numa forma própria, e nenhum
 * cálculo de entrada ou saída a enxerga.
 */
export interface TransferenciaData {
  origemContaId: string
  destinoContaId: string
  valor: Centavos
  data: string
  /** Quando a transferência alimenta uma meta, o dinheiro continua sendo da família. */
  metaId: string | null
  observacao: string
  createdAt: string
  updatedAt: string
}

export type Transferencia = TransferenciaData & { id: string }

export const TIPOS_DE_CONTA = ['corrente', 'poupanca', 'digital', 'carteira', 'investimento', 'outra'] as const
export type TipoDeConta = (typeof TIPOS_DE_CONTA)[number]
export const TIPO_DE_CONTA_LABELS: Record<TipoDeConta, string> = {
  corrente: 'Conta corrente', poupanca: 'Poupança', digital: 'Conta digital',
  carteira: 'Dinheiro/carteira', investimento: 'Investimento', outra: 'Outra',
}

export interface ContaData {
  nome: string
  instituicao: string
  tipo: TipoDeConta
  saldoInicial: Centavos
  ativa: boolean
  observacao: string
  createdAt: string
  updatedAt: string
}

export type Conta = ContaData & { id: string }

export interface CartaoData {
  nome: string
  bandeira: string
  contaId: string | null
  limite: Centavos
  diaDeFechamento: number
  diaDeVencimento: number
  ativo: boolean
  createdAt: string
  updatedAt: string
}

export type Cartao = CartaoData & { id: string }

/**
 * Integrante da família.
 *
 * "Família" não é um integrante cadastrado: é a ausência de um, e vale para o
 * que é da casa toda. Guardar uma pessoa chamada "Família" faria a soma por
 * integrante contar a casa como se fosse mais alguém.
 */
export interface IntegranteData {
  nome: string
  relacao: string
  ativo: boolean
  createdAt: string
  updatedAt: string
}

export type Integrante = IntegranteData & { id: string }

/** O identificador usado quando o valor é da casa, e não de uma pessoa. */
export const FAMILIA = null

export function nomeDoIntegrante(integrantes: readonly Integrante[], id: string | null): string {
  if (!id) return 'Família'
  return integrantes.find((integrante) => integrante.id === id)?.nome ?? 'Família'
}
