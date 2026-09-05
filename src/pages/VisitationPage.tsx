import { useReloadOnSync } from '../sync/useReloadOnSync'
/* eslint-disable @typescript-eslint/no-misused-promises */
import { CalendarPlus, CheckCircle2, ChevronRight, Circle, FileText, HeartHandshake, ListChecks, Plus, RotateCcw, UsersRound } from 'lucide-react'
import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuthVault } from '../auth/AuthVaultContext'
import { CareService } from '../care/service'
import { FOLLOW_UP_LABELS, VISIT_REASON_LABELS, type FollowUpEntity, type TaskEntity, type VisitEntity, type VisitRoundEntity } from '../care/types'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Field } from '../components/ui/Field'
import { DistrictService } from '../district/service'
import type { ChurchEntity } from '../district/types'
import { FamilyService } from '../families/service'
import type { FamilyEntity } from '../families/types'
import { PeopleService } from '../people/service'
import type { PersonEntity } from '../people/types'
import { previewLocalPdf } from '../reports/localPdf'
import { visitReportLines } from '../reports/areaReports'
import { PrayerRequestsPage } from './PrayerRequestsPage'

const care = new CareService(); const familiesService = new FamilyService(); const peopleService = new PeopleService(); const districts = new DistrictService()
const today = () => new Date().toISOString().slice(0, 10)

/** Uma área só para o pastoreio: visitas, acompanhamentos, orações e tarefas. */
const TABS = [
  ['visitas', 'Visitas'],
  ['acompanhamentos', 'Acompanhamentos'],
  ['oracao', 'Pedidos de oração'],
  ['tarefas', 'Tarefas'],
] as const
type VisitationTab = (typeof TABS)[number][0]

