import { MarcaDaArea } from '../components/plano/MarcaDaArea'
import { useReloadOnSync } from '../sync/useReloadOnSync'
import { CalendarDays, Megaphone, Plus, ShieldCheck, TriangleAlert } from 'lucide-react'
import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuthVault } from '../auth/AuthVaultContext'
import { Card } from '../components/ui/Card'
import { DistrictService } from '../district/service'
import type { ChurchEntity } from '../district/types'
import { isTaskDueSoon, isTaskUrgent } from '../evangelism/core'
import {
  anoDaCampanha, campanhasEmAndamento, fimDaCampanha, hojeLocal, ORDEM_DAS_SITUACOES, periodoCurto, proximasCampanhas, ROTULOS_DA_SITUACAO, situacaoDaCampanha,
  textoDoPeriodo, totaisPorSituacao, type SituacaoDoPeriodo,
} from '../evangelism/periodo'
import { EvangelismPlanningService } from '../evangelism/service'
import type { EvangelismCampaignEntity } from '../evangelism/types'
import { rotuloDoTrimestre } from '../integrated-report/types'

const service = new EvangelismPlanningService(); const districtService = new DistrictService()

/**
 * Evangelismo.
 *
 * Cartões, filtro e totais usam a mesma situação — a do período e do dia de hoje,
 * ou a conclusão confirmada —, a mesma do Planejamento Anual e do Calendário.
 */
