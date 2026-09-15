import { useReloadOnSync } from '../sync/useReloadOnSync'
import { BookHeart, Cake, CalendarDays, Church, Megaphone, ShieldCheck, SquareCheck } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuthVault } from '../auth/AuthVaultContext'
import { localDateKey } from '../shared/dates'
import { AgendaService } from '../agenda/service'
import type { AgendaEventEntity } from '../agenda/types'
import { CareService } from '../care/service'
import type { PrayerRequestEntity, TaskEntity } from '../care/types'
import { GoalsSummary } from '../components/GoalsSummary'
import { MetaFinanceiraResumo } from '../components/MetaFinanceiraResumo'
import { ResumoDeVisitacao } from '../components/ResumoDeVisitacao'
import { CartaoDoInicio, NumeroDoCartao } from '../components/inicio/CartaoDoInicio'
import { MarcaDaArea } from '../components/plano/MarcaDaArea'
import { PlanoEstrategicoInicio } from '../components/plano/PlanoEstrategicoInicio'
import { atributosDaCategoria } from '../components/agenda/IdentidadeDaCategoria'
import { identidadeDoCompromisso } from '../agenda/identidade'
import { CountUp } from '../components/ui/CountUp'
import { igrejasQuePrecisamDeAtencao } from '../district/atencao'
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
  const [campaigns, setCampaigns] = useState<EvangelismCampaignEntity[]>([])
  const [interests, setInterests] = useState<InterestEntity[]>([])
  const [studies, setStudies] = useState<BibleStudyEntity[]>([])
  /*
    Sem isto, a tela desenhava zero em tudo enquanto o cofre era aberto — e
    "nenhuma pessoa, nenhuma visita, nenhum aniversário" é uma afirmação, não
    uma espera. Quem entra e vê o distrito zerado por quatro segundos não pensa
    "está carregando": pensa que perdeu os dados.
  */
  const [pronta, setPronta] = useState(false)

  const refresh = useCallback(async () => {
    if (!account || !masterKey) return
    try {
      await carregarTudo()
    } finally {
      /*
        A espera termina mesmo quando a leitura falha. O portão quer dizer
        "já tentei", não "consegui": se quisesse dizer a segunda coisa, uma
        falha qualquer deixaria o pastor olhando o anel girar para sempre.
      */
      setPronta(true)
    }

    async function carregarTudo() {
    if (!account || !masterKey) return
    const district = await districtService.getDistrict(account.id, masterKey)
    const [nextPeople, nextFamilies, nextChurches, nextEvents, nextTasks, nextPrayers, , nextCampaigns, nextInterests, nextStudies] = await Promise.all([
      peopleService.listPeople(account.id, masterKey), familyService.listFamilies(account.id, masterKey), district ? districtService.listChurches(account.id, masterKey, district.id) : [], agendaService.listEvents(account.id, masterKey), careService.listTasks(account.id, masterKey), careService.listPrayerRequests(account.id, masterKey), careService.listRounds(account.id, masterKey), evangelismService.listCampaigns(account.id, masterKey), missionaryService.listInterests(account.id, masterKey), missionaryService.listStudies(account.id, masterKey),
    ])
    const today = localDateKey()
    setPeople(nextPeople); setFamilies(nextFamilies.length); setChurches(nextChurches); setTodayBirthdays(upcomingBirthdays(nextPeople, new Date(), 0)); setEvents(nextEvents); setTodayEvents(nextEvents.filter(({ startAt }) => startAt.slice(0, 10) === today)); setTasks(nextTasks); setPrayers(nextPrayers); setCampaigns(nextCampaigns); setInterests(nextInterests); setStudies(nextStudies)
    }
  }, [account, masterKey])

  useReloadOnSync(refresh)

  const today = localDateKey()
  const overdueTasks = tasks.filter(({ status, dueAt }) => status === 'pending' && dueAt < today)
  const prayersInPrayer = prayers.filter(({ status }) => status === 'active' || status === 'needs_follow_up')
  const fidelityCounts = {
    tither: people.filter((person) => person.fidelity?.category === 'tither').length,
    nonSystematic: people.filter((person) => person.fidelity?.category === 'non_systematic_tither').length,
    nonTither: people.filter((person) => person.fidelity?.category === 'non_tither').length,
  }
  const campaignSummary = campaignDashboard(campaigns, today)
  const nextCampaign = campaigns.filter(({ status, endDate }) => status !== 'completed' && status !== 'cancelled' && endDate >= today).sort((a, b) => a.startDate.localeCompare(b.startDate))[0]

  const tasksDueToday = tasks.filter(({ status, dueAt }) => status === 'pending' && dueAt.slice(0, 10) === today)
  const tarefasQuePedemAtencao = overdueTasks.length + tasksDueToday.length
  const tarefasUrgentes = campaigns.flatMap(({ tasks: campanhaTarefas }) => campanhaTarefas).filter((task) => isTaskUrgent(task, today)).length
  const prayersNeedingCare = prayers.filter((request) => request.status === 'needs_follow_up' || (request.status === 'active' && Boolean(request.reviewAt) && request.reviewAt.slice(0, 10) <= today))
  const interestsWaiting = interests.filter(({ status }) => status === 'waiting_study')
  const studiesInProgress = studies.filter(({ status }) => status === 'in_progress')
  // Os nomes e os motivos ficam na página do distrito; aqui vale o número.
  const churchesNeedingAttention = igrejasQuePrecisamDeAtencao(churches, people, events, today)

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
  const outrosDeHoje = Math.max(0, todayEvents.length - (proximoDeHoje ? 1 : 0))

  /*
    O topo mostra a data, e continua se chamando "Visão do distrito".

    Dois títulos brigavam: o da página e o número da manchete. O nome da tela
    quem já sabe é quem a abriu — a data situa, e deixa o número mandar. Mas
    quem chega pelo leitor de tela não vê a tela: para ele o título continua
    dizendo onde está, que é o que uma data sozinha não diz.
  */
  if (!pronta) return <div className="app-loading" role="status">Abrindo o distrito…</div>

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

    <PlanoEstrategicoInicio />

    {/*
      Quatro cartões curtos: o número e o caminho. As listas inteiras — os
      compromissos do dia, os aniversariantes, as igrejas com pendência e as
      tarefas — ficam nas páginas que cada cartão abre.
    */}
    <div className="grade-inicio">
      <CartaoDoInicio to="/app/agenda" Icone={CalendarDays} titulo="Agenda">
        {proximoDeHoje
          ? <>
            <span className="cartao-agenda categoria-visual" {...atributosDaCategoria(identidadeDoCompromisso(proximoDeHoje.category))}>
              <span className="cartao-agenda__hora">{proximoDeHoje.startAt.slice(11, 16)}</span>
              <span className="cartao-agenda__corpo">
                <strong>{proximoDeHoje.title}</strong>
                <small>{churches.find(({ id }) => id === proximoDeHoje.churchId)?.name ?? proximoDeHoje.location ?? ''}</small>
              </span>
            </span>
            {outrosDeHoje > 0 && <small className="cartao-inicio__extra">e mais {outrosDeHoje} hoje</small>}
          </>
          : <span className="cartao-inicio__vazio">{todayEvents.length ? 'Nada mais marcado para hoje' : 'Nenhum compromisso hoje'}</span>}
      </CartaoDoInicio>

      <CartaoDoInicio to="/app/aniversarios" Icone={Cake} titulo="Aniversariantes">
        {todayBirthdays.length === 0
          ? <span className="cartao-inicio__vazio">Ninguém faz aniversário hoje</span>
          : <>
            <NumeroDoCartao valor={todayBirthdays.length} rotulo={todayBirthdays.length === 1 ? 'aniversariante hoje' : 'aniversariantes hoje'} />
            <span className="cartao-pessoas">
              {todayBirthdays.slice(0, 3).map(({ person, turningAge }) => <span className="cartao-pessoas__item" key={person.id}>
                <span className="inicial-redonda" aria-hidden="true">{person.name[0]}</span>
                <span><strong>{primeiroEUltimo(person.name)}</strong><small>{turningAge} anos</small></span>
              </span>)}
              {todayBirthdays.length > 3 && <small className="cartao-inicio__extra">e mais {todayBirthdays.length - 3}</small>}
            </span>
          </>}
      </CartaoDoInicio>

      <CartaoDoInicio to="/app/distrito/atencao" Icone={Church} titulo="Igrejas que precisam de atenção" tom={churchesNeedingAttention.length > 0 ? 'atencao' : 'neutro'}>
        {churchesNeedingAttention.length > 0
          ? <NumeroDoCartao valor={churchesNeedingAttention.length} rotulo={churchesNeedingAttention.length === 1 ? 'igreja para olhar' : 'igrejas para olhar'} />
          : <span className="cartao-inicio__vazio">Nenhuma pendência nas igrejas</span>}
      </CartaoDoInicio>

      <CartaoDoInicio to="/app/visitacao?aba=tarefas&filtro=atencao" Icone={SquareCheck} titulo="Tarefas que pedem atenção" tom={tarefasQuePedemAtencao > 0 ? 'atencao' : 'ok'}>
        {tarefasQuePedemAtencao > 0
          ? <>
            <NumeroDoCartao valor={tarefasQuePedemAtencao} rotulo="vencidas e de hoje" />
            {overdueTasks.length > 0 && <small className="cartao-inicio__extra">{overdueTasks.length === 1 ? '1 vencida' : `${overdueTasks.length} vencidas`}</small>}
          </>
          : <span className="cartao-inicio__vazio">Nada vencido nem para hoje</span>}
      </CartaoDoInicio>
    </div>
    {/*
      Visitação na tela inicial é um cartão curto. As perguntas, as respostas e
      as porcentagens moram na página de Visitação, aba Respostas; os pedidos
      em oração continuam no número "Em oração" logo acima.
    */}
    <ResumoDeVisitacao />
    <section className="dashboard-metrics" aria-label="Resumo do distrito"><Link to="/app/pessoas"><small>Pessoas</small><strong>{people.length}</strong><span>{people.filter(({ pastoralStatus }) => pastoralStatus === 'active').length} ativas</span></Link><Link to="/app/pessoas"><small>Acompanhar</small><strong>{people.filter(({ pastoralStatus }) => pastoralStatus === 'rescue').length}</strong><span>pessoas a resgatar</span></Link><Link to="/app/familias"><small>Famílias</small><strong>{families}</strong><span>laços cadastrados</span></Link><Link to="/app/aniversarios"><small>Aniversários hoje</small><strong>{todayBirthdays.length}</strong><span>ver mensagens</span></Link></section>
    <MetaFinanceiraResumo />
    <GoalsSummary />
    {/* Pessoas por igreja saiu daqui: a lista inteira vive no Distrito. */}
    <div className="grade-inicio">
      <CartaoDoInicio to="/app/fidelidade" Icone={ShieldCheck} titulo="Fidelidade">
        <span className="cartao-numeros">
          <NumeroDoCartao valor={fidelityCounts.tither} rotulo="dizimistas" />
          <NumeroDoCartao valor={fidelityCounts.nonSystematic} rotulo="não sistemáticos" />
          <NumeroDoCartao valor={fidelityCounts.nonTither} rotulo="não dizimistas" />
        </span>
      </CartaoDoInicio>

      <CartaoDoInicio to="/app/missionario" Icone={BookHeart} titulo="Interessados e estudos" marca={<MarcaDaArea area="discipleship" compacta />}>
        {!interestsWaiting.length && !studiesInProgress.length
          ? <span className="cartao-inicio__vazio">Nenhum contato pendente</span>
          : <>
            <span className="cartao-numeros">
              <NumeroDoCartao valor={interestsWaiting.length} rotulo="aguardando estudo" />
              <NumeroDoCartao valor={studiesInProgress.length} rotulo="estudo em andamento" />
            </span>
            {interestsWaiting[0] && <small className="cartao-inicio__extra">Aguardando: {interestsWaiting[0].name}</small>}
          </>}
      </CartaoDoInicio>

      <CartaoDoInicio to="/app/evangelismo" Icone={Megaphone} titulo="Evangelismo" marca={<MarcaDaArea area="discipleship" compacta />}>
        <span className="cartao-numeros">
          <NumeroDoCartao valor={campaignSummary.preparing} rotulo="em preparação" />
          <NumeroDoCartao valor={campaignSummary.happening} rotulo="acontecendo" />
          <NumeroDoCartao valor={tarefasUrgentes} rotulo="tarefas urgentes" />
        </span>
        {nextCampaign
          ? <small className="cartao-inicio__extra">{nextCampaign.name} · {new Intl.DateTimeFormat('pt-BR').format(new Date(`${nextCampaign.startDate}T12:00:00`))}</small>
          : <small className="cartao-inicio__extra">Nenhuma campanha futura</small>}
      </CartaoDoInicio>
    </div>

  </div>
}