export function VisitationPage() {
  const { account, masterKey } = useAuthVault()
  const [search, setSearch] = useSearchParams()
  const tab = (TABS.some(([value]) => value === search.get('aba')) ? search.get('aba') : 'visitas') as VisitationTab
  const [visits, setVisits] = useState<VisitEntity[]>([])
  const [followUps, setFollowUps] = useState<FollowUpEntity[]>([])
  const [tasks, setTasks] = useState<TaskEntity[]>([])
  const [rounds, setRounds] = useState<VisitRoundEntity[]>([])
  const [families, setFamilies] = useState<FamilyEntity[]>([])
  const [people, setPeople] = useState<PersonEntity[]>([])
  const [churches, setChurches] = useState<ChurchEntity[]>([])
  const [taskTitle, setTaskTitle] = useState(''); const [taskDue, setTaskDue] = useState(today()); const [taskPriority, setTaskPriority] = useState<'low' | 'normal' | 'high'>('normal'); const [taskChurch, setTaskChurch] = useState(''); const [taskDescription, setTaskDescription] = useState('')
  const [roundName, setRoundName] = useState(''); const [roundChurch, setRoundChurch] = useState(''); const [roundFamilies, setRoundFamilies] = useState<Set<string>>(new Set())
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!account || !masterKey) return
    try {
      const district = await districts.getDistrict(account.id, masterKey)
      const [nextVisits, nextFollowUps, nextTasks, nextRounds, nextFamilies, nextPeople, nextChurches] = await Promise.all([
        care.listVisits(account.id, masterKey),
        care.listFollowUps(account.id, masterKey),
        care.listTasks(account.id, masterKey),
        care.listRounds(account.id, masterKey),
        familiesService.listFamilies(account.id, masterKey),
        peopleService.listPeople(account.id, masterKey),
        district ? districts.listChurches(account.id, masterKey, district.id) : [],
      ])
      setVisits(nextVisits); setFollowUps(nextFollowUps); setTasks(nextTasks); setRounds(nextRounds); setFamilies(nextFamilies); setPeople(nextPeople); setChurches(nextChurches)
    } catch (motivo) { setError(motivo instanceof Error ? motivo.message : 'Não foi possível abrir a visitação.') }
  }, [account, masterKey])
  useReloadOnSync(load)
  // No celular a faixa de abas rola: a aba escolhida fica sempre à vista.
  useEffect(() => { document.querySelector('.tab-bar .button--primary')?.scrollIntoView({ inline: 'center', block: 'nearest' }) }, [tab])

  const subjectName = (type: 'person' | 'family', id: string | null) => type === 'person'
    ? people.find((person) => person.id === id)?.name ?? 'Cadastro preservado'
    : families.find((family) => family.id === id)?.name ?? 'Cadastro preservado'
  const targetName = (visit: VisitEntity) => visit.targetType === 'family'
    ? families.find(({ id }) => id === visit.targetId)?.name
    : people.find(({ id }) => id === visit.targetId)?.name

  async function toggleFollow(follow: FollowUpEntity) {
    if (!account || !masterKey) return
    await care.updateFollowUp(account.id, masterKey, follow, follow.status === 'pending' ? 'completed' : 'pending')
    await load()
  }

  async function toggleTask(task: TaskEntity) {
    if (!account || !masterKey) return
    await care.updateTask(account.id, masterKey, task, task.status === 'pending' ? 'completed' : 'pending')
    await load()
  }

  async function createTask(event: FormEvent) {
    event.preventDefault()
    if (!account || !masterKey) return
    try {
      await care.createTask(account.id, masterKey, { title: taskTitle, description: taskDescription, dueAt: taskDue, priority: taskPriority, churchId: taskChurch || null, relatedType: null, relatedId: null, reminderMinutes: null })
      setTaskTitle(''); setTaskDescription('')
      await load()
    } catch (motivo) { setError(motivo instanceof Error ? motivo.message : 'Não foi possível criar a tarefa.') }
  }

  async function createRound(event: FormEvent) {
    event.preventDefault()
    if (!account || !masterKey) return
    try {
      await care.createRound(account.id, masterKey, roundName, roundChurch || null, [...roundFamilies])
      setRoundName(''); setRoundFamilies(new Set())
      await load()
    } catch (motivo) { setError(motivo instanceof Error ? motivo.message : 'Não foi possível iniciar a rodada.') }
  }

  const agora = today()

  return <div className="page-stack visitation-page">
    <header className="page-hero"><div><p className="eyebrow">Cuidado pastoral</p><h1>Visitação</h1></div>
      <div className="page-actions"><Link className="button button--secondary" to="/app/agenda/novo"><CalendarPlus />Agendar</Link><Link className="button" to="/app/visitas/nova"><Plus />Registrar visita</Link></div>
    </header>
    {error && <div className="alert alert--error" role="alert">{error}</div>}

    <nav className="tab-bar" aria-label="Áreas da visitação">
      {TABS.map(([value, label]) => <Button key={value} variant={tab === value ? 'primary' : 'secondary'} onClick={() => setSearch(value === 'visitas' ? {} : { aba: value })}>{label}</Button>)}
    </nav>

    {tab === 'visitas' && <>
      <Card title="Visitas registradas" action={<Button variant="secondary" icon={<FileText />} onClick={() => previewLocalPdf('Relatório de Visitações', visitReportLines(visits, rounds, 'Distrito'))}>Relatório</Button>}>
        {!visits.length
          ? <div className="empty-state"><HeartHandshake /><strong>Nenhuma visita registrada</strong><p>Uma visita espontânea não precisa de agendamento prévio.</p></div>
          : <div className="visit-list">{visits.map((visit) => { const version = visit.versions.at(-1)!; return <Link key={visit.id} to={`/app/visitas/${visit.id}`}>
            <span className="avatar"><UsersRound /></span>
            <span><strong>{targetName(visit) ?? 'Cadastro preservado'}</strong><small>{VISIT_REASON_LABELS[version.reason]} · {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(version.startAt))}</small></span>
            <span className="entity-badge">v{visit.currentVersion}</span>
            <ChevronRight />
          </Link> })}</div>}
      </Card>
      <Card title="Rodadas de visitação">
        <form className="round-form" onSubmit={createRound}>
          <div className="form-grid">
            <Field label="Nome da rodada" name="round-name" value={roundName} onChange={(event) => setRoundName(event.target.value)} required />
            <label className="field" htmlFor="round-church"><span className="field__label">Igreja (opcional)</span>
              <select id="round-church" className="field__input" value={roundChurch} onChange={(event) => setRoundChurch(event.target.value)}><option value="">Distrito inteiro</option>{churches.map((church) => <option key={church.id} value={church.id}>{church.name}</option>)}</select>
            </label>
          </div>
          <div className="family-selector">{families.filter((family) => !roundChurch || family.primaryChurchId === roundChurch).map((family) => <label key={family.id}>
            <input type="checkbox" checked={roundFamilies.has(family.id)} onChange={(event) => setRoundFamilies((current) => { const next = new Set(current); if (event.target.checked) next.add(family.id); else next.delete(family.id); return next })} />{family.name}
          </label>)}</div>
          <Button type="submit" disabled={!roundName || !roundFamilies.size} icon={<UsersRound />}>Iniciar rodada</Button>
        </form>
        <div className="round-list">{rounds.map((round) => { const total = round.targetFamilyIds.length; const visited = round.visitedFamilyIds.length; return <article key={round.id} className={round.status === 'completed' ? 'round-complete' : ''}>
          <span><strong>{round.name}</strong><small>{visited} de {total} famílias visitadas</small></span>
          <progress value={visited} max={total} aria-label={`Progresso da ${round.name}`} />
          <span className="entity-badge">{round.status === 'completed' ? 'Concluída' : 'Ativa'}</span>
        </article> })}</div>
      </Card>
    </>}

    {tab === 'acompanhamentos' && <Card title="Acompanhamentos">
      <p className="muted">Marque como concluído ao tocar. Cada acompanhamento vem de uma visita, pessoa ou família.</p>
      {!followUps.length
        ? <div className="empty-state"><RotateCcw /><strong>Nenhum acompanhamento</strong><p>Um acompanhamento nasce ao registrar uma visita.</p></div>
        : <div className="check-list">{followUps.map((follow) => <button key={follow.id} type="button" onClick={() => toggleFollow(follow)}>
          {follow.status === 'completed' ? <CheckCircle2 /> : <Circle />}
          <span><strong>{FOLLOW_UP_LABELS[follow.kind]}</strong><small>{subjectName(follow.subjectType, follow.subjectId)} · {follow.dueAt}</small></span>
        </button>)}</div>}
    </Card>}

    {tab === 'oracao' && <PrayerRequestsPage embedded />}

    {tab === 'tarefas' && <Card title="Tarefas">
      <form className="compact-task-form" onSubmit={createTask}>
        <Field label="Nova tarefa" name="care-task-title" value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} required />
        <Field label="Prazo" name="care-task-due" type="date" value={taskDue} onChange={(event) => setTaskDue(event.target.value)} required />
        <label className="field" htmlFor="task-priority"><span className="field__label">Prioridade</span>
          <select id="task-priority" className="field__input" value={taskPriority} onChange={(event) => setTaskPriority(event.target.value as typeof taskPriority)}>
            <option value="low">Baixa</option><option value="normal">Normal</option><option value="high">Alta</option>
          </select>
        </label>
        <label className="field" htmlFor="task-church"><span className="field__label">Igreja (opcional)</span>
          <select id="task-church" className="field__input" value={taskChurch} onChange={(event) => setTaskChurch(event.target.value)}><option value="">Sem vínculo</option>{churches.map((church) => <option key={church.id} value={church.id}>{church.name}</option>)}</select>
        </label>
        <label className="field full-span" htmlFor="task-description"><span className="field__label">Descrição opcional</span><textarea id="task-description" className="field__input" rows={2} value={taskDescription} onChange={(event) => setTaskDescription(event.target.value)} /></label>
        <Button type="submit" disabled={!taskTitle || !taskDue} icon={<Plus />}>Criar tarefa</Button>
      </form>
      {!tasks.length
        ? <div className="empty-state"><ListChecks /><strong>Nenhuma tarefa</strong></div>
        : <div className="check-list">{tasks.map((task) => <button key={task.id} type="button" className={task.status === 'pending' && task.dueAt < agora ? 'overdue' : ''} onClick={() => toggleTask(task)}>
          {task.status === 'completed' ? <CheckCircle2 /> : <Circle />}
          <span><strong>{task.title}</strong><small>{task.dueAt} · prioridade {task.priority}</small></span>
        </button>)}</div>}
    </Card>}
  </div>
}
