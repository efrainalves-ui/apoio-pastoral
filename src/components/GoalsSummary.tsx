import { Flag } from 'lucide-react'
import { Link } from 'react-router-dom'
import { GOAL_AREAS, GOAL_AREA_SHORT, PERCENT_TARGET_AREAS, areaComparison, crescimentoDaMeta } from '../goals/areas'
import { formatGoalValue } from '../goals/format'
import { useGoalSources } from '../goals/useGoalSources'
import { useQuadroDeGrupos } from '../missionary/useQuadroDeGrupos'
import { Card } from './ui/Card'

/** Resumo compacto das metas do ano, com acesso à área completa. */
export function GoalsSummary() {
  const { goals, sources, ready } = useGoalSources()
  const { quadro } = useQuadroDeGrupos()
  const year = new Date().getFullYear()
  if (!ready) return null

  return (
    <Card title="Metas do ano" eyebrow={String(year)} action={<Link className="icon-button" to="/app/metas" aria-label="Abrir metas"><Flag /></Link>}>
      <div className="goal-summary">
        {GOAL_AREAS.map((area) => {
          const progresso = areaComparison(area, goals, sources, year)
          // Onde a meta é de crescimento, o resumo mostra o crescimento.
          const crescimento = PERCENT_TARGET_AREAS.includes(area) ? crescimentoDaMeta(area, goals, sources, year) : null
          const ponto = (valor: number) => `${valor >= 0 ? '+' : '−'}${Math.abs(valor).toFixed(1).replace('.', ',')}%`
          return (
            <Link key={area} to={`/app/metas/${area}`} className="goal-summary__item">
              <span className="goal-summary__name">{GOAL_AREA_SHORT[area]}</span>
              <span className="goal-summary__percent">{crescimento
                ? (crescimento.alcancado === null ? '—' : ponto(crescimento.alcancado))
                : progresso.target > 0 ? `${progresso.percent}%` : '—'}</span>
              <span className="goal-bar"><span style={{ width: `${crescimento ? crescimento.percentDaMeta : progresso.percent}%` }} /></span>
              <small>{crescimento
                ? (crescimento.alvo > 0 ? `alvo +${crescimento.alvo}% · faltam ${crescimento.falta.toFixed(1).replace('.', ',')} p.p.` : 'alvo a definir')
                : `${formatGoalValue(area, progresso.result)}${progresso.target > 0 ? ` · faltam ${formatGoalValue(area, progresso.missing)}` : ' · meta a definir'}`}</small>
            </Link>
          )
        })}
        <Link to="/app/metas/uapg" className="goal-summary__item">
          <span className="goal-summary__name">Escola Sabatina</span>
          <span className="goal-summary__percent">{quadro.distrito.meta > 0 ? `${Math.min(100, Math.round((quadro.distrito.escolaSabatina / quadro.distrito.meta) * 100))}%` : '—'}</span>
          <span className="goal-bar"><span style={{ width: `${quadro.distrito.meta > 0 ? Math.min(100, Math.round((quadro.distrito.escolaSabatina / quadro.distrito.meta) * 100)) : 0}%` }} /></span>
          <small>{quadro.distrito.escolaSabatina} unidade(s) · {quadro.distrito.pequenosGrupos} PG · meta {quadro.distrito.meta}</small>
        </Link>
      </div>
    </Card>
  )
}
