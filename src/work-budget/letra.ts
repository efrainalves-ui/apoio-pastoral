import type { Centavos } from '../family-budget/dinheiro'
import { aplicarRegra, type BaseDeCalculo, type ContextoDoCalculo, type MemoriaDeCalculo } from './parametros'

/**
 * LETRA.
 *
 * A sigla aparece como sigla, porque é assim que ela chega ao pastor. Inventar
 * uma expansão que soe oficial seria pior do que não expandir: o pastor
 * repetiria a invenção na tesouraria.
 *
 * O programa tem três limites que atuam ao mesmo tempo, e é a combinação deles
 * que confunde: o orçamento do ano, a reserva que só pode virar livro, e o
 * limite de cada item com seu intervalo de renovação. Um item pode caber no
 * orçamento e ainda assim estar bloqueado porque foi comprado ano passado.
 */

export interface ItemDoCatalogoLetra {
  id: string
  nome: string
  grupo: string
  /** Limite por aquisição, quando fixo. */
  limite: Centavos | null
  /** Limite expresso como percentual de uma base. */
  limitePercentual: number | null
  limiteBase: BaseDeCalculo | null
  /** Meses até poder adquirir de novo. Nulo quando não há intervalo. */
  intervaloEmMeses: number | null
  /** Conta contra a reserva de livros em vez do orçamento geral. */
  ehLivro: boolean
  referencia: string
  observacao: string
}

export interface AquisicaoLetraData {
  itemId: string
  descricao: string
  /** Data da aquisição, em chave local `AAAA-MM-DD`. */
  data: string
  /** Quanto custou. */
  valor: Centavos
  /** Quanto o programa cobriu, já com limite aplicado. */
  coberto: Centavos
  /** O que passou do limite e ficou com o pastor. */
  parcelaPessoal: Centavos
  /** O que foi usado no cálculo, para o número de hoje continuar explicável amanhã. */
  memoria: MemoriaDeCalculo | null
  observacao: string
  createdAt: string
  updatedAt: string
}

export type AquisicaoLetra = AquisicaoLetraData & { id: string }

export interface OrcamentoLetraData {
  ano: string
  /** Total do ano. */
  total: Centavos
  /**
   * Parte do total que só pode virar livro.
   *
   * Não é um limite separado somado ao orçamento: sai de dentro dele. O que
   * sobra para o resto é `total − reservaDeLivros`.
   */
  reservaDeLivros: Centavos
  referencia: string
  createdAt: string
  updatedAt: string
}

export type OrcamentoLetra = OrcamentoLetraData & { id: string }

export interface SaldoLetra {
  total: Centavos
  reservaDeLivros: Centavos
  /** Teto do que pode ir para itens que não são livro. */
  disponivelParaOutros: Centavos
  usadoEmLivros: Centavos
  usadoEmOutros: Centavos
  saldoDeLivros: Centavos
  saldoDeOutros: Centavos
  saldoTotal: Centavos
  /** Verdadeiro quando o gasto já passou do que o ano comporta. */
  estourado: boolean
}

/**
 * O saldo do ano, separado por reserva.
 *
 * Somar tudo num número só esconde o caso que mais acontece: sobra dinheiro no
 * ano, mas não sobra na parte que dá para gastar com o que o pastor quer
 * comprar.
 */
export function saldoDoAno(
  orcamento: Pick<OrcamentoLetraData, 'total' | 'reservaDeLivros'>,
  aquisicoes: readonly AquisicaoLetra[],
  catalogo: readonly ItemDoCatalogoLetra[],
  ano: string,
): SaldoLetra {
  const ehLivro = new Map(catalogo.map((item) => [item.id, item.ehLivro]))
  const doAno = aquisicoes.filter((aquisicao) => aquisicao.data.startsWith(ano))

  const usadoEmLivros = doAno
    .filter((aquisicao) => ehLivro.get(aquisicao.itemId) === true)
    .reduce((soma, aquisicao) => soma + aquisicao.coberto, 0)
  const usadoEmOutros = doAno
    .filter((aquisicao) => ehLivro.get(aquisicao.itemId) !== true)
    .reduce((soma, aquisicao) => soma + aquisicao.coberto, 0)

  const disponivelParaOutros = Math.max(0, orcamento.total - orcamento.reservaDeLivros)
  /*
    A reserva é piso de livros, não teto: gasto em livro que passe da reserva
    continua valendo e consome o orçamento geral, porque comprar livro é
    exatamente o que o programa quer que aconteça.
  */
  const livrosAlemDaReserva = Math.max(0, usadoEmLivros - orcamento.reservaDeLivros)

  return {
    total: orcamento.total,
    reservaDeLivros: orcamento.reservaDeLivros,
    disponivelParaOutros,
    usadoEmLivros,
    usadoEmOutros,
    saldoDeLivros: Math.max(0, orcamento.reservaDeLivros - usadoEmLivros),
    saldoDeOutros: Math.max(0, disponivelParaOutros - usadoEmOutros - livrosAlemDaReserva),
    saldoTotal: orcamento.total - usadoEmLivros - usadoEmOutros,
    estourado: usadoEmLivros + usadoEmOutros > orcamento.total,
  }
}

