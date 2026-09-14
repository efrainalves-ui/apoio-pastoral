import type { EvangelismCampaignEntity } from '../evangelism/types'
import { mesesDoTrimestre } from './metas'
import { numeroDoValor } from './service'
import type { RelatorioIntegradoEntity } from './types'

/** O indicador que declara quantas campanhas a igreja realizou no trimestre. */
export const CAMPANHAS_NO_RELATORIO = 'evangelismo--numero-de-campanhas-evangelisticas-em-geral'

export interface ConferenciaDeCampanhas {
  churchId: string
  /** Quantas a igreja declarou no Relatório Integrado. */
  declaradas: number
  /** Campanhas já cadastradas que caem dentro daquele trimestre. */
  cadastradas: EvangelismCampaignEntity[]
  /**
   * O que precisa de olho humano.
   *
   * `faltam_cadastrar`: a igreja declarou mais do que existe cadastrado.
   * `sobram_cadastradas`: existe mais cadastrado do que ela declarou.
   * `confere`: os números batem — o que não prova que são as mesmas campanhas.
   */
  situacao: 'confere' | 'faltam_cadastrar' | 'sobram_cadastradas'
}

/**
 * Uma campanha pertence àquele trimestre?
 *
 * Pela data, não pelo nome. Dois avivamentos chamados "Semana Santa" em igrejas
 * e anos diferentes são campanhas diferentes, e duas grafias do mesmo nome são
 * a mesma. O período da campanha basta encostar no trimestre: uma que começa em
 * março e termina em abril aconteceu nos dois.
 */
export function noTrimestre(campanha: EvangelismCampaignEntity, trimestre: string): boolean {
  const { ano, meses } = mesesDoTrimestre(trimestre)
  const primeiro = `${ano}-${String(meses[0]).padStart(2, '0')}-01`
  const ultimo = `${ano}-${String(meses[2]).padStart(2, '0')}-31`
  const inicio = campanha.startDate || campanha.endDate
  const fim = campanha.endDate || campanha.startDate
  if (!inicio || !fim) return false
  return inicio <= ultimo && fim >= primeiro
}

/**
 * Compara o que a igreja declarou com o que está cadastrado — e não decide nada.
 *
 * O pastor pediu que o relatório não crie campanha nem meta: ele quer saber se
 * já existe campanha cadastrada para aquela igreja naquele trimestre. Por isso
 * aqui não se une, não se apaga e não se cria. Quando os números não batem, a
 * diferença aparece para ele olhar.
 *
 * A comparação é por igreja e por período, nunca pelo texto do nome: nome de
 * campanha se repete entre anos e entre igrejas, e deduplicar por ele juntaria
 * coisas diferentes ou separaria coisas iguais.
 */
export function conferirCampanhas(
  relatorios: readonly RelatorioIntegradoEntity[],
  campanhas: readonly EvangelismCampaignEntity[],
  trimestre: string,
): ConferenciaDeCampanhas[] {
  const saida: ConferenciaDeCampanhas[] = []
  for (const relatorio of relatorios) {
    if (relatorio.trimestre !== trimestre) continue
    const declaradas = numeroDoValor(relatorio.valores[CAMPANHAS_NO_RELATORIO])
    if (declaradas === null) continue

    const cadastradas = campanhas.filter((campanha) =>
      campanha.churchIds.includes(relatorio.churchId)
      && campanha.status !== 'cancelled'
      && (noTrimestre(campanha, trimestre)
        || (campanha.origemRelatorio?.churchId === relatorio.churchId && campanha.origemRelatorio.trimestre === trimestre)))

    saida.push({
      churchId: relatorio.churchId,
      declaradas,
      cadastradas,
      situacao: cadastradas.length === declaradas ? 'confere'
        : cadastradas.length < declaradas ? 'faltam_cadastrar'
          : 'sobram_cadastradas',
    })
  }
  return saida
}

/** Quantas linhas precisam de conferência humana. */
export function contarDivergencias(conferencia: readonly ConferenciaDeCampanhas[]): number {
  return conferencia.filter(({ situacao }) => situacao !== 'confere').length
}
