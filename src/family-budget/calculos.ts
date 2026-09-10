import { acharSubcategoria } from './catalogo'
import { percentual, somar, type Centavos } from './dinheiro'
import { situacaoVisivel, type Lancamento, type SituacaoDeSaida } from './lancamento'

/**
 * Os números do orçamento, num lugar só.
 *
 * Quando cada tela soma por conta própria, elas divergem — e divergir aqui não
 * é um detalhe visual: é o cartão do mês dizendo que sobrou mil e o relatório
 * dizendo que sobrou oitocentos, sem que ninguém saiba qual está certo. Todo
 * total do módulo sai destas funções.
 *
 * Transferência entre contas não aparece em nenhuma delas, de propósito: ela
 * não é entrada nem saída, e somá-la inflaria receita e despesa ao mesmo tempo.
 */

export const doMes = (lancamentos: readonly Lancamento[], mes: string): Lancamento[] =>
  lancamentos.filter((lancamento) => lancamento.data.slice(0, 7) === mes)

export const daCompetencia = (lancamentos: readonly Lancamento[], mes: string): Lancamento[] =>
  lancamentos.filter((lancamento) => lancamento.competencia === mes)

const entradas = (lancamentos: readonly Lancamento[]) => lancamentos.filter(({ natureza }) => natureza === 'entrada')
const saidas = (lancamentos: readonly Lancamento[]) => lancamentos.filter(({ natureza }) => natureza === 'saida')
const valores = (lancamentos: readonly Lancamento[]) => lancamentos.map(({ valor }) => valor)

export interface ResumoDoMes {
  /** O que já entrou de verdade. */
  recebido: Centavos
  /** O que ainda está previsto para entrar. */
  aReceber: Centavos
  /** O que já saiu. */
  pago: Centavos
  /** O que está pendente e ainda vai sair. */
  comprometido: Centavos
  /** Recebido menos pago: o que aconteceu. */
  saldo: Centavos
  /** Recebido menos o que já saiu e o que ainda vai sair. */
  livre: Centavos
}

export function resumoDoMes(lancamentos: readonly Lancamento[]): ResumoDoMes {
  const recebido = somar(valores(entradas(lancamentos).filter(({ situacao }) => situacao === 'recebida')))
  const aReceber = somar(valores(entradas(lancamentos).filter(({ situacao }) => situacao === 'prevista')))
  const pago = somar(valores(saidas(lancamentos).filter(({ situacao }) => situacao === 'paga')))
  const comprometido = somar(valores(saidas(lancamentos).filter(({ situacao }) => situacao === 'pendente')))
  return { recebido, aReceber, pago, comprometido, saldo: recebido - pago, livre: recebido - pago - comprometido }
}

/** Quanto cada pessoa trouxe para casa. `null` é o que é da família. */
export function rendaPorIntegrante(lancamentos: readonly Lancamento[]): Map<string | null, Centavos> {
  const mapa = new Map<string | null, Centavos>()
  for (const entrada of entradas(lancamentos).filter(({ situacao }) => situacao === 'recebida')) {
    const chave = entrada.integranteId
    mapa.set(chave, (mapa.get(chave) ?? 0) + entrada.valor)
  }
  return mapa
}

export interface FatiaDaCategoria {
  categoria: string
  nome: string
  valor: Centavos
  percentual: number
}

/** Para onde o dinheiro foi, por categoria, da maior para a menor. */
export function paraOndeFoi(lancamentos: readonly Lancamento[]): FatiaDaCategoria[] {
  const pagas = saidas(lancamentos).filter(({ situacao }) => situacao === 'paga')
  const total = somar(valores(pagas))
  const porCategoria = new Map<string, { nome: string; valor: Centavos }>()
  for (const saida of pagas) {
    const achado = acharSubcategoria(saida.subcategoria)
    const codigo = achado?.categoria.codigo ?? 'outros'
    const nome = achado?.categoria.nome ?? 'Outros'
    const atual = porCategoria.get(codigo) ?? { nome, valor: 0 }
    porCategoria.set(codigo, { nome, valor: atual.valor + saida.valor })
  }
  return [...porCategoria.entries()]
    .map(([categoria, { nome, valor }]) => ({ categoria, nome, valor, percentual: percentual(valor, total) }))
    .sort((esquerda, direita) => direita.valor - esquerda.valor)
}

export interface FixasEVariaveis {
  fixas: Centavos
  variaveis: Centavos
  percentualFixas: number
}

export function fixasEVariaveis(lancamentos: readonly Lancamento[]): FixasEVariaveis {
  const pagas = saidas(lancamentos).filter(({ situacao }) => situacao === 'paga')
  const fixas = somar(valores(pagas.filter(({ tipo }) => tipo === 'fixa')))
  const variaveis = somar(valores(pagas.filter(({ tipo }) => tipo === 'variavel')))
  return { fixas, variaveis, percentualFixas: percentual(fixas, fixas + variaveis) }
}

