import { normalizePdfChurchName } from '../imports/parsers'
import { parseComparativoDeEntradas, parseMovimentoDeBatismos } from '../imports/acmsRelatorios'
import type { GoalImportPreview, GoalMetric } from './types'

export interface IgrejaCadastrada { id: string; name: string }

function chave(nome: string): string {
  return normalizePdfChurchName(nome).normalize('NFD').replace(/[̀-ͯ]/gu, '').toLowerCase().replace(/\s+/gu, ' ').trim()
}

/**
 * A igreja do relatório é a igreja do cadastro?
 *
 * O ACMS escreve "Central de Curuçá I - Sede Anpa"; o cadastro guarda "Central
 * de Curuçá I". Cortar no primeiro travessão e comparar sem acento nem caixa é
 * o que faz as duas se encontrarem — e é a mesma regra que a importação da
 * lista de membros já usa, para não haver dois entendimentos de nome no mesmo
 * aplicativo.
 */
export function acharIgreja(nomeDoRelatorio: string, igrejas: readonly IgrejaCadastrada[]): IgrejaCadastrada | undefined {
  const procurada = chave(nomeDoRelatorio)
  return igrejas.find((igreja) => chave(igreja.name) === procurada)
    ?? igrejas.find((igreja) => chave(igreja.name).startsWith(procurada) || procurada.startsWith(chave(igreja.name)))
}

function mesIso(ano: number, mes: number): string {
  return `${ano}-${String(mes).padStart(2, '0')}-01`
}

/**
 * Igreja do relatório que não existe no cadastro vira aviso, não silêncio.
 *
 * Descartar sem dizer nada faria o total do distrito ficar menor do que o do
 * ACMS sem ninguém entender por quê — e o pastor confiaria no número errado.
 */
function avisoDeIgrejaAusente(nome: string): string {
  return `“${normalizePdfChurchName(nome)}” está no relatório e não está cadastrada no distrito. Os números dela ficaram de fora.`
}

export interface PeriodoDoRelatorio { ano: number; meses: number[] }

export interface PreviaDeRelatorio extends GoalImportPreview {
  /**
   * Os períodos que este relatório cobre — um por ano.
   *
   * É o que permite substituir em vez de somar: o relatório é a verdade sobre o
   * que ele traz, e nada diz sobre os meses que ainda não chegaram. São vários
   * porque o Comparativo de Entradas traz dois anos no mesmo arquivo.
   */
  periodos: PeriodoDoRelatorio[]
  /** As métricas que este relatório substitui no período que cobre. */
  metricas: GoalMetric[]
}

/** Batismos por igreja e mês, a partir da Análise de Movimentos. */
export function previaDeBatismos(texto: string, hash: string, igrejas: readonly IgrejaCadastrada[]): PreviaDeRelatorio {
  const lido = parseMovimentoDeBatismos(texto)
  const entries: GoalImportPreview['entries'] = []
  const errors: string[] = []

  for (const igreja of lido.igrejas) {
    const cadastrada = acharIgreja(igreja.nome, igrejas)
    if (!cadastrada) { errors.push(avisoDeIgrejaAusente(igreja.nome)); continue }
    igreja.meses.forEach((quantidade, indice) => {
      // Mês sem batismo não vira lançamento: zero não é informação nova, e
      // encheria a conferência de linhas que não dizem nada.
      if (quantidade <= 0) return
      entries.push({
        churchId: cadastrada.id,
        metric: 'baptisms',
        date: mesIso(lido.ano, indice + 1),
        amount: quantidade,
        reference: `Análise de Movimentos ${lido.ano}`,
      })
    })
  }

  return {
    hash,
    entries,
    errors,
    // O cabeçalho diz "Até ao mês: 9/2026": é ele quem define o período
    // coberto, e não os meses que por acaso tiveram batismo.
    periodos: [{ ano: lido.ano, meses: Array.from({ length: lido.ateOMes }, (_, indice) => indice + 1) }],
    metricas: ['baptisms'],
  }
}

export interface PreviaFinanceira extends PreviaDeRelatorio {
  anoAtual: number
  anoAnterior: number
  /** O ano anterior fechado, por categoria, para a comparação. */
  totaisDoAnoAnterior: { tithes: number; offerings: number }
}

/** Dízimos e ofertas por igreja e mês, a partir do Comparativo de Entradas. */
export function previaFinanceira(texto: string, hash: string, igrejas: readonly IgrejaCadastrada[]): PreviaFinanceira {
  const lido = parseComparativoDeEntradas(texto)
  const entries: GoalImportPreview['entries'] = []
  const errors: string[] = []
  const totaisDoAnoAnterior = { tithes: 0, offerings: 0 }

  for (const igreja of lido.igrejas) {
    const cadastrada = acharIgreja(igreja.nome, igrejas)
    if (!cadastrada) { errors.push(avisoDeIgrejaAusente(igreja.nome)); continue }
    for (const mes of igreja.meses) {
      totaisDoAnoAnterior.tithes += mes.dizimoAnterior
      totaisDoAnoAnterior.offerings += mes.ofertaAnterior
      // O relatório traz duas colunas e dois anos. Somar dízimo com oferta
      // produzia um número que não existe em relatório nenhum e escondia qual
      // dos dois caiu; guardar só o ano corrente apagava a outra metade do
      // arquivo, e era ela que fazia a comparação existir.
      for (const [ano, metric, valor] of [
        [lido.anoAnterior, 'tithes', mes.dizimoAnterior],
        [lido.anoAnterior, 'offerings', mes.ofertaAnterior],
        [lido.anoAtual, 'tithes', mes.dizimoAtual],
        [lido.anoAtual, 'offerings', mes.ofertaAtual],
      ] as const) {
        if (valor <= 0) continue
        entries.push({
          churchId: cadastrada.id,
          metric,
          date: mesIso(ano, mes.mes),
          amount: valor,
          reference: `Comparativo de Entradas ${lido.anoAtual}`,
        })
      }
    }
  }

  // Aqui o período vem dos meses que aparecem no relatório, que é como ele diz
  // até onde vai — e vale para os dois anos, porque o arquivo traz os dois.
  const meses = [...new Set(lido.igrejas.flatMap((igreja) => igreja.meses.map(({ mes }) => mes)))].sort((esquerda, direita) => esquerda - direita)
  return {
    hash,
    entries,
    errors,
    periodos: [{ ano: lido.anoAnterior, meses }, { ano: lido.anoAtual, meses }],
    // O desenho antigo entra junto para ser apagado: as entradas somadas do
    // período coberto sairiam duplicando o total ao lado das novas.
    metricas: ['tithes', 'offerings', 'tithes_offerings'],
    anoAtual: lido.anoAtual,
    anoAnterior: lido.anoAnterior,
    totaisDoAnoAnterior,
  }
}
