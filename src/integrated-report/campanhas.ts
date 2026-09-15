import type { CampaignObjective, EvangelismCampaignEntity } from '../evangelism/types'
import { mesesDoTrimestre } from './metas'
import { numeroDoValor, valorGuardado } from './service'
import type { RelatorioIntegradoEntity } from './types'

/** O indicador que declara quantas campanhas a igreja realizou no trimestre. */
export const CAMPANHAS_NO_RELATORIO = 'evangelismo--numero-de-campanhas-evangelisticas-em-geral'

/** As perguntas do relatório que só existem quando houve Semana Santa. */
export const SEMANA_SANTA_NO_RELATORIO: readonly string[] = [
  'ministerio-pessoal--pontos-de-pregacao-de-semana-santa-igreja-pgs',
  'ministerio-pessoal--total-de-amigos-presentes-na-semana-santa',
]

export interface ConferenciaDeCampanhas {
  churchId: string
  /** Quantas a igreja declarou no Relatório Integrado. */
  declaradas: number
  /** Campanhas já cadastradas que caem dentro daquele trimestre. */
  cadastradas: EvangelismCampaignEntity[]
  /**
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
 * A comparação é por igreja e por período, nunca pelo texto do nome: nome de
 * campanha se repete entre anos e entre igrejas. Campanha criada a partir do
 * relatório conta pela origem, porque nasce sem data.
 */
export function conferirCampanhas(
  relatorios: readonly RelatorioIntegradoEntity[],
  campanhas: readonly EvangelismCampaignEntity[],
  trimestre: string,
): ConferenciaDeCampanhas[] {
  const saida: ConferenciaDeCampanhas[] = []
  for (const relatorio of relatorios) {
    if (relatorio.trimestre !== trimestre) continue
    const declaradas = numeroDoValor(valorGuardado(relatorio, CAMPANHAS_NO_RELATORIO))
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

/** O relatório daquele trimestre traz Semana Santa realizada. */
export function informouSemanaSanta(relatorio: RelatorioIntegradoEntity): boolean {
  return SEMANA_SANTA_NO_RELATORIO.some((id) => (numeroDoValor(valorGuardado(relatorio, id)) ?? 0) > 0)
}

/**
 * O nome de uma campanha que o relatório informou sem dizer como se chamava.
 *
 * "Campanha — Monte Sião" quando é uma; "Campanha 1 — Monte Sião",
 * "Campanha 2 — Monte Sião" quando são várias. Se o relatório traz Semana
 * Santa, a primeira é ela, com o nome dela.
 */
export function nomeDaCampanhaDoRelatorio(igreja: string, indice: number, informadas: number, semanaSanta: boolean): string {
  if (semanaSanta && indice === 1) return 'Semana Santa'
  return informadas > 1 ? `Campanha ${indice} — ${igreja}` : `Campanha — ${igreja}`
}

export const objetivoDoNome = (nome: string): CampaignObjective => nome === 'Semana Santa' ? 'holy_week' : 'other'

/**
 * Campanhas criadas pelo botão antigo, sem nome, e o nome que devem receber.
 *
 * Reprocessa o que já existe em vez de criar outra: o identificador fica, e só
 * nome e objetivo mudam. A que já tem nome não é tocada.
 */
export function campanhasSemNome(
  campanhas: readonly EvangelismCampaignEntity[],
  relatorios: readonly RelatorioIntegradoEntity[],
  nomeDaIgreja: (churchId: string) => string,
): Array<{ id: string; name: string; objective: CampaignObjective }> {
  return campanhas.filter((campanha) => campanha.origemRelatorio && !campanha.name.trim()).map((campanha) => {
    const origem = campanha.origemRelatorio!
    const relatorio = relatorios.find((item) => item.churchId === origem.churchId && item.trimestre === origem.trimestre)
    const informadas = Math.max(numeroDoValor(relatorio ? valorGuardado(relatorio, CAMPANHAS_NO_RELATORIO) : undefined) ?? 0, origem.indice)
    const semanaSanta = Boolean(relatorio && informouSemanaSanta(relatorio))
      && !campanhas.some((outra) => outra.id !== campanha.id && outra.objective === 'holy_week' && outra.churchIds.includes(origem.churchId)
        && (outra.origemRelatorio?.trimestre === origem.trimestre || noTrimestre(outra, origem.trimestre)))
    const name = nomeDaCampanhaDoRelatorio(nomeDaIgreja(origem.churchId), origem.indice, informadas, semanaSanta)
    return { id: campanha.id, name, objective: objetivoDoNome(name) }
  })
}
