import type { Centavos } from '../family-budget/dinheiro'
import { parcelaPessoal, type LancamentoDoTrabalhoData } from './lancamento'
import type { ContextoDoCalculo, MemoriaDeCalculo } from './parametros'

/**
 * Viagens e mudanças.
 *
 * As duas juntam despesas que só fazem sentido lidas em bloco: uma passagem, um
 * hotel e três almoços isolados no mês não dizem nada; agrupados sob "Assembleia
 * em Belém, 10 a 13 de setembro" dizem tudo — inclusive quanto daquela viagem
 * saiu do bolso do pastor.
 *
 * A diária é a parte com aritmética, e é onde mora a pergunta que este módulo
 * se recusa a responder sozinho: uma viagem de 10 a 13 são três diárias ou
 * quatro? A resposta muda de instituição para instituição. O aplicativo propõe
 * o número de noites, mostra a conta, e deixa o pastor corrigir — inventar a
 * regra aqui seria errado em silêncio em todo lugar que usa a outra.
 */

export const TIPOS_DE_VIAGEM = ['viagem', 'mudanca'] as const
export type TipoDeViagem = (typeof TIPOS_DE_VIAGEM)[number]
export const TIPO_DE_VIAGEM_LABELS: Record<TipoDeViagem, string> = {
  viagem: 'Viagem', mudanca: 'Mudança',
}

export interface ViagemData {
  tipo: TipoDeViagem
  destino: string
  motivo: string
  /** Chaves locais `AAAA-MM-DD`. */
  saida: string
  retorno: string
  /**
   * Quantas diárias esta viagem rende.
   *
   * Proposto pelas datas e confirmado pelo pastor. Mudança não tem diária.
   */
  diarias: number
  /** O valor da diária no momento do cálculo, congelado como toda memória. */
  valorDaDiariaUsado: Centavos | null
  observacao: string
  createdAt: string
  updatedAt: string
}

export type Viagem = ViagemData & { id: string }

export function viagemVazia(tipo: TipoDeViagem, hoje: string): ViagemData {
  return {
    tipo, destino: '', motivo: '', saida: hoje, retorno: hoje,
    diarias: 0, valorDaDiariaUsado: null, observacao: '', createdAt: '', updatedAt: '',
  }
}

/**
 * As noites entre a saída e o retorno.
 *
 * É uma proposta, não a regra: é o número que quase todas as regras usam como
 * ponto de partida, e o que o pastor corrige quando a dele conta diferente.
 */
export function diariasSugeridas(saida: string, retorno: string): number {
  if (!saida || !retorno || retorno < saida) return 0
  const inicio = Date.parse(`${saida}T12:00:00Z`)
  const fim = Date.parse(`${retorno}T12:00:00Z`)
  if (Number.isNaN(inicio) || Number.isNaN(fim)) return 0
  return Math.round((fim - inicio) / 86_400_000)
}

export function previstoDasDiarias(
  diarias: number,
  valorDaDiaria: Centavos | null,
  contexto: Pick<ContextoDoCalculo, 'fpe' | 'percentualDeAudit'>,
  referencia = '',
): MemoriaDeCalculo {
  const comum = {
    fpeUtilizado: contexto.fpe,
    percentualDeAuditUtilizado: contexto.percentualDeAudit,
    base: 'VALOR_FIXO_LOCAL' as const,
    valorDaBase: valorDaDiaria,
    percentualAplicado: null,
    tetoAplicado: null,
    limitadoPeloTeto: false,
    referencia,
  }
  if (valorDaDiaria === null) {
    return { ...comum, valor: 0, parcelaPessoal: 0, pendencia: 'Valor da diária ainda não configurado.' }
  }
  return { ...comum, valor: Math.round(diarias * valorDaDiaria), parcelaPessoal: 0, pendencia: null }
}

export interface ResumoDaViagem {
  /** O que as diárias rendem, quando há regra configurada. */
  previstoDasDiarias: Centavos | null
  /** O que o pastor pagou nas despesas ligadas a esta viagem. */
  pago: Centavos
  /** O que as regras preveem devolver dessas despesas. */
  previstoDasDespesas: Centavos
  recebido: Centavos
  /** Diárias mais despesas: o que a viagem inteira deve render. */
  previstoTotal: Centavos | null
  /** O que a viagem custou ao pastor até agora. */
  doBolso: Centavos
  despesas: number
  pendencia: string | null
}

/**
 * O relatório de uma viagem.
 *
 * Diárias e despesas somam-se, mas nunca se confundem: a diária é devida pelos
 * dias fora, independentemente do que foi gasto, e a despesa é reembolsada pelo
 * que custou. Tratá-las como uma coisa só faria a viagem parecer paga duas
 * vezes ou nenhuma.
 */
export function resumoDaViagem(
  viagem: Pick<ViagemData, 'tipo' | 'diarias' | 'valorDaDiariaUsado'>,
  lancamentos: readonly LancamentoDoTrabalhoData[],
  contexto: Pick<ContextoDoCalculo, 'fpe' | 'percentualDeAudit'>,
): ResumoDaViagem {
  // Mudança não tem diária: o obreiro não está a serviço fora, está se mudando.
  const memoria = viagem.tipo === 'mudanca'
    ? null
    : previstoDasDiarias(viagem.diarias, viagem.valorDaDiariaUsado, contexto)

  const pago = lancamentos.reduce<Centavos>((total, lancamento) => total + lancamento.valorPago, 0)
  const previstoDasDespesas = lancamentos.reduce<Centavos>((total, lancamento) => total + lancamento.previsto, 0)
  const recebido = lancamentos.reduce<Centavos>((total, lancamento) => total + (lancamento.recebido ?? 0), 0)
  const doBolso = lancamentos.reduce<Centavos>((total, lancamento) => total + parcelaPessoal(lancamento), 0)
  /*
    Nulo e zero dizem coisas diferentes aqui. Mudança não tem diária nenhuma —
    as despesas dela seguem valendo, e o total é o delas. Viagem com o valor da
    diária ainda não configurado tem diária, e o total não pode ser dito: mostrar
    só as despesas faria a viagem parecer render menos do que renderá.
  */
  const semRegra = memoria !== null && memoria.pendencia !== null

  return {
    previstoDasDiarias: memoria === null || semRegra ? null : memoria.valor,
    pago,
    previstoDasDespesas,
    recebido,
    previstoTotal: semRegra ? null : (memoria?.valor ?? 0) + previstoDasDespesas,
    doBolso,
    despesas: lancamentos.length,
    pendencia: memoria?.pendencia ?? null,
  }
}

/** Os lançamentos de uma viagem. */
export function daViagem<T extends { viagemId?: string | null }>(lancamentos: readonly T[], viagemId: string): T[] {
  return lancamentos.filter((lancamento) => lancamento.viagemId === viagemId)
}