/**
 * Taxa de economia: quanto do que entrou sobrou.
 *
 * Mês sem entrada nenhuma devolve zero, e não uma divisão por zero disfarçada
 * de menos infinito.
 */
export function taxaDeEconomia(resumo: ResumoDoMes): number {
  if (resumo.recebido <= 0) return 0
  return percentual(resumo.recebido - resumo.pago, resumo.recebido)
}

export interface Vencimento {
  lancamento: Lancamento
  situacao: 'pendente' | 'atrasada'
  /** Dias até vencer. Negativo quando já venceu. */
  dias: number
}

/** O que ainda vai vencer e o que já venceu, do mais urgente ao menos. */
export function vencimentos(lancamentos: readonly Lancamento[], hoje: string): Vencimento[] {
  const emAberto = saidas(lancamentos).filter(({ situacao }) => situacao === 'pendente')
  const referencia = new Date(`${hoje}T12:00:00`).getTime()
  return emAberto
    .filter(({ vencimento }) => Boolean(vencimento))
    .map((lancamento) => {
      const quando = new Date(`${lancamento.vencimento}T12:00:00`).getTime()
      const dias = Math.round((quando - referencia) / 86_400_000)
      return {
        lancamento,
        situacao: situacaoVisivel(lancamento.situacao as SituacaoDeSaida, lancamento.vencimento, hoje) === 'atrasada' ? 'atrasada' as const : 'pendente' as const,
        dias,
      }
    })
    .sort((esquerda, direita) => esquerda.dias - direita.dias)
}

export interface PlanejadoVersusRealizado {
  categoria: string
  nome: string
  planejado: Centavos
  realizado: Centavos
  /** Quanto do planejado já foi usado. Passa de cem quando estoura. */
  percentual: number
}

export function planejadoVersusRealizado(
  lancamentos: readonly Lancamento[],
  planejado: Readonly<Record<string, Centavos>>,
): PlanejadoVersusRealizado[] {
  const realizado = new Map(paraOndeFoi(lancamentos).map((fatia) => [fatia.categoria, fatia]))
  const categorias = new Set([...Object.keys(planejado), ...realizado.keys()])
  return [...categorias]
    .map((categoria) => {
      const fatia = realizado.get(categoria)
      const valorPlanejado = planejado[categoria] ?? 0
      const valorRealizado = fatia?.valor ?? 0
      return {
        categoria,
        nome: fatia?.nome ?? categoria,
        planejado: valorPlanejado,
        realizado: valorRealizado,
        percentual: percentual(valorRealizado, valorPlanejado),
      }
    })
    .sort((esquerda, direita) => direita.realizado - esquerda.realizado)
}

export interface ProgressoDaMeta {
  objetivo: Centavos
  guardado: Centavos
  falta: Centavos
  percentual: number
  /** Meses até o prazo, contando o mês corrente. Nulo quando não há prazo. */
  mesesRestantes: number | null
  /** Quanto precisa guardar por mês para chegar no prazo. */
  porMes: Centavos | null
}

export function progressoDaMeta(
  objetivo: Centavos,
  guardado: Centavos,
  prazo: string | null,
  hoje: string,
): ProgressoDaMeta {
  const falta = Math.max(0, objetivo - guardado)
  const mesesRestantes = prazo ? mesesEntre(hoje.slice(0, 7), prazo.slice(0, 7)) : null
  const porMes = mesesRestantes !== null && mesesRestantes > 0 ? Math.ceil(falta / mesesRestantes) : null
  return { objetivo, guardado, falta, percentual: percentual(guardado, objetivo), mesesRestantes, porMes }
}

/** Meses de um `AAAA-MM` a outro. Negativo quando o prazo já passou. */
export function mesesEntre(de: string, ate: string): number {
  const [anoDe, mesDe] = de.split('-').map(Number)
  const [anoAte, mesAte] = ate.split('-').map(Number)
  if (!anoDe || !mesDe || !anoAte || !mesAte) return 0
  return (anoAte - anoDe) * 12 + (mesAte - mesDe)
}

export interface ParcelasDaSerie {
  total: number
  pagas: number
  restantes: number
  valorDaParcela: Centavos
  /** O que ainda falta pagar da compra. */
  saldo: Centavos
}

/**
 * O andamento de uma compra parcelada.
 *
 * Precisa aguentar a dívida que começou antes do aplicativo: quem tem 11 de 24
 * parcelas restantes não pode ser obrigado a cadastrar as 13 primeiras só para
 * o número bater.
 */
export function parcelasDaSerie(parcelas: readonly Lancamento[]): ParcelasDaSerie | null {
  const comParcelamento = parcelas.filter(({ parcelamento }) => parcelamento)
  const primeira = comParcelamento[0]
  if (!primeira?.parcelamento) return null
  const pagas = comParcelamento.filter(({ situacao }) => situacao === 'paga').length
  const total = primeira.parcelamento.total
  const restantes = Math.max(0, total - pagas)
  return { total, pagas, restantes, valorDaParcela: primeira.valor, saldo: primeira.valor * restantes }
}
