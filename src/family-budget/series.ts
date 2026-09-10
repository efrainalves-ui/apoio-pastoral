import { dividirEmParcelas, type Centavos } from './dinheiro'
import type { Lancamento, LancamentoData, Recorrencia } from './lancamento'

/**
 * Séries: o que se repete e o que se parcela.
 *
 * As ocorrências são gravadas, não calculadas na hora. Calcular parecia mais
 * limpo, mas quebra na primeira vez que a conta de luz vem diferente: para
 * mudar só aquele mês seria preciso guardar uma exceção — e aí já são duas
 * verdades sobre o mesmo mês, uma na regra e outra na exceção. Gravadas, cada
 * mês é um lançamento que se edita como qualquer outro.
 *
 * O que a série guarda é a ligação entre elas, para quando o pastor quiser
 * mudar "esta e as próximas".
 */

const PASSO_EM_MESES: Partial<Record<Recorrencia, number>> = {
  mensal: 1, bimestral: 2, trimestral: 3, semestral: 6, anual: 12,
}
const PASSO_EM_DIAS: Partial<Record<Recorrencia, number>> = { semanal: 7, quinzenal: 14 }

/**
 * Avança uma data local `AAAA-MM-DD`.
 *
 * O dia 31 em fevereiro não existe: uma conta que vence todo dia 31 vence no
 * último dia de fevereiro, e não em 3 de março. Por isso o mês avança preso ao
 * fim do mês, e não somando dias.
 */
export function avancarData(data: string, recorrencia: Recorrencia, passos: number): string {
  if (recorrencia === 'nenhuma' || passos === 0) return data
  const [ano, mes, dia] = data.split('-').map(Number)
  if (!ano || !mes || !dia) return data

  const dias = PASSO_EM_DIAS[recorrencia]
  if (dias) {
    const movida = new Date(ano, mes - 1, dia + dias * passos)
    return chave(movida)
  }

  const meses = PASSO_EM_MESES[recorrencia] ?? 0
  const alvo = new Date(ano, mes - 1 + meses * passos, 1)
  const ultimoDia = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate()
  return chave(new Date(alvo.getFullYear(), alvo.getMonth(), Math.min(dia, ultimoDia)))
}

function chave(data: Date): string {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`
}

const mesDe = (data: string) => data.slice(0, 7)

/**
 * As ocorrências futuras de um lançamento que se repete.
 *
 * Nenhuma nasce paga ou recebida. Uma conta de luz que ainda não chegou não
 * foi paga, e um salário que ainda não caiu não entrou — marcar assim faria o
 * saldo do mês que vem já vir resolvido, e o pastor tomaria decisão sobre
 * dinheiro que não existe.
 */
export function gerarOcorrencias(base: LancamentoData, quantidade: number, serieId: string): LancamentoData[] {
  if (base.recorrencia === 'nenhuma' || quantidade < 1) return []
  const emAberto = base.natureza === 'entrada' ? 'prevista' as const : 'pendente' as const
  return Array.from({ length: quantidade }, (_, indice) => {
    const passo = indice + 1
    const data = avancarData(base.data, base.recorrencia, passo)
    return {
      ...base,
      data,
      competencia: base.competencia === mesDe(base.data) ? mesDe(data) : avancarMes(base.competencia, base.recorrencia, passo),
      vencimento: base.vencimento ? avancarData(base.vencimento, base.recorrencia, passo) : '',
      situacao: emAberto,
      serieId,
    }
  })
}

/** A competência anda junto com a data, no mesmo passo. */
function avancarMes(competencia: string, recorrencia: Recorrencia, passos: number): string {
  return mesDe(avancarData(`${competencia}-01`, recorrencia, passos))
}

export interface PlanoDeParcelamento {
  /** Total da compra, que será dividido. */
  total: Centavos
  /** Em quantas vezes a compra foi feita, contando as pagas antes do aplicativo. */
  parcelas: number
  /**
   * Quantas já foram pagas antes de o aplicativo existir.
   *
   * Quem tem 11 de 24 restantes não pode ser obrigado a cadastrar as 13
   * primeiras só para o número da parcela bater na tela.
   */
  jaPagas: number
}

/**
 * As parcelas que ainda vão vencer.
 *
 * O valor de cada uma sai da divisão exata do total: R$ 100 em três dá 33,34 +
 * 33,33 + 33,33, e não três de 33,33 que perdem um centavo. Só as que faltam
 * são gravadas — o passado que não está no aplicativo continua fora dele, mas
 * o número da parcela e o total continuam certos.
 */
export function gerarParcelas(base: LancamentoData, plano: PlanoDeParcelamento, serie: string): LancamentoData[] {
  const { total, parcelas, jaPagas } = plano
  if (parcelas < 1) return []
  const pagas = Math.max(0, Math.min(jaPagas, parcelas))
  const valores = dividirEmParcelas(total, parcelas)
  const restantes = parcelas - pagas

  return Array.from({ length: restantes }, (_, indice) => {
    const numero = pagas + indice + 1
    const data = avancarData(base.data, 'mensal', indice)
    return {
      ...base,
      valor: valores[numero - 1] ?? 0,
      data,
      competencia: mesDe(data),
      vencimento: base.vencimento ? avancarData(base.vencimento, 'mensal', indice) : data,
      situacao: 'pendente' as const,
      recorrencia: 'nenhuma' as const,
      serieId: null,
      parcelamento: { total: parcelas, numero, serie },
    }
  })
}

export const ESCOPOS_DE_EDICAO = ['somente_esta', 'esta_e_proximas', 'serie_inteira'] as const
export type EscopoDeEdicao = (typeof ESCOPOS_DE_EDICAO)[number]
export const ESCOPO_LABELS: Record<EscopoDeEdicao, string> = {
  somente_esta: 'Somente esta',
  esta_e_proximas: 'Esta e as próximas',
  serie_inteira: 'Toda a série',
}

/**
 * Quais lançamentos uma edição alcança.
 *
 * "Esta e as próximas" olha a data, e não a ordem de criação: o que já passou
 * fica como está, porque a conta de luz de agosto veio no valor que veio e
 * mudar isso reescreveria o passado.
 */
export function alcanceDaEdicao(
  lancamentos: readonly Lancamento[],
  alvo: Lancamento,
  escopo: EscopoDeEdicao,
): Lancamento[] {
  if (escopo === 'somente_esta' || !alvo.serieId) return [alvo]
  const daSerie = lancamentos.filter((item) => item.serieId === alvo.serieId)
  if (escopo === 'serie_inteira') return daSerie
  return daSerie.filter((item) => item.data >= alvo.data)
}

/** As parcelas da mesma compra, em ordem. */
export function parcelasDaCompra(lancamentos: readonly Lancamento[], serie: string): Lancamento[] {
  return lancamentos
    .filter((item) => item.parcelamento?.serie === serie)
    .sort((esquerda, direita) => (esquerda.parcelamento?.numero ?? 0) - (direita.parcelamento?.numero ?? 0))
}
