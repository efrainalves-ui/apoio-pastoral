import { normalizePdfChurchName } from '../imports/parsers'
import { parseComparativoDeEntradas, parseMovimentoDeBatismos, totalDeEntradas } from '../imports/acmsRelatorios'
import type { GoalImportPreview } from './types'

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

/** Batismos por igreja e mês, a partir da Análise de Movimentos. */
export function previaDeBatismos(texto: string, hash: string, igrejas: readonly IgrejaCadastrada[]): GoalImportPreview {
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

  return { hash, entries, errors }
}

export interface PreviaFinanceira extends GoalImportPreview {
  anoAtual: number
  anoAnterior: number
  /** Dízimos e ofertas do ano anterior, somados, para a comparação. */
  totalDoAnoAnterior: number
}

/** Dízimos e ofertas por igreja e mês, a partir do Comparativo de Entradas. */
export function previaFinanceira(texto: string, hash: string, igrejas: readonly IgrejaCadastrada[]): PreviaFinanceira {
  const lido = parseComparativoDeEntradas(texto)
  const entries: GoalImportPreview['entries'] = []
  const errors: string[] = []
  let totalDoAnoAnterior = 0

  for (const igreja of lido.igrejas) {
    const cadastrada = acharIgreja(igreja.nome, igrejas)
    if (!cadastrada) { errors.push(avisoDeIgrejaAusente(igreja.nome)); continue }
    totalDoAnoAnterior += totalDeEntradas(igreja.meses, 'anterior')
    for (const mes of igreja.meses) {
      const valor = mes.dizimoAtual + mes.ofertaAtual
      if (valor <= 0) continue
      entries.push({
        churchId: cadastrada.id,
        metric: 'tithes_offerings',
        date: mesIso(lido.anoAtual, mes.mes),
        amount: valor,
        reference: `Comparativo de Entradas ${lido.anoAtual}`,
      })
    }
  }

  return { hash, entries, errors, anoAtual: lido.anoAtual, anoAnterior: lido.anoAnterior, totalDoAnoAnterior }
}
