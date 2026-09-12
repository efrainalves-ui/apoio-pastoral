import { anoDaLeitura, leituraDoAno } from './leiturasDeFidelidade'
import type { FidelityCategory, FidelitySnapshot } from './types'

/**
 * A fidelidade lida no relatório "Dízimo e Oferta Online".
 *
 * É outra fonte sobre a mesma pergunta, com outra escala. O relatório de
 * Fidelidade cobre doze meses e chama de sistemático quem devolveu de oito a
 * doze vezes. Este cobre o que já correu do ano — oito meses, quando vai de
 * janeiro a agosto — e a mesma exigência, proporcional, cai para seis.
 *
 * A conta é essa: sistemático é quem devolveu em pelo menos dois terços dos
 * meses do período, arredondando para cima. Em doze meses dá oito; em oito dá
 * seis; em seis daria quatro. Fixar "seis" no código faria o relatório de
 * setembro, com nove meses, medir gente com a régua de agosto.
 */
export function minimoParaSistematico(mesesDoPeriodo: number): number {
  return Math.max(1, Math.ceil((mesesDoPeriodo * 2) / 3))
}

export function faixaDoDizimoOnline(meses: number, mesesDoPeriodo: number): FidelityCategory {
  if (meses <= 0) return 'non_tither'
  return meses >= minimoParaSistematico(mesesDoPeriodo) ? 'tither' : 'non_systematic_tither'
}

/** A marca de onde a leitura veio, gravada em `source`. */
export const ORIGEM_DIZIMO_ONLINE = 'Dízimo Online'

export function veioDoDizimoOnline(leitura: Pick<FidelitySnapshot, 'source'> | null | undefined): boolean {
  return Boolean(leitura?.source?.startsWith(ORIGEM_DIZIMO_ONLINE))
}

export interface LeituraDoDizimoOnline {
  /** Meses distintos com dízimo, em `AAAA-MM`. */
  meses: readonly string[]
  mesesDoPeriodo: number
  referenceYear: number
  importedAt: string
  importBatchId: string
}

/**
 * Junta esta leitura com a que a pessoa já tinha no mesmo ano.
 *
 * Quando as duas fontes falam do mesmo ano, os meses se somam — quem devolveu
 * em maio pelo relatório e em julho pelo Dízimo Online devolveu em dois meses,
 * não em um. Dupla contagem não acontece porque o que se soma são meses
 * distintos, não lançamentos.
 *
 * A soma é lida na maior das duas escalas: contar nove meses e classificar na
 * régua de oito diria "sistemático" a quem o relatório de doze meses ainda
 * chamaria de não sistemático.
 *
 * A leitura que já estava lá não é apagada: ela continua no histórico do ano,
 * e é dela que sai o total quando o Dízimo Online não sabe os meses exatos —
 * caso do relatório antigo, que só informa a faixa.
 */
export function somarComOQueJaExiste(
  pessoa: { fidelity: FidelitySnapshot | null; fidelityHistory: readonly FidelitySnapshot[] },
  nova: LeituraDoDizimoOnline,
): FidelitySnapshot {
  const anterior = leituraDoAno(pessoa, nova.referenceYear)
  const mesesAnteriores = anterior && !veioDoDizimoOnline(anterior) ? anterior.months : null
  const mesesDoDizimo = nova.meses.length

  /*
    Sem os meses exatos do outro lado, somar seria inventar. O relatório de
    fidelidade em faixa diz "de 8 a 12" e não diz quais: fica valendo o maior
    dos dois, que é o que se pode afirmar sem chutar.
  */
  const total = mesesAnteriores === null ? mesesDoDizimo : mesesAnteriores + mesesDoDizimo
  const escala = Math.max(nova.mesesDoPeriodo, mesesAnteriores === null ? 0 : 12)
  const mesesFinais = Math.min(total, escala)

  const semMesesExatos = anterior && !veioDoDizimoOnline(anterior) && anterior.months === null
  const categoria = semMesesExatos
    ? maiorFaixa(anterior.category, faixaDoDizimoOnline(mesesDoDizimo, nova.mesesDoPeriodo))
    : faixaDoDizimoOnline(mesesFinais, escala)

  return {
    referenceYear: nova.referenceYear,
    months: semMesesExatos ? null : mesesFinais,
    rangeMin: semMesesExatos ? (anterior?.rangeMin ?? 0) : mesesFinais,
    rangeMax: semMesesExatos ? (anterior?.rangeMax ?? escala) : mesesFinais,
    category: categoria,
    precision: semMesesExatos ? 'range' : 'exact',
    updatedAt: nova.importedAt,
    importedAt: nova.importedAt,
    source: `${ORIGEM_DIZIMO_ONLINE} · ${mesesDoDizimo} de ${nova.mesesDoPeriodo} ${nova.mesesDoPeriodo === 1 ? 'mês' : 'meses'}`,
    importBatchId: nova.importBatchId,
  }
}

const ORDEM: Record<FidelityCategory, number> = { non_tither: 0, non_systematic_tither: 1, tither: 2 }

export function maiorFaixa(esquerda: FidelityCategory, direita: FidelityCategory): FidelityCategory {
  return ORDEM[esquerda] >= ORDEM[direita] ? esquerda : direita
}

/**
 * Quantas vezes a pessoa devolveu pelo Dízimo Online, para a comissão ver.
 *
 * A comissão de nomeação precisa saber de onde veio o número: uma leitura que
 * diz "doador pelo Dízimo Online, 7 de 8 meses" pesa diferente de uma que veio
 * do relatório fechado do ano.
 */
export function vezesNoDizimoOnline(leitura: Pick<FidelitySnapshot, 'source'> | null | undefined): { vezes: number; de: number } | null {
  const casou = leitura?.source?.match(/(\d+) de (\d+)/u)
  return casou ? { vezes: Number(casou[1]), de: Number(casou[2]) } : null
}

/**
 * Como a comissão de nomeação vê de onde veio o número.
 *
 * "Doador pelo Dízimo Online · 7 de 8 meses" pesa diferente de uma leitura
 * fechada do ano: a comissão decide melhor sabendo qual relatório está
 * falando. Devolve nulo quando a leitura veio do relatório de fidelidade, que
 * é o caminho de sempre e não precisa ser anunciado.
 */
export function rotuloDoDizimoOnline(leitura: Pick<FidelitySnapshot, 'source'> | null | undefined): string | null {
  if (!veioDoDizimoOnline(leitura)) return null
  const vezes = vezesNoDizimoOnline(leitura)
  return vezes ? `Doador pelo Dízimo Online · ${vezes.vezes} de ${vezes.de} ${vezes.de === 1 ? 'mês' : 'meses'}` : 'Doador pelo Dízimo Online'
}

export { anoDaLeitura }
