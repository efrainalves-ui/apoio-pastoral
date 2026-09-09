import { useReloadOnSync } from '../sync/useReloadOnSync'
import { BookHeart, Cake, TriangleAlert, CalendarDays, ChevronRight, Church, HeartHandshake, Megaphone, ShieldCheck, SquareCheck, UsersRound } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuthVault } from '../auth/AuthVaultContext'
import { localDateKey } from '../shared/dates'
import { AgendaService } from '../agenda/service'
import type { AgendaEventEntity } from '../agenda/types'
import { CareService } from '../care/service'
import type { FollowUpEntity, PrayerRequestEntity, TaskEntity } from '../care/types'
import { GoalsSummary } from '../components/GoalsSummary'
import { MetaFinanceiraResumo } from '../components/MetaFinanceiraResumo'
import { VisitAnswersSummary } from '../components/VisitAnswersSummary'
import { Card } from '../components/ui/Card'
import { MetricLink } from '../components/ui/MetricLink'
import { CountUp } from '../components/ui/CountUp'
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
  const [campaigns, setCampaigns] = useState<EvangelismCampaignEntity[]>([])
  const [interests, setInterests] = useState<InterestEntity[]>([])
  const [studies, setStudies] = useState<BibleStudyEntity[]>([])

  const refresh = useCallback(async () => {
    if (!account || !masterKey) return
    const district = await districtService.getDistrict(account.id, masterKey)
    const [nextPeople, nextFamilies, nextChurches, nextEvents, nextTasks, nextPrayers, nextFollowUps, , nextCampaigns, nextInterests, nextStudies] = await Promise.all([
      peopleService.listPeople(account.id, masterKey), familyService.listFamilies(account.id, masterKey), district ? districtService.listChurches(account.id, masterKey, district.id) : [], agendaService.listEvents(account.id, masterKey), careService.listTasks(account.id, masterKey), careService.listPrayerRequests(account.id, masterKey), careService.listFollowUps(account.id, masterKey), careService.listRounds(account.id, masterKey), evangelismService.listCampaigns(account.id, masterKey), missionaryService.listInterests(account.id, masterKey), missionaryService.listStudies(account.id, masterKey),
    ])
    const today = localDateKey()
    setPeople(nextPeople); setFamilies(nextFamilies.length); setChurches(nextChurches); setTodayBirthdays(upcomingBirthdays(nextPeople, new Date(), 0)); setEvents(nextEvents); setTodayEvents(nextEvents.filter(({ startAt }) => startAt.slice(0, 10) === today)); setTasks(nextTasks); setPrayers(nextPrayers); setFollowUps(nextFollowUps); setCampaigns(nextCampaigns); setInterests(nextInterests); setStudies(nextStudies)
  }, [account, masterKey])

  useReloadOnSync(refresh)

  const today = localDateKey()
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
  // O que fica para depois também é tarefa: sem esta lista, o que foi anotado
  // para a semana some da tela até vencer.
  const outrasTarefas = tasks.filter(({ status, dueAt }) => status === 'pending' && dueAt.slice(0, 10) > today)
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

  /*
    A tela abre com um número e uma frase.

    É a resposta à pergunta que se faz ao abrir o aplicativo — quem está
    esperando por mim. Antes eram quatro cartões de mesmo peso, e a conta ficava
    para o pastor fazer de cabeça.

    O que manda é o retorno vencido: compromisso de hoje a agenda mostra logo
    abaixo, mas quem espera há dias não aparece em lugar nenhum se ninguém for
    atrás.
  */
  /*
    Dois nomes bastam na tira: um nome completo de cinco palavras vira quatro
    linhas de texto miúdo num círculo de 92 pixels, e quem procura reconhece a
    pessoa pelo primeiro e pelo último.
  */
  const primeiroEUltimo = (nome: string) => {
    const partes = nome.trim().split(/\s+/u).filter((parte) => parte.length > 2)
    return partes.length > 1 ? `${partes[0]} ${partes.at(-1)}` : nome.trim()
  }
  const diaDeHoje = useMemo(() => new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date()), [])
  const esperando = overdueTasks.length + prayersNeedingCare.length
  // O relógio fica dentro do memo: lido direto no corpo do componente, ele
  // tornaria a renderização impura e daria um resultado diferente a cada quadro.
  const { diasParados, proximoDeHoje } = useMemo(() => {
    const agora = new Date()
    const maisAntiga = [...overdueTasks].sort((esquerda, direita) => esquerda.dueAt.localeCompare(direita.dueAt))[0]
    return {
      diasParados: maisAntiga ? Math.max(1, Math.round((agora.getTime() - new Date(maisAntiga.dueAt).getTime()) / 86_400_000)) : 0,
      proximoDeHoje: [...todayEvents]
        .sort((esquerda, direita) => esquerda.startAt.localeCompare(direita.startAt))
        .find(({ endAt }) => endAt >= agora.toISOString()),
    }
  }, [overdueTasks, todayEvents])

  /*
    O topo mostra a data, e continua se chamando "Visão do distrito".

    Dois títulos brigavam: o da página e o número da manchete. O nome da tela
    quem já sabe é quem a abriu — a data situa, e deixa o número mandar. Mas
    quem chega pelo leitor de tela não vê a tela: para ele o título continua
    dizendo onde está, que é o que uma data sozinha não diz.
  */
  return <div className="page-stack"><header className="page-hero page-hero--dia"><div><h1><span className="sr-only">Visão do distrito</span><span aria-hidden="true">{diaDeHoje}</span></h1></div></header>

    <section className="manchete" aria-label="O que exige atenção">
      <span className={esperando > 0 ? 'manchete__num manchete__num--atencao' : 'manchete__num'}><CountUp value={esperando} /></span>
      <p className="manchete__txt">{esperando === 0 ? 'nada esperando por você agora' : esperando === 1 ? 'pessoa espera um retorno seu' : 'pessoas esperam um retorno seu'}</p>
      {diasParados > 0 && <span className="manchete__sub">A mais antiga espera há {diasParados} {diasParados === 1 ? 'dia' : 'dias'}</span>}
    </section>

    <dl className="estrato">
      <div><dt>Hoje</dt><dd>{tasksDueToday.length + todayEvents.length}</dd></div>
      <div><dt>Em oração</dt><dd className="viva">{prayersInPrayer.length}</dd></div>
      <div><dt>Igrejas a olhar</dt><dd className={churchesNeedingAttention.length > 0 ? 'atencao' : ''}>{churchesNeedingAttention.length}</dd></div>
    </dl>

    {proximoDeHoje && <section className="faixa" aria-label="Próximo compromisso">
      <p className="rotulo-secao">Agora</p>
      <Link className="agora" to={`/app/agenda/${proximoDeHoje.id}`}>
        <span className="agora__hora">{proximoDeHoje.startAt.slice(11, 16)}</span>
        <span className="agora__corpo">
          <strong>{proximoDeHoje.title}</strong>
          <small>{churches.find(({ id }) => id === proximoDeHoje.churchId)?.name ?? 'Sem igreja'}</small>
        </span>
      </Link>
    </section>}

    <div className="home-grid"><Card eyebrow="Hoje" title="Agenda" action={<Link className="icon-button" to="/app/agenda" aria-label="Abrir agenda"><CalendarDays className="accent-icon" /></Link>}>{!todayEvents.length ? <div className="empty-state compact-empty"><CalendarDays /><strong>Nenhum compromisso hoje</strong><span>Reserve um horário para uma visita, reunião ou pregação.</span></div> : <div className="breakdown-list">{todayEvents.map((event) => <div key={event.id}><span>{event.title}</span><strong>{event.allDay ? 'Dia todo' : new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(event.startAt))}</strong></div>)}</div>}</Card><Card eyebrow="Hoje" title="Aniversariantes" action={<Link className="icon-button" to="/app/aniversarios" aria-label="Ver próximos aniversários"><Cake className="accent-icon" /></Link>}>{todayBirthdays.length === 0 ? <div className="empty-state compact-empty"><Cake /><strong>Nenhum aniversariante hoje</strong></div> : <ul className="tira-pessoas">{todayBirthdays.map(({ person, turningAge }) => <li key={person.id}><Link to={`/app/aniversarios`}><span className="inicial-redonda" aria-hidden="true">{person.name[0]}</span><strong>{primeiroEUltimo(person.name)}</strong><small>{turningAge} anos</small></Link></li>)}</ul>}</Card></div>
    <div className="home-grid"><Card eyebrow="Atenção pastoral" title="Visitas e cuidados" action={<Link className="icon-button" to="/app/visitacao" aria-label="Abrir visitas e cuidados"><HeartHandshake className="accent-icon" /></Link>}>
      {/*
        O número é o caminho. Havia os números e, embaixo, uma fileira de links
        de texto dizendo a mesma coisa. Tarefas saiu daqui porque tem cartão
        próprio: o mesmo dado em dois lugares faz duvidar de qual é o certo.
      */}
      <div className="metrics-link-row">
        <MetricLink label="Pedidos de oração" value={prayersInPrayer.length} to="/app/visitacao?aba=oracao" />
        <MetricLink label="Acompanhamentos" value={pendingFollowUps.length} to="/app/visitacao?aba=acompanhamentos" />
      </div>
    </Card></div>
    <div className="home-grid">
      {/*
        A tarefa de hoje é o que se faz agora, e por isso ela manda no cartão.

        Antes eram três contagens do mesmo tamanho e duas listas parecidas
        embaixo. Agora cada contagem é um caminho, e só as de hoje e as vencidas
        aparecem escritas — são elas que pedem decisão antes do fim do dia.
      */}
      <Card eyebrow="Hoje" title="Tarefas" action={<Link className="icon-button" to="/app/visitacao?aba=tarefas" aria-label="Abrir tarefas"><SquareCheck className="accent-icon" /></Link>}>
        {!overdueTasks.length && !tasksDueToday.length && !outrasTarefas.length
          ? <div className="empty-state compact-empty"><SquareCheck /><strong>Nenhuma tarefa</strong></div>
          : <>
            <div className="metrics-link-row">
              <MetricLink label="Para hoje" value={tasksDueToday.length} to="/app/visitacao?aba=tarefas" tone={tasksDueToday.length > 0 ? 'ok' : 'neutro'} />
              <MetricLink label="Vencidas" value={overdueTasks.length} to="/app/visitacao?aba=tarefas" tone={overdueTasks.length > 0 ? 'atencao' : 'neutro'} />
              <MetricLink label="Depois" value={outrasTarefas.length} to="/app/visitacao?aba=tarefas" />
            </div>
            {Boolean(overdueTasks.length || tasksDueToday.length) && <ul className="lista-tarefas">
              {[...overdueTasks, ...tasksDueToday].slice(0, 4).map((task) => (
                <li key={task.id} className={task.dueAt.slice(0, 10) < today ? 'lista-tarefas--vencida' : ''}>
                  <Link to="/app/visitacao?aba=tarefas">
                    <span className="lista-tarefas__marca" aria-hidden="true" />
                    <strong>{task.title}</strong>
                    <small>{new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(new Date(task.dueAt))}</small>
                  </Link>
                </li>
              ))}
            </ul>}
          </>}
      </Card>

      {/*
        A igreja que pede atenção precisa parecer diferente da que está em dia.

        Era nome à esquerda e motivo em negrito branco à direita, os dois
        disputando a linha: lia-se como erro de impressão. Agora o nome manda, o
        motivo vira etiqueta âmbar com ícone — cor e forma, porque só a cor não
        serve a quem não a distingue — e a linha inteira leva à igreja.
      */}
      <Card eyebrow="Distrito" title="Igrejas que precisam de atenção" action={<Link className="icon-button" to="/app/distrito" aria-label="Ver igrejas do distrito"><Church className="accent-icon" /></Link>}>
        {!churchesNeedingAttention.length
          ? <div className="empty-state compact-empty"><Church /><strong>Nenhuma pendência nas igrejas</strong></div>
          : <ul className="lista-atencao">{churchesNeedingAttention.slice(0, 5).map((church) => (
              <li key={church.id}>
                <Link to={`/app/distrito/igrejas/${church.id}`}>
                  <strong>{church.name}</strong>
                  <span className="selo-atencao"><TriangleAlert aria-hidden="true" />{church.motivo}</span>
                </Link>
              </li>
            ))}</ul>}
      </Card>
    </div>
    <Card eyebrow="Missão" title="Evangelismo" action={<Megaphone className="accent-icon" />}><div className="private-summary"><div><span>Em preparação</span><strong>{campaignSummary.preparing}</strong></div><div><span>Acontecendo</span><strong>{campaignSummary.happening}</strong></div><div><span>Tarefas urgentes</span><strong>{campaigns.flatMap(({ tasks: campaignTasks }) => campaignTasks).filter((task) => isTaskUrgent(task, today)).length}</strong></div></div>{nextCampaign ? <Link className="entity-row" to={`/app/evangelismo/${nextCampaign.id}`}><span className="avatar"><Megaphone /></span><span><strong>{nextCampaign.name}</strong><small>Próxima ação em {new Intl.DateTimeFormat('pt-BR').format(new Date(`${nextCampaign.startDate}T12:00:00`))}</small></span><ChevronRight /></Link> : <div className="empty-state compact-empty"><Megaphone /><strong>Nenhuma campanha futura</strong><span>Planeje a próxima ação evangelística quando estiver pronto.</span></div>}<Link className="text-link" to="/app/evangelismo">Abrir Evangelismo <ChevronRight /></Link></Card>
    <section className="dashboard-metrics" aria-label="Resumo do distrito"><Link to="/app/pessoas"><small>Pessoas</small><strong>{people.length}</strong><span>{people.filter(({ pastoralStatus }) => pastoralStatus === 'active').length} ativas</span></Link><Link to="/app/pessoas"><small>Acompanhar</small><strong>{people.filter(({ pastoralStatus }) => pastoralStatus === 'rescue').length}</strong><span>pessoas a resgatar</span></Link><Link to="/app/familias"><small>Famílias</small><strong>{families}</strong><span>laços cadastrados</span></Link><Link to="/app/aniversarios"><small>Aniversários hoje</small><strong>{todayBirthdays.length}</strong><span>ver mensagens</span></Link></section>
    <MetaFinanceiraResumo />
    <GoalsSummary />
    <Card eyebrow="Distrito" title="Fidelidade" action={<ShieldCheck className="accent-icon" />}><div className="private-summary"><div><span>Dizimistas</span><strong>{fidelityCounts.tither}</strong></div><div><span>Dizimistas não sistemáticos</span><strong>{fidelityCounts.nonSystematic}</strong></div><div><span>Não dizimistas</span><strong>{fidelityCounts.nonTither}</strong></div></div><Link className="text-link" to="/app/fidelidade">Abrir Fidelidade <ChevronRight /></Link></Card>
      <Card eyebrow="Missão" title="Interessados e estudos" action={<BookHeart className="accent-icon" />}>
        {!interestsWaiting.length && !studiesInProgress.length
          ? <div className="empty-state compact-empty"><BookHeart /><strong>Nenhum contato pendente</strong><span>Cadastre interessados para acompanhar cada pessoa.</span></div>
          : <div className="private-summary"><div><span>Aguardando estudo</span><strong>{interestsWaiting.length}</strong></div><div><span>Estudo em andamento</span><strong>{studiesInProgress.length}</strong></div></div>}
        {Boolean(interestsWaiting.length) && <div className="breakdown-list">{interestsWaiting.slice(0, 4).map((interest) => <div key={interest.id}><span>{interest.name}</span><strong>Aguardando</strong></div>)}</div>}
        <Link className="text-link" to="/app/missionario">Abrir interessados e estudos <ChevronRight /></Link>
      </Card>

    <Card eyebrow="Distrito" title="Pessoas por igreja">{churches.length === 0 ? <div className="empty-state compact-empty"><UsersRound /><strong>Nenhuma igreja cadastrada</strong><span>Cadastre as igrejas do distrito para organizar as pessoas.</span></div> : <div className="breakdown-list">{churches.map((church) => <div key={church.id}><span>{church.name}</span><strong>{people.filter(({ currentChurchId, importStatus }) => currentChurchId === church.id && importStatus !== 'archived').length}</strong></div>)}</div>}<Link className="text-link" to="/app/distrito">Abrir distrito e igrejas <ChevronRight /></Link></Card>
    <VisitAnswersSummary />

  </div>
}
