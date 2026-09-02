import { BookHeart, FileText, Flag, UsersRound } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Card } from '../components/ui/Card'
import { GOAL_AREAS, GOAL_AREA_LABELS, areaComparison } from '../goals/areas'
import { useGoalSources } from '../goals/useGoalSources'
import { useAuthVault } from '../auth/AuthVaultContext'
import { MissionaryService } from '../missionary/service'
import { Button } from '../components/ui/Button'
import { goalsReportLines } from '../reports/areaReports'
import { previewLocalPdf } from '../reports/localPdf'
import { formatGoalValue } from '../goals/format'

const missionary = new MissionaryService()

export function GoalsPage() {
  const { account, masterKey } = useAuthVault()
  const { goals, sources, ready } = useGoalSources()
  const year = new Date().getFullYear()

  async function relatorio() {
    if (!account || !masterKey) return
    const [interests, studies, pairs, classes, smallGroups, uapgs] = await Promise.all([
      missionary.listInterests(account.id, masterKey),
      missionary.listStudies(account.id, masterKey),
      missionary.listPairs(account.id, masterKey),
      missionary.listClasses(account.id, masterKey),
      missionary.listSmallGroups(account.id, masterKey),
      missionary.listUapgs(account.id, masterKey),
    ])
    previewLocalPdf('Metas e Indicadores', goalsReportLines(
      year,
      GOAL_AREAS.map((area) => { const progresso = areaComparison(area, goals, sources, year); return { area, target: progresso.target, result: progresso.result, percent: progresso.percent } }),
      { interests: interests.length, studies: studies.length, pairs: pairs.filter(({ active }) => active).length, classes: classes.length, groups: smallGroups.filter(({ active }) => active).length, uapgs: uapgs.filter(({ active }) => active).length },
    ))
  }

  if (!ready) return <div className="app-loading" role="status">Abrindo as metas…</div>

  return (
    <div className="page-stack">
      <header className="page-hero">
        <div><p className="eyebrow">{year}</p><h1>Metas</h1></div>
        <div className="page-actions"><Button variant="secondary" icon={<FileText />} onClick={() => void relatorio()}>Relatório</Button><Flag /></div>
      </header>
      <div className="goal-cards">
        {GOAL_AREAS.map((area) => {
          const progresso = areaComparison(area, goals, sources, year)
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
                {progresso.hasPrevious && <p className="goal-card__percent">{year - 1}: {formatGoalValue(area, progresso.previous)} · {progresso.difference >= 0 ? '+' : '−'}{formatGoalValue(area, Math.abs(progresso.difference))} neste ano</p>}
                <Link className="button button--secondary" to={`/app/metas/${area}`}>Acompanhar</Link>
              </div>
            </Card>
          )
        })}
      </div>

      <Card title="Missão e discipulado">
        <div className="entity-list">
          <Link className="entity-row entity-row--link" to="/app/metas/missao/estudos"><BookHeart aria-hidden="true" /><span><strong>Estudos bíblicos e interessados</strong><small>Acompanhe cada pessoa; os estudos contam na meta de Estudos Bíblicos.</small></span><span>Abrir</span></Link>
          <Link className="entity-row entity-row--link" to="/app/metas/missao/duplas"><UsersRound aria-hidden="true" /><span><strong>Duplas missionárias</strong><small>Organize as duplas por igreja.</small></span><span>Abrir</span></Link>
          <Link className="entity-row entity-row--link" to="/app/metas/missao/grupos"><UsersRound aria-hidden="true" /><span><strong>Escola Sabatina, PG e UAPG</strong><small>Classes e grupos; as UAPG contam na meta de UAPG.</small></span><span>Abrir</span></Link>
        </div>
      </Card>
    </div>
  )
}