export interface Elegibilidade {
  elegivel: boolean
  /** Última aquisição do item, quando houver. */
  ultimaData: string
  /** A partir de quando volta a ser possível. */
  liberaEm: string
  motivo: string
}

/**
 * Se o item pode ser adquirido nesta data.
 *
 * O intervalo conta a partir da última aquisição, não do início do ano. Quem
 * comprou em novembro não recompra em janeiro só porque virou o ano.
 */
export function elegibilidadeDoItem(
  item: Pick<ItemDoCatalogoLetra, 'id' | 'intervaloEmMeses'>,
  aquisicoes: readonly AquisicaoLetra[],
  data: string,
): Elegibilidade {
  const doItem = aquisicoes
    .filter((aquisicao) => aquisicao.itemId === item.id)
    .sort((esquerda, direita) => direita.data.localeCompare(esquerda.data))
  const ultima = doItem[0]

  if (!ultima) return { elegivel: true, ultimaData: '', liberaEm: '', motivo: '' }
  if (item.intervaloEmMeses === null) {
    return { elegivel: true, ultimaData: ultima.data, liberaEm: '', motivo: '' }
  }

  const liberaEm = somarMeses(ultima.data, item.intervaloEmMeses)
  return {
    elegivel: data >= liberaEm,
    ultimaData: ultima.data,
    liberaEm,
    motivo: data >= liberaEm ? '' : `Adquirido em ${formatarData(ultima.data)}. Libera em ${formatarData(liberaEm)}.`,
  }
}

/** Soma meses a uma chave `AAAA-MM-DD`, sem passar por fuso. */
function somarMeses(data: string, meses: number): string {
  const [ano, mes, dia] = data.split('-').map(Number)
  if (!ano || !mes || !dia) return data
  const totalDeMeses = (ano * 12) + (mes - 1) + meses
  const anoFinal = Math.floor(totalDeMeses / 12)
  const mesFinal = (totalDeMeses % 12) + 1
  // 31 de janeiro + 1 mês cai no último dia de fevereiro, não em 3 de março.
  const ultimoDia = new Date(anoFinal, mesFinal, 0).getDate()
  const diaFinal = Math.min(dia, ultimoDia)
  return `${String(anoFinal).padStart(4, '0')}-${String(mesFinal).padStart(2, '0')}-${String(diaFinal).padStart(2, '0')}`
}

function formatarData(data: string): string {
  const [ano, mes, dia] = data.split('-')
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : data
}

export interface AvaliacaoDaCompra {
  memoria: MemoriaDeCalculo
  elegibilidade: Elegibilidade
  /** Quanto o saldo do ano ainda comporta desta compra. */
  limitadoPeloSaldo: boolean
  coberto: Centavos
  parcelaPessoal: Centavos
  impedimentos: string[]
}

/**
 * Avalia uma compra antes de registrá-la.
 *
 * A compra acima do limite não é recusada — ela acontece, e o excedente é do
 * pastor. Bloquear o registro só faria o gasto existir fora do aplicativo, que
 * é onde ele deixa de ser visível.
 */
export function avaliarCompra(
  item: ItemDoCatalogoLetra,
  valor: Centavos,
  { data, aquisicoes, saldo, contexto }: {
    data: string
    aquisicoes: readonly AquisicaoLetra[]
    saldo: SaldoLetra
    contexto: ContextoDoCalculo
  },
): AvaliacaoDaCompra {
  const memoria = aplicarRegra({
    percentual: 100,
    base: 'VALOR_DA_DESPESA',
    teto: item.limite,
    tetoPercentual: item.limitePercentual,
    tetoBase: item.limiteBase,
    referencia: item.referencia,
  }, { ...contexto, valorDaDespesa: valor })

  const elegibilidade = elegibilidadeDoItem(item, aquisicoes, data)
  const saldoAplicavel = item.ehLivro ? saldo.saldoDeLivros + saldo.saldoDeOutros : saldo.saldoDeOutros
  const coberto = elegibilidade.elegivel ? Math.min(memoria.valor, Math.max(0, saldoAplicavel)) : 0

  const impedimentos: string[] = []
  if (!elegibilidade.elegivel) impedimentos.push(elegibilidade.motivo)
  if (memoria.pendencia) impedimentos.push(memoria.pendencia)
  if (elegibilidade.elegivel && coberto < memoria.valor) impedimentos.push('Saldo do ano não cobre o valor inteiro.')

  return {
    memoria,
    elegibilidade,
    limitadoPeloSaldo: elegibilidade.elegivel && coberto < memoria.valor,
    coberto,
    parcelaPessoal: Math.max(0, valor - coberto),
    impedimentos,
  }
}
