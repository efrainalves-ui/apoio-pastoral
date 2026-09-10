import { paraOndeFoi, resumoDoMes } from './calculos'
import { percentual, type Centavos } from './dinheiro'
import type { Lancamento } from './lancamento'

/**
 * O que mudou de um mês para o outro.
 *
 * Um insight só existe quando há com o que comparar. Mês sem mês anterior não
 * gera nenhum — dizer "alimentação subiu 100%" porque no mês passado não havia
 * nada é ruído com cara de informação, e ensina o pastor a ignorar a seção.
 */

export interface Insight {
  chave: string
  texto: string
  /** Para cima, para baixo, ou nem um nem outro. */
  direcao: 'subiu' | 'caiu' | 'neutro'
}

export interface ComparacaoDeMeses {
  entradas: { atual: Centavos; anterior: Centavos; variacao: number | null }
  saidas: { atual: Centavos; anterior: Centavos; variacao: number | null }
  economia: { atual: Centavos; anterior: Centavos; variacao: number | null }
}

/** Variação percentual entre dois valores. Nula quando não havia base. */
export function variacao(anterior: Centavos, atual: Centavos): number | null {
  if (anterior === 0) return null
  return Math.round(((atual - anterior) / Math.abs(anterior)) * 1000) / 10
}

export function compararMeses(atuais: readonly Lancamento[], anteriores: readonly Lancamento[]): ComparacaoDeMeses {
  const agora = resumoDoMes(atuais)
  const antes = resumoDoMes(anteriores)
  return {
    entradas: { atual: agora.recebido, anterior: antes.recebido, variacao: variacao(antes.recebido, agora.recebido) },
    saidas: { atual: agora.pago, anterior: antes.pago, variacao: variacao(antes.pago, agora.pago) },
    economia: { atual: agora.saldo, anterior: antes.saldo, variacao: variacao(antes.saldo, agora.saldo) },
  }
}

const formatoCurto = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

/**
 * Os insights do mês.
 *
 * Só entram mudanças que valem uma frase: variação de menos de cinco por cento
 * é oscilação normal de uma casa, e enchê-la de avisos faz o que importa
 * desaparecer no meio.
 */
export function insightsDoMes(atuais: readonly Lancamento[], anteriores: readonly Lancamento[]): Insight[] {
  if (!anteriores.length) return []

  const insights: Insight[] = []
  const comparacao = compararMeses(atuais, anteriores)

  if (comparacao.saidas.variacao !== null && Math.abs(comparacao.saidas.variacao) >= 5) {
    const diferenca = Math.abs(comparacao.saidas.atual - comparacao.saidas.anterior)
    const subiu = comparacao.saidas.atual > comparacao.saidas.anterior
    insights.push({
      chave: 'saidas',
      direcao: subiu ? 'subiu' : 'caiu',
      texto: `As despesas ${subiu ? 'subiram' : 'caíram'} ${formatoCurto.format(diferenca / 100)} em relação ao mês passado.`,
    })
  }

  const categoriasAtuais = new Map(paraOndeFoi(atuais).map((fatia) => [fatia.categoria, fatia]))
  const categoriasAnteriores = new Map(paraOndeFoi(anteriores).map((fatia) => [fatia.categoria, fatia]))

  const mudancas = [...categoriasAtuais.values()]
    .map((fatia) => ({ fatia, variacao: variacao(categoriasAnteriores.get(fatia.categoria)?.valor ?? 0, fatia.valor) }))
    .filter((item): item is { fatia: typeof item.fatia; variacao: number } => item.variacao !== null && Math.abs(item.variacao) >= 5)
    .sort((esquerda, direita) => Math.abs(direita.variacao) - Math.abs(esquerda.variacao))

  for (const { fatia, variacao: mudanca } of mudancas.slice(0, 3)) {
    insights.push({
      chave: fatia.categoria,
      direcao: mudanca > 0 ? 'subiu' : 'caiu',
      texto: `${fatia.nome} ${mudanca > 0 ? 'subiu' : 'caiu'} ${Math.abs(mudanca).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% em relação ao mês passado.`,
    })
  }

  return insights
}

export interface AlertaDoOrcamento {
  chave: string
  texto: string
  grave: boolean
}

/**
 * Os avisos do orçamento.
 *
 * Estourar o planejado é grave; chegar perto ainda dá para corrigir. A
 * diferença entre os dois é o que decide se o aviso interrompe ou apenas
 * informa.
 */
export function alertasDoOrcamento(
  lancamentos: readonly Lancamento[],
  planejado: Readonly<Record<string, Centavos>>,
): AlertaDoOrcamento[] {
  const gastos = new Map(paraOndeFoi(lancamentos).map((fatia) => [fatia.categoria, fatia]))
  const alertas: AlertaDoOrcamento[] = []

  for (const [categoria, limite] of Object.entries(planejado)) {
    if (limite <= 0) continue
    const fatia = gastos.get(categoria)
    if (!fatia) continue
    const usado = percentual(fatia.valor, limite)
    if (usado > 100) {
      alertas.push({ chave: categoria, grave: true, texto: `${fatia.nome} passou do planejado: ${usado.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}% do orçamento.` })
    } else if (usado >= 80) {
      alertas.push({ chave: categoria, grave: false, texto: `${fatia.nome} já usou ${usado.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}% do planejado.` })
    }
  }

  return alertas.sort((esquerda, direita) => Number(direita.grave) - Number(esquerda.grave))
}

export interface PontoDaEvolucao {
  mes: string
  entradas: Centavos
  saidas: Centavos
  economia: Centavos
}

/** A evolução mês a mês, para o gráfico de linhas. */
export function evolucao(lancamentos: readonly Lancamento[], meses: readonly string[]): PontoDaEvolucao[] {
  return meses.map((mes) => {
    const doMes = lancamentos.filter((item) => item.data.slice(0, 7) === mes)
    const resumo = resumoDoMes(doMes)
    return { mes, entradas: resumo.recebido, saidas: resumo.pago, economia: resumo.saldo }
  })
}

/** Os últimos `quantidade` meses, terminando no mês dado. */
export function ultimosMeses(mes: string, quantidade: number): string[] {
  const [ano, numero] = mes.split('-').map(Number)
  if (!ano || !numero) return []
  return Array.from({ length: quantidade }, (_, indice) => {
    const data = new Date(ano, numero - 1 - (quantidade - 1 - indice), 1)
    return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`
  })
}
