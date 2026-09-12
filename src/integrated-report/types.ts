import type { ClasseDaEscolaSabatina } from './catalogo'

/**
 * O valor de um indicador num trimestre.
 *
 * **Ausência não é zero.** O relatório usa "0" para dizer nenhum e "—" para
 * dizer que ninguém informou, e as duas coisas decidem diferente: zero Pequenos
 * Grupos é um problema pastoral, e "não informou" é um problema de secretaria.
 * Por isso o indicador que não veio simplesmente não aparece em `valores` — não
 * existe um zero fingindo ser resposta.
 */
export type ValorDoIndicador =
  | { tipo: 'numero'; valor: number }
  | { tipo: 'sim_nao'; valor: boolean }
  | { tipo: 'por_classe'; classes: Partial<Record<ClasseDaEscolaSabatina, number>>; total: number }
  | { tipo: 'por_sabado'; segundo: number | null; setimo: number | null }

export interface OrigemDoRelatorio {
  /** Nome do arquivo enviado, para conferir contra o papel. */
  arquivo: string
  paginas: number[]
}

/**
 * O Relatório Integrado de uma igreja num trimestre.
 *
 * Um registro por igreja e por trimestre, não um por indicador: são oitenta
 * indicadores, onze igrejas e quatro trimestres, e guardar cada número sozinho
 * encheria a sincronização de milhares de registros para descrever vinte e duas
 * folhas de papel.
 */
export interface RelatorioIntegradoData {
  churchId: string
  /** `AAAA-T`, por exemplo `2026-1`. */
  trimestre: string
  valores: Record<string, ValorDoIndicador>
  origem: OrigemDoRelatorio
  /**
   * Indicadores que o pastor recusou na conferência — um 45 que era 4.
   *
   * Ficam registrados em vez de sumirem: no trimestre seguinte é preciso saber
   * que aquele número foi visto e rejeitado, e não que ninguém o mandou.
   */
  recusados?: string[]
  importBatchId: string
  createdAt: string
  updatedAt: string
}

export interface RelatorioIntegradoEntity extends RelatorioIntegradoData { id: string }

export const trimestreDoTexto = (ano: number, numero: number): string => `${ano}-${numero}`

export function rotuloDoTrimestre(trimestre: string): string {
  const [ano, numero] = trimestre.split('-')
  return `${numero}º trimestre de ${ano}`
}

/** Ordena do mais antigo ao mais recente. */
export function compararTrimestres(esquerda: string, direita: string): number {
  return esquerda.localeCompare(direita, 'en')
}
