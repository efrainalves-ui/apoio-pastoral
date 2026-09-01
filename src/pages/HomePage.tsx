import { BookHeart, Cake, CalendarDays, ChevronRight, Church, Heart, HeartHandshake, ListChecks, Megaphone, Plus, ShieldCheck, SquareCheck, UsersRound } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuthVault } from '../auth/AuthVaultContext'
import { AgendaService } from '../agenda/service'
import type { AgendaEventEntity } from '../agenda/types'
import { CareService } from '../care/service'
import type { FollowUpEntity, PrayerRequestEntity, TaskEntity, VisitRoundEntity } from '../care/types'
import { SyncNowButton } from '../components/SyncNowButton'
import { GoalsSummary } from '../components/GoalsSummary'
import { VisitAnswersSummary } from '../components/VisitAnswersSummary'
import { Card } from '../components/ui/Card'
import { DistrictService } from '../district/service'
import type { ChurchEntity } from '../district/types'
import { FamilyService } from '../families/service'
import { upcomingBirthdays, type BirthdayPerson } from '../people/dates'
import { PeopleService } from '../people/service'
import type { PersonEntity } from '../people/types'
import { campaignDashboard, isTaskUrgent } from '../evangelism/core'
import { MissionaryService } from '../missionary/service'
import type { BibleStudyEntity, InterestEntity } from '../missionary/types'
import { EvangelismPlanningService } from '../evangelism/service'
import type { EvangelismCampaignEntity } from '../evangelism/types'

const peopleService = new PeopleService()
const familyService = new FamilyService()
const districtService = new DistrictService()
const agendaService = new AgendaService()
const careService = new CareService()
const evangelismService = new EvangelismPlanningService()
const missionaryService = new MissionaryService()