export function EvangelismPage() {
  const { account, masterKey } = useAuthVault(); const [campaigns, setCampaigns] = useState<EvangelismCampaignEntity[]>([]); const [churches, setChurches] = useState<ChurchEntity[]>([]); const [churchId, setChurchId] = useState(''); const [year, setYear] = useState(new Date().getFullYear()); const [status, setStatus] = useState<SituacaoDoPeriodo | ''>(''); const [error, setError] = useState('')
  const [correcoes, setCorrecoes] = useState(0)
  const load = useCallback(async () => {
    if (!account || !masterKey) return
    try {
      const district = await districtService.getDistrict(account.id, masterKey)
      const [nextCampaigns, nextChurches, grupos] = await Promise.all([service.listCampaigns(account.id, masterKey), district ? districtService.listChurches(account.id, masterKey, district.id) : [], service.analisarCorrecoes(account.id, masterKey).catch(() => [])])
      setCampaigns(nextCampaigns); setChurches(nextChurches); setCorrecoes(grupos.length)
    } catch { setError('Não foi possível abrir as campanhas.') }
  }, [account, masterKey]); useReloadOnSync(load)
  const hoje = hojeLocal()
  const doAno = campaigns.filter((campaign) => anoDaCampanha(campaign) === year && (!churchId || campaign.churchIds.includes(churchId)))
  const visible = doAno.filter((campaign) => !status || situacaoDaCampanha(campaign, hoje) === status)
  const totais = totaisPorSituacao(doAno, hoje)
  const tasks = visible.flatMap((campaign) => campaign.tasks.map((task) => ({ task, campaign })))
  const emAndamento = campanhasEmAndamento(doAno, hoje); const upcoming = proximasCampanhas(doAno, hoje).slice(0, 5)
  const aCompletar = campaigns.filter((campaign) => campaign.aCompletar)
  const metricas: ReadonlyArray<[SituacaoDoPeriodo, string, string]> = [['em_andamento', 'Em andamento', 'agora'], ['proxima', 'Próximas', 'ainda vão começar'], ['encerrada', 'Encerradas', 'pelas datas'], ['concluida', 'Concluídas', 'confirmadas'], ['sem_data', 'Data não informada', 'sem dia definido']]
  return <div className="page-stack evangelism-page"><header className="page-hero cabecalho-da-area area--discipulado"><div><MarcaDaArea area="discipleship" /><h1>Evangelismo</h1></div><div className="page-actions">{correcoes > 0 && <Link className="button button--secondary" to="/app/planejamento#revisar-correcoes"><ShieldCheck />Revisar correções encontradas ({correcoes})</Link>}<Link className="button" to="/app/evangelismo/nova"><Plus />Nova campanha</Link></div></header>{error && <div className="alert alert--error">{error}</div>}
    <section className="dashboard-metrics evangelism-metrics" aria-label="Resumo das campanhas">{metricas.map(([situacao, rotulo, detalhe]) => <div key={situacao}><small>{rotulo}</small><strong>{totais[situacao]}</strong><span>{detalhe}</span></div>)}</section>
    {aCompletar.length > 0 && <Card title="A completar" eyebrow="Do Relatório Integrado"><div className="entity-list">{aCompletar.map((campaign) => <Link className="entity-row entity-row--link entity-row--texto" to={`/app/evangelismo/${campaign.id}`} key={campaign.id}><span><strong>{campaign.name || 'Campanha'}</strong><small>{churches.find(({ id }) => id === campaign.origemRelatorio?.churchId)?.name ?? 'Igreja'}{campaign.origemRelatorio ? ` · ${rotuloDoTrimestre(campaign.origemRelatorio.trimestre)}` : ''}</small></span><span>Completar</span></Link>)}</div></Card>}
    <Card title="Filtrar campanhas"><div className="filter-bar"><label className="field"><span className="field__label">Igreja</span><select className="field__input" value={churchId} onChange={(event) => setChurchId(event.target.value)}><option value="">Todas as igrejas</option>{churches.map((church) => <option value={church.id} key={church.id}>{church.name}</option>)}</select></label><label className="field"><span className="field__label">Ano</span><select className="field__input" value={year} onChange={(event) => setYear(Number(event.target.value))}>{Array.from({ length: 7 }, (_, index) => new Date().getFullYear() - 2 + index).map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label className="field"><span className="field__label">Situação</span><select className="field__input" value={status} onChange={(event) => setStatus(event.target.value as SituacaoDoPeriodo | '')}><option value="">Todas</option>{ORDEM_DAS_SITUACOES.map((value) => <option key={value} value={value}>{ROTULOS_DA_SITUACAO[value]}</option>)}</select></label></div></Card>
    <div className="evangelism-dashboard"><Card title="Campanhas"><div className="campaign-grid">{visible.map((campaign) => { const situacao = situacaoDaCampanha(campaign, hoje); return <Link className="campaign-card" to={`/app/evangelismo/${campaign.id}`} key={campaign.id}><span className={`entity-badge situacao--${situacao}`}>{ROTULOS_DA_SITUACAO[situacao]}</span><Megaphone /><h3>{campaign.name}</h3><p>{campaign.description || 'Campanha do distrito'}</p><small>{textoDoPeriodo(campaign)}</small><strong>{campaign.points.length} ponto(s) · {campaign.tasks.filter(({ status: taskStatus }) => taskStatus !== 'completed').length} tarefa(s) pendente(s)</strong></Link> })}{!visible.length && <div className="empty-state"><Megaphone /><strong>Nenhuma campanha encontrada</strong><p>Crie uma campanha ou revise os filtros.</p><Link className="button" to="/app/evangelismo/nova"><Plus />Nova campanha</Link></div>}</div></Card><aside><Card title="Em andamento agora" action={<Megaphone />}>{emAndamento.length ? <div className="planning-upcoming">{emAndamento.map((campaign) => <Link to={`/app/evangelismo/${campaign.id}`} key={campaign.id}><time>{periodoCurto(campaign.startDate, fimDaCampanha(campaign))}</time><span><strong>{campaign.name}</strong><small>{campaign.location || 'Local a confirmar'}</small></span></Link>)}</div> : <p className="muted">Nenhuma campanha em andamento.</p>}</Card><Card title="Próximos eventos" action={<CalendarDays />}>{upcoming.length ? <div className="planning-upcoming">{upcoming.map((campaign) => <Link to={`/app/evangelismo/${campaign.id}`} key={campaign.id}><time>{periodoCurto(campaign.startDate, fimDaCampanha(campaign))}</time><span><strong>{campaign.name}</strong><small>{campaign.location || 'Local a confirmar'}</small></span></Link>)}</div> : <p className="muted">Nenhuma campanha próxima.</p>}</Card><Card title="Tarefas que pedem atenção" action={<TriangleAlert />}>{tasks.filter(({ task }) => isTaskUrgent(task) || isTaskDueSoon(task)).slice(0, 6).map(({ task, campaign }) => <Link className="task-attention-row" to={`/app/evangelismo/${campaign.id}#tarefas`} key={task.id}><span><strong>{task.title}</strong><small>{campaign.name} · prazo {task.dueDate}</small></span><span className={`entity-badge priority--${task.priority}`}>{isTaskUrgent(task) ? 'Urgente' : 'Próxima'}</span></Link>)}{!tasks.some(({ task }) => isTaskUrgent(task) || isTaskDueSoon(task)) && <p className="muted">Nenhuma tarefa urgente ou próxima do prazo.</p>}</Card></aside></div>
  </div>
}
