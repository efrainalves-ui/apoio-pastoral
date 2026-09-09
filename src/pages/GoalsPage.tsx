import { FileText, Flag, UsersRound } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Card } from '../components/ui/Card'
import { CountUp } from '../components/ui/CountUp'
import { ProgressRing } from '../components/ui/ProgressRing'
import { GOAL_AREAS, GOAL_AREA_LABELS, PERCENT_TARGET_AREAS, areaComparison, crescimentoDaMeta } from '../goals/areas'
import { MONTH_LABELS } from '../goals/format'
import { useQuadroDeGrupos } from '../missionary/useQuadroDeGrupos'
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
  const { quadro } = useQuadroDeGrupos()
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
    <div className="page-stack goals-page">
      <header className="page-hero">
        <div><p className="eyebrow">{year}</p><h1>Metas</h1></div>
        <div className="page-actions"><Button variant="secondary" icon={<FileText />} onClick={() => void relatorio()}>Relatório</Button><Flag /></div>
      </header>
      <section className="manchete" aria-label="Áreas de acompanhamento">
        <span className="manchete__num"><CountUp value={GOAL_AREAS.length + 1} /></span>
        <p className="manchete__txt">áreas para acompanhar</p>
      </section>
      <h2 className="rotulo-secao">Metas do distrito</h2>
      <div className="goal-cards">
        {/*
          A Escola Sabatina é meta como as outras e fica com elas — só a página
          por trás é diferente, porque a meta dela se calcula em vez de se
          combinar. Tirá-la daqui escondeu-a de quem abre "Metas" para ver
          tudo.
        */}
        <Card title={GOAL_AREA_LABELS.uapg}>
          <div className="goal-card">
            <div className="goal-card__numbers">
              <div><small>Meta</small><strong>{quadro.distrito.meta}</strong></div>
              <div><small>Escola Sabatina</small><strong className={quadro.distrito.escolaSabatina >= quadro.distrito.meta ? 'quadro--alcancado' : 'quadro--falta'}>{quadro.distrito.escolaSabatina}</strong></div>
              <div><small>Pequenos Grupos</small><strong className={quadro.distrito.pequenosGrupos >= quadro.distrito.meta ? 'quadro--alcancado' : 'quadro--falta'}>{quadro.distrito.pequenosGrupos}</strong></div>
              <div><small>Integração</small><strong className={quadro.distrito.integracoes >= quadro.distrito.meta ? 'quadro--alcancado' : 'quadro--falta'}>{quadro.distrito.integracoes}</strong></div>
            </div>
            <p className="goal-card__percent">Um de cada para cada 12 membros · {quadro.distrito.membros} no distrito</p>
            <Link className="button button--secondary" to="/app/metas/uapg">Acompanhar</Link>
          </div>
        </Card>
        {GOAL_AREAS.map((area) => {
          const progresso = areaComparison(area, goals, sources, year)
          // Onde a meta foi combinada em porcentagem, o cartão fala em
          // porcentagem. "83% alcançado" para um crescimento de 8% sobre uma
          // meta de 30% é verdade e engana: quem lê 83% não vai atrás dos vinte
          // e dois pontos que faltam.
          const emPorcentagem = PERCENT_TARGET_AREAS.includes(area)
          const crescimento = emPorcentagem ? crescimentoDaMeta(area, goals, sources, year) : null
          const ponto = (valor: number) => `${valor >= 0 ? '+' : '−'}${Math.abs(valor).toFixed(1).replace('.', ',')}%`
          return (
            <Card key={area} title={GOAL_AREA_LABELS[area]}>
              <div className="goal-card">
                {crescimento
                  ? <>
                    <div className={crescimento.alvo > 0 ? 'meta-anel' : undefined}>
                      {crescimento.alvo > 0 && <ProgressRing percent={crescimento.percentDaMeta} label={`Progresso da meta de ${GOAL_AREA_LABELS[area]}`}><span>{crescimento.percentDaMeta}%<small>da meta</small></span></ProgressRing>}
                    <div className="goal-card__numbers">
                      <div><small>Alvo</small><strong>{crescimento.alvo > 0 ? `+${crescimento.alvo}%` : 'A definir'}</strong></div>
                      <div><small>Alcançado</small><strong className={crescimento.alcancado === null ? '' : crescimento.alcancado < 0 ? 'quadro--falta' : 'quadro--alcancado'}>{crescimento.alcancado === null ? '—' : ponto(crescimento.alcancado)}</strong></div>
                      <div><small>Falta</small><strong>{crescimento.alvo > 0 ? `${crescimento.falta.toFixed(1).replace('.', ',')} p.p.` : '—'}</strong></div>
                    </div>
                    </div>
                    {crescimento.ateOMes > 0
                      ? <p className="goal-card__percent">Janeiro a {MONTH_LABELS[crescimento.ateOMes - 1]}, nos dois anos: {formatGoalValue(area, crescimento.anterior)} → {formatGoalValue(area, crescimento.atual)}</p>
                      : <p className="goal-card__percent">Envie o Comparativo de Entradas deste ano</p>}
                    {crescimento.objetivoAnual > 0 && <p className="goal-card__percent">Meta do ano: {formatGoalValue(area, crescimento.objetivoAnual)} · {year - 1} fechou em {formatGoalValue(area, crescimento.anoAnteriorFechado)}</p>}
                  </>
                  : <>
                    <div className={progresso.objective > 0 ? 'meta-anel' : undefined}>
                      {progresso.objective > 0 && <ProgressRing percent={progresso.percent} label={`Progresso da meta de ${GOAL_AREA_LABELS[area]}`}><span>{progresso.percent}%<small>da meta</small></span></ProgressRing>}
                    <div className="goal-card__numbers">
                      <div><small>Meta anual</small><strong>{progresso.objective > 0 ? formatGoalValue(area, progresso.objective) : 'A definir'}</strong></div>
                      <div><small>Resultado</small><strong>{formatGoalValue(area, progresso.result)}</strong></div>
                      <div><small>Falta</small><strong>{progresso.target > 0 ? formatGoalValue(area, progresso.missing) : '—'}</strong></div>
                    </div>
                    </div>
                    <p className="goal-card__percent">{progresso.objective > 0 ? `${progresso.percent}% alcançado` : 'Defina a meta do ano para acompanhar'}</p>
                    {progresso.hasPrevious && <p className="goal-card__percent">{year - 1}: {formatGoalValue(area, progresso.previous)}</p>}
                  </>}
                <Link className="button button--secondary" to={`/app/metas/${area}`}>Acompanhar</Link>
              </div>
            </Card>
          )
        })}
      </div>

      <Card title="Missão e discipulado">
        <div className="entity-list">
          <Link className="entity-row entity-row--link" to="/app/metas/missao/duplas"><UsersRound aria-hidden="true" /><span><strong>Duplas missionárias</strong></span><span>Abrir</span></Link>
        </div>
      </Card>
    </div>
  )
}
