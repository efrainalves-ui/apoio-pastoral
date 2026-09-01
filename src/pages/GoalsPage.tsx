import { Flag } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Card } from '../components/ui/Card'
import { GOAL_AREAS, GOAL_AREA_LABELS, areaProgress } from '../goals/areas'
import { useGoalSources } from '../goals/useGoalSources'
import { formatGoalValue } from '../goals/format'

export function GoalsPage() {
  const { goals, sources, ready } = useGoalSources()
  const year = new Date().getFullYear()

  if (!ready) return <div className="app-loading" role="status">Abrindo as metas…</div>

  return (
    <div className="page-stack">
      <header className="page-hero">
        <div><p className="eyebrow">{year}</p><h1>Metas</h1><p>Acompanhe o ano do distrito em quatro frentes.</p></div>
        <Flag />
      </header>
      <div className="goal-cards">
        {GOAL_AREAS.map((area) => {
          const progresso = areaProgress(area, goals, sources, year)
          return (
            <Card key={area} title={GOAL_AREA_LABELS[area]}>
              <div className="goal-card">
                <div className="goal-card__numbers">
                  <div><small>Meta anual</small><strong>{progresso.target > 0 ? formatGoalValue(area, progresso.target) : 'A definir'}</strong></div>
                  <div><small>Resultado</small><strong>{formatGoalValue(area, progresso.result)}</strong></div>
                  <div><small>Falta</small><strong>{progresso.target > 0 ? formatGoalValue(area, progresso.missing) : '—'}</strong></div>
                </div>
                <div className="goal-bar" role="img" aria-label={`${progresso.percent}% da meta`}><span style={{ width: `${progresso.percent}%` }} /></div>
                <p className="goal-card__percent">{progresso.target > 0 ? `${progresso.percent}% alcançado` : 'Defina a meta do ano para acompanhar'}</p>
                <Link className="button button--secondary" to={`/app/metas/${area}`}>Acompanhar</Link>
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
