import { Flag } from 'lucide-react'
import { Link } from 'react-router-dom'
import { GOAL_AREAS, GOAL_AREA_SHORT, areaComparison } from '../goals/areas'
import { formatGoalValue } from '../goals/format'
import { useGoalSources } from '../goals/useGoalSources'
import { Card } from './ui/Card'

/** Resumo compacto das quatro metas, com acesso à área completa. */
export function GoalsSummary() {
  const { goals, sources, ready } = useGoalSources()
  const year = new Date().getFullYear()
  if (!ready) return null

  return (
    <Card title="Metas do ano" eyebrow={String(year)} action={<Flag />}>
      <div className="goal-summary">
        {GOAL_AREAS.map((area) => {
          const progresso = areaComparison(area, goals, sources, year)
          return (
            <Link key={area} to={`/app/metas/${area}`} className="goal-summary__item">
              <span className="goal-summary__name">{GOAL_AREA_SHORT[area]}</span>
              <span className="goal-summary__percent">{progresso.target > 0 ? `${progresso.percent}%` : '—'}</span>
              <span className="goal-bar"><span style={{ width: `${progresso.percent}%` }} /></span>
              <small>{formatGoalValue(area, progresso.result)}{progresso.target > 0 ? ` · faltam ${formatGoalValue(area, progresso.missing)}` : ' · meta a definir'}</small>
              {progresso.hasPrevious && <small>{year - 1}: {formatGoalValue(area, progresso.previous)}</small>}
            </Link>
          )
        })}
      </div>
      <Link className="text-link" to="/app/metas">Abrir metas</Link>
    </Card>
  )
}
