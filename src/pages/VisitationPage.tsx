import { useReloadOnSync } from '../sync/useReloadOnSync'
/* eslint-disable @typescript-eslint/no-misused-promises */
import { CalendarPlus, CheckCircle2, Circle, FileText, ListChecks, Plus, RotateCcw } from 'lucide-react'
import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { agruparVisitasPorIgreja } from '../care/visitasPorIgreja'
import { resumoDaVisitacao } from '../care/atencaoDaVisita'
import { VisitasPorIgreja } from '../components/VisitasPorIgreja'
import { useAuthVault } from '../auth/AuthVaultContext'
import { localDateKey } from '../shared/dates'
import { CareService } from '../care/service'
import { FOLLOW_UP_KINDS, FOLLOW_UP_LABELS, type FollowUpEntity, type FollowUpKind, type TaskEntity, type VisitEntity } from '../care/types'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { CountUp } from '../components/ui/CountUp'
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
const today = localDateKey

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
  const [families, setFamilies] = useState<FamilyEntity[]>([])
  const [people, setPeople] = useState<PersonEntity[]>([])
  const [churches, setChurches] = useState<ChurchEntity[]>([])
  const [taskTitle, setTaskTitle] = useState(''); const [taskDue, setTaskDue] = useState(today()); const [taskRemindAt, setTaskRemindAt] = useState(''); const [taskPriority, setTaskPriority] = useState<'low' | 'normal' | 'high'>('normal'); const [taskChurch, setTaskChurch] = useState(''); const [taskDescription, setTaskDescription] = useState('')
  const [followSubjectType, setFollowSubjectType] = useState<'person' | 'family'>('person'); const [followSubjectId, setFollowSubjectId] = useState(''); const [followChurch, setFollowChurch] = useState(''); const [followKind, setFollowKind] = useState<FollowUpKind>('revisit'); const [followDue, setFollowDue] = useState(today()); const [followNotes, setFollowNotes] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!account || !masterKey) return
    try {
      const district = await districts.getDistrict(account.id, masterKey)
      const [nextVisits, nextFollowUps, nextTasks, nextFamilies, nextPeople, nextChurches] = await Promise.all([
        care.listVisits(account.id, masterKey),
        care.listFollowUps(account.id, masterKey),
        care.listTasks(account.id, masterKey),
        familiesService.listFamilies(account.id, masterKey),
        peopleService.listPeople(account.id, masterKey),
        district ? districts.listChurches(account.id, masterKey, district.id) : [],
      ])
      setVisits(nextVisits); setFollowUps(nextFollowUps); setTasks(nextTasks); setFamilies(nextFamilies); setPeople(nextPeople); setChurches(nextChurches); setError('')
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

  /**
   * Apagar a visita direto da lista.
   *
   * Antes só havia "registrar correção" dentro da visita, e nada apagava: uma
   * visita começada por engano ficava na lista para sempre.
   */

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
      await care.createTask(account.id, masterKey, { title: taskTitle, description: taskDescription, dueAt: taskDue, remindAt: taskRemindAt || null, priority: taskPriority, churchId: taskChurch || null, relatedType: null, relatedId: null, reminderMinutes: null })
      setTaskTitle(''); setTaskDescription(''); setTaskRemindAt('')
      await load()
    } catch (motivo) { setError(motivo instanceof Error ? motivo.message : 'Não foi possível criar a tarefa.') }
  }

  async function createFollowUp(event: FormEvent) {
    event.preventDefault()
    if (!account || !masterKey) return
    try {
      await care.createFollowUp(account.id, masterKey, { visitId: '', subjectType: followSubjectType, subjectId: followSubjectId, churchId: followChurch, kind: followKind, dueAt: followDue, notes: followNotes })
      setFollowSubjectId(''); setFollowNotes(''); setSearch({ aba: 'acompanhamentos' })
      await load()
    } catch (motivo) { setError(motivo instanceof Error ? motivo.message : 'Não foi possível criar o acompanhamento.') }
  }


  const agora = today()
  const agrupado = agruparVisitasPorIgreja(visits, churches)
  const resumo = resumoDaVisitacao(visits, followUps, tasks)

  return <div className="page-stack visitation-page">
    <header className="page-hero"><div><p className="eyebrow">Cuidado pastoral</p><h1>Visitação</h1></div>
      <div className="page-actions"><Link className="button button--secondary" to="/app/agenda/novo"><CalendarPlus />Agendar</Link><Link className="button" to="/app/visitas/nova"><Plus />Registrar visita</Link></div>
    </header>
    {error && <div className="alert alert--error" role="alert">{error}</div>}

    <nav className="tab-bar" aria-label="Áreas da visitação">
      {TABS.map(([value, label]) => <Button key={value} variant={tab === value ? 'primary' : 'secondary'} onClick={() => setSearch(value === 'visitas' ? {} : { aba: value })}>{label}</Button>)}
    </nav>

    {tab === 'visitas' && <>
      <section className="manchete" aria-label="Pessoas visitadas no distrito">
        <span className="manchete__num"><CountUp value={agrupado.pessoasNoDistrito} /></span>
        <p className="manchete__txt">{agrupado.pessoasNoDistrito === 1 ? 'pessoa visitada no distrito' : 'pessoas visitadas no distrito'}</p>
      </section>
      <dl className="estrato">
        <div><dt>Visitas</dt><dd>{resumo.visitas}</dd></div>
        <div><dt>Urgentes</dt><dd className={resumo.urgentes ? 'atencao' : ''}>{resumo.urgentes}</dd></div>
        <div><dt>Retornos</dt><dd>{resumo.retornos}</dd></div>
        <div><dt>Atrasadas</dt><dd className={resumo.atrasadas ? 'atencao' : ''}>{resumo.atrasadas}</dd></div>
      </dl>
      <Card title="Visitas registradas" action={<Button variant="secondary" icon={<FileText />} onClick={() => previewLocalPdf('Relatório de Visitações', visitReportLines(visits, 'Distrito'))}>Relatório</Button>}>
        <VisitasPorIgreja visits={visits} followUps={followUps} tasks={tasks} churches={churches} nomeDoAlvo={targetName} />
      </Card>
    </>}

    {tab === 'acompanhamentos' && <Card title="Acompanhamentos" action={<Button variant="secondary" icon={<Plus />} onClick={() => setSearch({ aba: 'acompanhamentos', novo: '1' })}>Novo acompanhamento</Button>}>
      {search.get('novo') === '1' && <form className="compact-task-form" onSubmit={createFollowUp}><label className="field"><span className="field__label">Acompanhar</span><select className="field__input" value={followSubjectType} onChange={(event) => { setFollowSubjectType(event.target.value as typeof followSubjectType); setFollowSubjectId('') }}><option value="person">Pessoa</option><option value="family">Família</option></select></label><label className="field"><span className="field__label">Igreja</span><select className="field__input" value={followChurch} onChange={(event) => { setFollowChurch(event.target.value); setFollowSubjectId('') }} required><option value="">Selecione</option>{churches.map((church) => <option key={church.id} value={church.id}>{church.name}</option>)}</select></label><label className="field"><span className="field__label">{followSubjectType === 'person' ? 'Pessoa' : 'Família'}</span><select className="field__input" value={followSubjectId} onChange={(event) => setFollowSubjectId(event.target.value)} required><option value="">Selecione</option>{(followSubjectType === 'person' ? people.filter((person) => person.currentChurchId === followChurch) : families.filter((family) => family.primaryChurchId === followChurch)).map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label><label className="field"><span className="field__label">Próximo cuidado</span><select className="field__input" value={followKind} onChange={(event) => setFollowKind(event.target.value as FollowUpKind)}>{FOLLOW_UP_KINDS.map((kind) => <option key={kind} value={kind}>{FOLLOW_UP_LABELS[kind]}</option>)}</select></label><Field label="Data" name="follow-due" type="date" value={followDue} onChange={(event) => setFollowDue(event.target.value)} required /><label className="field full-span"><span className="field__label">Observação opcional</span><textarea className="field__input" rows={2} maxLength={2000} value={followNotes} onChange={(event) => setFollowNotes(event.target.value)} /></label><div className="form-actions"><Button type="submit" disabled={!followChurch || !followSubjectId || !followDue}>Criar acompanhamento</Button><Button type="button" variant="secondary" onClick={() => setSearch({ aba: 'acompanhamentos' })}>Cancelar</Button></div></form>}
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
        <Field label="Avisar em (opcional)" name="care-task-reminder" type="datetime-local" value={taskRemindAt} onChange={(event) => setTaskRemindAt(event.target.value)} hint="O aviso funciona enquanto o Apoio Pastoral estiver aberto e desbloqueado. Não use como único lembrete de um compromisso crítico." />
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
