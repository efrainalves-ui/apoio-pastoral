import { PLANNING_AREA_LABELS } from '../evangelism/types'
import { rotuloDoTrimestre } from '../integrated-report/types'
import type { AreaEstrategica, SerieDoIndicador } from '../integrated-report/areasEstrategicas'
import { Card } from './ui/Card'

/**
 * Uma série trimestral, desenhada como barras.
 *
 * Trimestre sem resposta fica com a barra vazia e um traço no lugar do número:
 * uma barra no chão diria que a igreja zerou, e zerar é diferente de não
 * responder. A altura é proporcional ao maior valor da própria série — o que
 * interessa aqui é a forma, e o número exato está escrito ao lado.
 */
function Barras({ serie }: { serie: SerieDoIndicador }) {
  const maior = Math.max(1, ...serie.pontos.map(({ valor }) => valor ?? 0))
  return <div className="serie-trimestral" role="img" aria-label={rotuloAcessivel(serie)}>
    {serie.pontos.map((ponto) => <div className="serie-trimestral__coluna" key={ponto.trimestre}>
      <span className="serie-trimestral__trilho">
        {ponto.valor === null
          ? <span className="serie-trimestral__vazio" />
          : <span className="serie-trimestral__barra" style={{ height: `${Math.round((ponto.valor / maior) * 100)}%` }} />}
      </span>
      <strong>{ponto.valor === null ? '—' : ponto.valor}</strong>
      <small>{ponto.trimestre.split('-')[1]}º tri</small>
    </div>)}
  </div>
}

function rotuloAcessivel(serie: SerieDoIndicador): string {
  const pontos = serie.pontos
    .map(({ trimestre, valor }) => `${rotuloDoTrimestre(trimestre)}: ${valor === null ? 'não informado' : valor}`)
    .join('; ')
  return `${serie.indicador.rotulo}. ${pontos}.`
}

/**
 * O Relatório Integrado visto pelas quatro áreas do planejamento.
 *
 * O relatório é organizado por departamento e o planejamento, por área. Esta
 * tela faz a tradução: o pastor acompanha o distrito por Identidade, Liderança,
 * Novas gerações e Discipulado, e é aí que os números do trimestre precisam
 * aparecer.
 */
export function RelatorioPorArea({ areas }: { areas: readonly AreaEstrategica[] }) {
  const comDados = areas.filter(({ series }) => series.some(({ atual }) => atual !== null))
  if (!comDados.length) return null

  return <>
    {comDados.map(({ area, series }) => <Card
      key={area}
      eyebrow="Relatório Integrado"
      title={PLANNING_AREA_LABELS[area]}
    >
      <div className="areas-do-relatorio">
        {series.filter(({ atual }) => atual !== null).map((serie) => <div className="area-do-relatorio" key={serie.indicador.id}>
          <div className="area-do-relatorio__cabeca">
            <strong>{serie.indicador.rotulo}</strong>
            <small>
              {serie.indicador.tratamento === 'somar' ? 'soma dos trimestres' : 'valor mais recente de cada igreja'}
              {serie.desatualizado && serie.trimestreDoAtual
                ? ` · desatualizado: último dado é do ${rotuloDoTrimestre(serie.trimestreDoAtual)}`
                : ''}
            </small>
          </div>
          <span className="area-do-relatorio__num">{serie.atual}</span>
          <Barras serie={serie} />
        </div>)}
      </div>
    </Card>)}
  </>
}