export function HomePage() {
  const { account, masterKey } = useAuthVault()
  const [people, setPeople] = useState<PersonEntity[]>([])
  const [churches, setChurches] = useState<ChurchEntity[]>([])
  const [families, setFamilies] = useState(0)
  const [todayBirthdays, setTodayBirthdays] = useState<BirthdayPerson[]>([])
  const [events, setEvents] = useState<AgendaEventEntity[]>([])
  const [todayEvents, setTodayEvents] = useState<AgendaEventEntity[]>([])
  const [tasks, setTasks] = useState<TaskEntity[]>([])
  const [prayers, setPrayers] = useState<PrayerRequestEntity[]>([])
  const [followUps, setFollowUps] = useState<FollowUpEntity[]>([])
  const [rounds, setRounds] = useState<VisitRoundEntity[]>([])
  const [campaigns, setCampaigns] = useState<EvangelismCampaignEntity[]>([])
  const [interests, setInterests] = useState<InterestEntity[]>([])
  const [studies, setStudies] = useState<BibleStudyEntity[]>([])

  const refresh = useCallback(async () => {
    if (!account || !masterKey) return
    const district = await districtService.getDistrict(account.id, masterKey)
    const [nextPeople, nextFamilies, nextChurches, nextEvents, nextTasks, nextPrayers, nextFollowUps, nextRounds, nextCampaigns, nextInterests, nextStudies] = await Promise.all([
      peopleService.listPeople(account.id, masterKey), familyService.listFamilies(account.id, masterKey), district ? districtService.listChurches(account.id, masterKey, district.id) : [], agendaService.listEvents(account.id, masterKey), careService.listTasks(account.id, masterKey), careService.listPrayerRequests(account.id, masterKey), careService.listFollowUps(account.id, masterKey), careService.listRounds(account.id, masterKey), evangelismService.listCampaigns(account.id, masterKey), missionaryService.listInterests(account.id, masterKey), missionaryService.listStudies(account.id, masterKey),
    ])
    const today = new Date().toISOString().slice(0, 10)
    setPeople(nextPeople); setFamilies(nextFamilies.length); setChurches(nextChurches); setTodayBirthdays(upcomingBirthdays(nextPeople, new Date(), 0)); setEvents(nextEvents); setTodayEvents(nextEvents.filter(({ startAt }) => startAt.slice(0, 10) === today)); setTasks(nextTasks); setPrayers(nextPrayers); setFollowUps(nextFollowUps); setRounds(nextRounds); setCampaigns(nextCampaigns); setInterests(nextInterests); setStudies(nextStudies)
  }, [account, masterKey])

  useEffect(() => { void refresh() }, [refresh])

  const today = new Date().toISOString().slice(0, 10)
  const overdueTasks = tasks.filter(({ status, dueAt }) => status === 'pending' && dueAt < today)
  const prayersInPrayer = prayers.filter(({ status }) => status === 'active' || status === 'needs_follow_up')
  const pendingFollowUps = followUps.filter(({ status }) => status === 'pending')
  const fidelityCounts = {
    tither: people.filter((person) => person.fidelity?.category === 'tither').length,
    nonSystematic: people.filter((person) => person.fidelity?.category === 'non_systematic_tither').length,
    nonTither: people.filter((person) => person.fidelity?.category === 'non_tither').length,
  }
  const campaignSummary = campaignDashboard(campaigns, today)
  const nextCampaign = campaigns.filter(({ status, endDate }) => status !== 'completed' && status !== 'cancelled' && endDate >= today).sort((a, b) => a.startDate.localeCompare(b.startDate))[0]

  const tasksDueToday = tasks.filter(({ status, dueAt }) => status === 'pending' && dueAt.slice(0, 10) === today)
  const prayersNeedingCare = prayers.filter((request) => request.status === 'needs_follow_up' || (request.status === 'active' && Boolean(request.reviewAt) && request.reviewAt.slice(0, 10) <= today))
  const interestsWaiting = interests.filter(({ status }) => status === 'waiting_study')
  const studiesInProgress = studies.filter(({ status }) => status === 'in_progress')
  // Sinais operacionais, nunca julgamento: a lista fica em ordem alfabética e
  // não classifica nenhuma igreja como melhor ou pior que outra.
  const churchesNeedingAttention = churches
    .map((church) => {
      const semPessoas = !people.some(({ currentChurchId, importStatus }) => currentChurchId === church.id && importStatus !== 'archived')
      const semAgenda = !events.some((event) => event.churchId === church.id && event.startAt.slice(0, 10) >= today)
      const motivo = semPessoas ? 'Ainda sem pessoas cadastradas' : semAgenda ? 'Sem compromisso futuro na Agenda' : ''
      return { id: church.id, name: church.name, motivo }
    })
    .filter(({ motivo }) => motivo.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))

  return <div className="page-stack"><header className="page-hero"><div><p className="eyebrow">Hoje</p><h1>Visão do distrito</h1><p>O que merece sua atenção pastoral neste momento.</p></div><div className="page-actions"><SyncNowButton /><Link className="button button--secondary" to="/app/visitas/nova"><HeartHandshake />Nova visita</Link><Link className="button" to="/app/agenda/novo"><Plus />Novo compromisso</Link></div></header>
    <GoalsSummary />
    <VisitAnswersSummary />
    <section className="dashboard-metrics" aria-label="Resumo do distrito"><Link to="/app/pessoas"><small>Pessoas</small><strong>{people.length}</strong><span>{people.filter(({ pastoralStatus }) => pastoralStatus === 'active').length} ativas</span></Link><Link to="/app/pessoas"><small>Acompanhar</small><strong>{people.filter(({ pastoralStatus }) => pastoralStatus === 'rescue').length}</strong><span>pessoas a resgatar</span></Link><Link to="/app/familias"><small>Famílias</small><strong>{families}</strong><span>laços cadastrados</span></Link><Link to="/app/aniversarios"><small>Aniversários hoje</small><strong>{todayBirthdays.length}</strong><span>ver mensagens</span></Link></section>
    <div className="home-grid"><Card eyebrow="Hoje" title="Agenda" action={<CalendarDays className="accent-icon" />}>{!todayEvents.length ? <div className="empty-state compact-empty"><CalendarDays /><strong>Nenhum compromisso hoje</strong><span>Reserve um horário para uma visita, reunião ou pregação.</span></div> : <div className="breakdown-list">{todayEvents.map((event) => <div key={event.id}><span>{event.title}</span><strong>{event.allDay ? 'Dia todo' : new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(event.startAt))}</strong></div>)}</div>}<Link className="text-link" to="/app/agenda">Abrir agenda <ChevronRight /></Link></Card><Card eyebrow="Hoje" title="Aniversariantes" action={<Cake className="accent-icon" />}>{todayBirthdays.length === 0 ? <div className="empty-state compact-empty"><Cake /><strong>Nenhum aniversariante hoje</strong></div> : <div className="entity-list">{todayBirthdays.map(({ person, turningAge }) => <Link className="entity-row" key={person.id} to={`/app/pessoas/${person.id}`}><span className="avatar">{person.name[0]}</span><span><strong>{person.name}</strong><small>Completa {turningAge} anos</small></span></Link>)}</div>}<Link className="text-link" to="/app/aniversarios">Ver próximos aniversários <ChevronRight /></Link></Card></div>
    <div className="home-grid"><Card eyebrow="Atenção pastoral" title="Visitas e cuidados" action={<HeartHandshake className="accent-icon" />}><div className="private-summary"><div><span>Tarefas vencidas</span><strong>{overdueTasks.length}</strong></div><div><span>Pedidos em oração</span><strong>{prayersInPrayer.length}</strong></div><div><span>Acompanhamentos</span><strong>{pendingFollowUps.length}</strong></div></div><div className="card-link-row"><Link className="text-link" to="/app/cuidados"><ListChecks />Abrir cuidados</Link><Link className="text-link" to="/app/pedidos-oracao">Abrir pedidos de oração <ChevronRight /></Link></div></Card><Card eyebrow="Visitação" title="Rodadas em andamento" action={<UsersRound className="accent-icon" />}>{!rounds.length ? <div className="empty-state compact-empty"><UsersRound /><strong>Nenhuma rodada iniciada</strong><span>Organize uma rodada quando estiver pronto.</span></div> : <div className="round-list">{rounds.slice(0, 4).map((round) => <article key={round.id}><span><strong>{round.name}</strong><small>{round.visitedFamilyIds.length} de {round.targetFamilyIds.length} famílias</small></span><progress value={round.visitedFamilyIds.length} max={round.targetFamilyIds.length} /><span className="entity-badge">{round.status === 'completed' ? 'Concluída' : 'Ativa'}</span></article>)}</div>}<Link className="text-link" to="/app/cuidados#rodadas">Gerenciar rodadas <ChevronRight /></Link></Card></div>
    <Card eyebrow="Distrito" title="Fidelidade" action={<ShieldCheck className="accent-icon" />}><div className="private-summary"><div><span>Dizimistas</span><strong>{fidelityCounts.tither}</strong></div><div><span>Dizimistas não sistemáticos</span><strong>{fidelityCounts.nonSystematic}</strong></div><div><span>Não dizimistas</span><strong>{fidelityCounts.nonTither}</strong></div></div><Link className="text-link" to="/app/fidelidade">Abrir Fidelidade <ChevronRight /></Link></Card>
    <Card eyebrow="Missão" title="Evangelismo" action={<Megaphone className="accent-icon" />}><div className="private-summary"><div><span>Em preparação</span><strong>{campaignSummary.preparing}</strong></div><div><span>Acontecendo</span><strong>{campaignSummary.happening}</strong></div><div><span>Tarefas urgentes</span><strong>{campaigns.flatMap(({ tasks: campaignTasks }) => campaignTasks).filter((task) => isTaskUrgent(task, today)).length}</strong></div></div>{nextCampaign ? <Link className="entity-row" to={`/app/evangelismo/${nextCampaign.id}`}><span className="avatar"><Megaphone /></span><span><strong>{nextCampaign.name}</strong><small>Próxima ação em {new Intl.DateTimeFormat('pt-BR').format(new Date(`${nextCampaign.startDate}T12:00:00`))}</small></span><ChevronRight /></Link> : <div className="empty-state compact-empty"><Megaphone /><strong>Nenhuma campanha futura</strong><span>Planeje a próxima ação evangelística quando estiver pronto.</span></div>}<Link className="text-link" to="/app/evangelismo">Abrir Evangelismo <ChevronRight /></Link></Card>
    <Card eyebrow="Distrito" title="Pessoas por igreja">{churches.length === 0 ? <div className="empty-state compact-empty"><UsersRound /><strong>Nenhuma igreja cadastrada</strong><span>Cadastre as igrejas do distrito para organizar as pessoas.</span></div> : <div className="breakdown-list">{churches.map((church) => <div key={church.id}><span>{church.name}</span><strong>{people.filter(({ currentChurchId, importStatus }) => currentChurchId === church.id && importStatus !== 'archived').length}</strong></div>)}</div>}<Link className="text-link" to="/app/distrito">Abrir distrito e igrejas <ChevronRight /></Link></Card>
    <div className="home-grid">
      <Card eyebrow="Hoje" title="Tarefas" action={<SquareCheck className="accent-icon" />}>
        {!overdueTasks.length && !tasksDueToday.length
          ? <div className="empty-state compact-empty"><SquareCheck /><strong>Nenhuma tarefa para hoje</strong><span>Você está em dia com o que havia anotado.</span></div>
          : <div className="private-summary"><div><span>Vencidas</span><strong>{overdueTasks.length}</strong></div><div><span>Para hoje</span><strong>{tasksDueToday.length}</strong></div></div>}
        {Boolean(overdueTasks.length || tasksDueToday.length) && <div className="breakdown-list">{[...overdueTasks, ...tasksDueToday].slice(0, 4).map((task) => <div key={task.id}><span>{task.title}</span><strong>{new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(new Date(task.dueAt))}</strong></div>)}</div>}
        <Link className="text-link" to="/app/cuidados#tarefas">Abrir tarefas <ChevronRight /></Link>
      </Card>

      <Card eyebrow="Cuidado" title="Pedidos de oração" action={<Heart className="accent-icon" />}>
        {!prayersNeedingCare.length
          ? <div className="empty-state compact-empty"><Heart /><strong>Nenhum pedido aguardando retorno</strong><span>Os pedidos ativos estão dentro do prazo combinado.</span></div>
          : <><p className="card-copy">{prayersNeedingCare.length === 1 ? '1 pedido precisa de acompanhamento.' : `${prayersNeedingCare.length} pedidos precisam de acompanhamento.`}</p><div className="breakdown-list">{prayersNeedingCare.slice(0, 4).map((request) => <div key={request.id}><span>{request.text}</span><strong>{request.status === 'needs_follow_up' ? 'Retornar' : 'Revisar'}</strong></div>)}</div></>}
        <Link className="text-link" to="/app/pedidos-oracao">Ver pedidos para acompanhar <ChevronRight /></Link>
      </Card>

      <Card eyebrow="Missão" title="Interessados e estudos" action={<BookHeart className="accent-icon" />}>
        {!interestsWaiting.length && !studiesInProgress.length
          ? <div className="empty-state compact-empty"><BookHeart /><strong>Nenhum contato pendente</strong><span>Cadastre interessados para acompanhar cada pessoa.</span></div>
          : <div className="private-summary"><div><span>Aguardando estudo</span><strong>{interestsWaiting.length}</strong></div><div><span>Estudo em andamento</span><strong>{studiesInProgress.length}</strong></div></div>}
        {Boolean(interestsWaiting.length) && <div className="breakdown-list">{interestsWaiting.slice(0, 4).map((interest) => <div key={interest.id}><span>{interest.name}</span><strong>Aguardando</strong></div>)}</div>}
        <Link className="text-link" to="/app/missionario">Abrir interessados e estudos <ChevronRight /></Link>
      </Card>

      <Card eyebrow="Distrito" title="Igrejas que precisam de atenção" action={<Church className="accent-icon" />}>
        {!churchesNeedingAttention.length
          ? <div className="empty-state compact-empty"><Church /><strong>Nenhuma pendência nas igrejas</strong><span>Todas têm pessoas cadastradas e compromisso marcado.</span></div>
          : <div className="breakdown-list">{churchesNeedingAttention.slice(0, 5).map((church) => <div key={church.id}><span>{church.name}</span><strong>{church.motivo}</strong></div>)}</div>}
        <Link className="text-link" to="/app/distrito">Ver igrejas do distrito <ChevronRight /></Link>
      </Card>
    </div>

  </div>
}
