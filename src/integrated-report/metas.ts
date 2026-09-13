import type { GoalEntryData, GoalMetric } from '../goals/types'
import { indicadorPorId } from './catalogo'
import { numeroDoValor } from './service'
import { rotuloDoTrimestre, type RelatorioIntegradoEntity } from './types'

/**
 * O que, do Relatório Integrado, alimenta qual meta.
 *
 * A ligação é escrita aqui, uma vez, pelos identificadores estáveis do
 * catálogo e pela métrica do sistema — nunca pelo texto que aparece na tela,
 * que muda de redação sem avisar.
 *
 * Só entra indicador que **acumula**: a meta soma o que aconteceu no ano.
 * Pequenos Grupos, Unidades de Ação, professores e alunos descrevem a situação
 * da igreja naquele trimestre e não somam entre si — eles ficam no Relatório
 * Integrado, onde o valor mais recente é o que vale.
 *
 * Batismo não está aqui e não estará: pertence ao relatório do ACMS.
 */
export interface LigacaoComMeta {
  metric: GoalMetric
  /** Ids do catálogo que somam nesta meta, por igreja e por trimestre. */
  indicadores: readonly string[]
}

export const LIGACOES_COM_METAS: readonly LigacaoComMeta[] = [
  {
    metric: 'bible_studies',
    /*
      Os dois somam, por decisão do pastor em 13/09/2026: ele confirmou que a
      ASA traz gente que não está contada em "todos os métodos missionários".
      Somar sem essa confirmação contaria a mesma pessoa duas vezes.
    */
    indicadores: [
      'ministerio-pessoal--numero-de-pessoas-recebendo-estudos-biblicos',
      'acao-solidaria-adventista--numero-de-pessoas-recebendo-estudos-biblicos-pela-asa',
    ],
  },
]

/** As métricas que este relatório alimenta. É por elas que o reenvio substitui. */
export const METRICAS_DO_RELATORIO: readonly GoalMetric[] = LIGACOES_COM_METAS.map(({ metric }) => metric)

/**
 * Os três meses de um trimestre, e o mês que representa o lançamento.
 *
 * O lançamento precisa de uma data, e o trimestre não tem uma: fica o último
 * mês, que é quando o relatório fecha. Os três meses vão juntos porque é por
 * eles que o reenvio encontra e substitui o que lançou antes — sem isso, enviar
 * o mesmo relatório duas vezes dobraria o progresso da meta.
 */
export function mesesDoTrimestre(trimestre: string): { ano: number; meses: number[]; mesDoLancamento: number } {
  const [ano, numero] = trimestre.split('-').map(Number)
  const primeiro = ((numero ?? 1) - 1) * 3 + 1
  return { ano: ano ?? 0, meses: [primeiro, primeiro + 1, primeiro + 2], mesDoLancamento: primeiro + 2 }
}

export type LancamentoDeMeta = Omit<GoalEntryData, 'createdAt' | 'source'>

/**
 * Os lançamentos que um trimestre gera nas metas, um por igreja.
 *
 * Uma igreja sem nenhum dos indicadores não gera lançamento — e isso não é o
 * mesmo que gerar zero. Zero informado gera lançamento de zero, porque zero é
 * resposta; ausência não gera nada, porque ninguém disse.
 *
 * O que o pastor recusou na conferência não está em `valores` e por isso não
 * chega aqui: valor bloqueado não alimenta meta.
 */
export function lancamentosDoTrimestre(
  relatorios: readonly RelatorioIntegradoEntity[],
  trimestre: string,
): LancamentoDeMeta[] {
  const { ano, mesDoLancamento } = mesesDoTrimestre(trimestre)
  const data = `${ano}-${String(mesDoLancamento).padStart(2, '0')}-01`
  const lancamentos: LancamentoDeMeta[] = []

  for (const relatorio of relatorios) {
    if (relatorio.trimestre !== trimestre) continue
    for (const ligacao of LIGACOES_COM_METAS) {
      const parcelas = ligacao.indicadores
        .map((id) => ({ id, numero: numeroDoValor(relatorio.valores[id]) }))
        .filter((parcela): parcela is { id: string; numero: number } => parcela.numero !== null)
      if (!parcelas.length) continue

      const origem = parcelas
        .map(({ id, numero }) => `${indicadorPorId(id)?.rotulo ?? id}: ${numero}`)
        .join(' · ')
      lancamentos.push({
        churchId: relatorio.churchId,
        metric: ligacao.metric,
        date: data,
        amount: parcelas.reduce((soma, { numero }) => soma + numero, 0),
        reference: `Relatório Integrado · ${rotuloDoTrimestre(trimestre)} · ${relatorio.origem.arquivo} · ${origem}`,
      })
    }
  }
  return lancamentos
}

/** O total do distrito, calculado a partir das igrejas — nunca digitado. */
export function totalDoDistritoNaMeta(lancamentos: readonly LancamentoDeMeta[], metric: GoalMetric): number {
  return lancamentos.filter((item) => item.metric === metric).reduce((soma, item) => soma + item.amount, 0)
}

/**
 * Indicadores que o pastor gostaria de ver em meta e que não têm métrica.
 *
 * Fica escrito para a conferência dizer, em vez de o número sumir em silêncio.
 * Treinamentos ficam só no Relatório Integrado, por decisão dele; campanhas são
 * conferidas contra as campanhas já cadastradas, não viram meta.
 */
export const SEM_METRICA_DE_META: ReadonlyArray<{ id: string; porque: string }> = [
  {
    id: 'ministerio-pessoal--numero-de-treinamentos-encontros-missionarios',
    porque: 'Fica só no Relatório Integrado, por decisão do pastor.',
  },
  {
    id: 'evangelismo--numero-de-campanhas-evangelisticas-em-geral',
    porque: 'Não vira meta: é conferido contra as campanhas de evangelismo já cadastradas.',
  },
]
