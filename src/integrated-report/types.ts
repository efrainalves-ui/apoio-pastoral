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
   * Legado: indicadores recusados na conferência antiga, que não existe mais.
   *
   * O número recusado não foi guardado, então não há o que restaurar; o campo
   * fica só para não apagar o registro de que houve recusa.
   */
  recusados?: string[]
  /**
   * Legado: valores que esperavam confirmação na conferência antiga.
   *
   * São o que a igreja escreveu e valem como tal: `aceitarValoresGuardados`
   * os leva para `valores`, e a leitura já os considera antes disso.
   */
  pendentes?: Record<string, ValorDoIndicador>
  /** Legado: diferenças para o cadastro marcadas como conferidas. Não são mais usadas. */
  conferencias?: Record<string, { relatorio: number; cadastro: number; em: string }>
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
