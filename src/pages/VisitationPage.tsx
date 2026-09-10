import { useReloadOnSync } from '../sync/useReloadOnSync'
/* eslint-disable @typescript-eslint/no-misused-promises */
import { CalendarPlus, CheckCircle2, Circle, FileText, ListChecks, Plus, RotateCcw, Search } from 'lucide-react'
import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { resumoDaVisitacao } from '../care/atencaoDaVisita'
import { VisitasPorIgreja, type FiltroDaVisitacao } from '../components/VisitasPorIgreja'
import type { ResumoDaVisitacao } from '../care/atencaoDaVisita'

/** Cada cartão é um número e o filtro daquele número. */
const CARTOES: Array<[FiltroDaVisitacao, string, string, keyof ResumoDaVisitacao]> = [
  ['todos', 'visitas', 'neutro', 'visitas'],
  ['urgente', 'urgentes', 'urgente', 'urgentes'],
  ['retorno', 'retornos', 'retorno', 'retornos'],
  ['atrasada', 'atrasadas', 'atrasada', 'atrasadas'],
  ['pendente', 'pendentes', 'pendente', 'pendentes'],
  ['semana', 'esta semana', 'neutro', 'semana'],
]
import { useAuthVault } from '../auth/AuthVaultContext'
import { localDateKey } from '../shared/dates'
import { CareService } from '../care/service'
import { FOLLOW_UP_KINDS, FOLLOW_UP_LABELS, type FollowUpEntity, type FollowUpKind, type TaskEntity, type VisitEntity } from '../care/types'
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

const diaCurto = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short' })
/* O meio-dia evita o dia a menos: "2026-09-20" sozinho é meia-noite em UTC. */
function diaLegivel(chave: string): string {
  const data = new Date(`${chave}T12:00:00`)
  return Number.isNaN(data.getTime()) ? chave : diaCurto.format(data).replace(/\sde\s/gu, ' ').replace(/\.(?=\s|$)/gu, '')
}

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
  const resumo = resumoDaVisitacao(visits, followUps, tasks)
  const formularioAberto = search.get('nova') === '1'
  const pendentes = tasks.filter(({ status }) => status === 'pending').sort((a, b) => a.dueAt.localeCompare(b.dueAt))
  const concluidas = tasks.filter(({ status }) => status !== 'pending')
  const [filtro, setFiltro] = useState<FiltroDaVisitacao>('todos')
  const [busca, setBusca] = useState('')

  return <div className="page-stack visitation-page">
    <header className="page-hero agenda-hero">
      <h1>Visitação</h1>
      <div className="acoes-do-topo">
        <Link className="botao-itinerario" to="/app/agenda/novo" aria-label="Agendar visita"><CalendarPlus aria-hidden="true" /></Link>
        <Link className="botao-itinerario botao-itinerario--forte" to="/app/visitas/nova" aria-label="Registrar visita"><Plus aria-hidden="true" /></Link>
      </div>
    </header>
    {error && <div className="alert alert--error" role="alert">{error}</div>}

    <nav className="tira-abas" aria-label="Áreas da visitação">
      {TABS.map(([value, label]) => <button key={value} type="button" aria-current={tab === value ? 'page' : undefined} className={`chip-aba ${tab === value ? 'chip-aba--ativa' : ''}`} onClick={() => setSearch(value === 'visitas' ? {} : { aba: value })}>{label}</button>)}
    </nav>

    {tab === 'visitas' && <>
      <div className="linha-de-busca">
        <div className="visitacao-busca">
          <Search aria-hidden="true" />
          <input type="search" className="field__input" value={busca} onChange={(event) => setBusca(event.target.value)} placeholder="Buscar pessoa ou igreja" aria-label="Buscar pessoa ou igreja" />
        </div>
        <button type="button" className="botao-itinerario" aria-label="Relatório de visitações" onClick={() => previewLocalPdf('Relatório de Visitações', visitReportLines(visits, 'Distrito'))}><FileText aria-hidden="true" /></button>
      </div>

      {/*
        Os cartões são os filtros. Ter uma tira de números em cima e outra de
        filtros embaixo dizendo as mesmas cinco palavras era pedir para o pastor
        ler duas vezes a mesma coisa.
      */}
      <div className="cartoes-resumo" role="group" aria-label="Filtrar visitas">
        {CARTOES.map(([valor, rotulo, tom, campo]) => <button
          key={valor}
          type="button"
          aria-pressed={filtro === valor}
          className={`cartao-resumo cartao-resumo--${tom} ${filtro === valor ? 'cartao-resumo--ativo' : ''}`}
          onClick={() => setFiltro(valor)}
        ><strong>{resumo[campo]}</strong><small>{rotulo}</small></button>)}
      </div>

      <VisitasPorIgreja visits={visits} followUps={followUps} tasks={tasks} churches={churches} nomeDoAlvo={targetName} filtro={filtro} busca={busca} />
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

    {tab === 'tarefas' && <>
      <div className="linha-de-busca">
        <p className="conta-de-tarefas">{pendentes.length} {pendentes.length === 1 ? 'tarefa aberta' : 'tarefas abertas'}</p>
        <button type="button" className="botao-novo" onClick={() => setSearch({ aba: 'tarefas', ...(formularioAberto ? {} : { nova: '1' }) })}>{formularioAberto ? 'Fechar' : 'Nova tarefa'}</button>
      </div>

      {formularioAberto && <Card title="Nova tarefa">
        <form className="compact-task-form" onSubmit={createTask}>
          <Field label="Tarefa" name="care-task-title" value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} required />
          <Field label="Prazo" name="care-task-due" type="date" value={taskDue} onChange={(event) => setTaskDue(event.target.value)} required />
          <Field label="Avisar em" name="care-task-reminder" type="datetime-local" value={taskRemindAt} onChange={(event) => setTaskRemindAt(event.target.value)} />
          <label className="field" htmlFor="task-priority"><span className="field__label">Prioridade</span>
            <select id="task-priority" className="field__input" value={taskPriority} onChange={(event) => setTaskPriority(event.target.value as typeof taskPriority)}>
              <option value="low">Baixa</option><option value="normal">Normal</option><option value="high">Alta</option>
            </select>
          </label>
          <label className="field" htmlFor="task-church"><span className="field__label">Igreja</span>
            <select id="task-church" className="field__input" value={taskChurch} onChange={(event) => setTaskChurch(event.target.value)}><option value="">Sem vínculo</option>{churches.map((church) => <option key={church.id} value={church.id}>{church.name}</option>)}</select>
          </label>
          <label className="field full-span" htmlFor="task-description"><span className="field__label">Descrição</span><textarea id="task-description" className="field__input" rows={2} value={taskDescription} onChange={(event) => setTaskDescription(event.target.value)} /></label>
          <Button type="submit" disabled={!taskTitle || !taskDue} icon={<Plus />}>Criar tarefa</Button>
        </form>
      </Card>}

      {/*
        A lista vem antes do formulário: quem abre Tarefas quer ver o que
        precisa fazer, não preencher um formulário. Antes eram sete campos
        ocupando a tela inteira e a primeira tarefa só aparecia depois deles.
      */}
      {!tasks.length
        ? <div className="empty-state"><ListChecks /><strong>Nenhuma tarefa</strong></div>
        : <div className="lista-tarefas-cuidado">{[...pendentes, ...concluidas].map((task) => {
          const atrasada = task.status === 'pending' && task.dueAt < agora
          return <button key={task.id} type="button" className={`linha-tarefa ${task.status === 'completed' ? 'linha-tarefa--feita' : ''}`} onClick={() => toggleTask(task)}>
            {task.status === 'completed' ? <CheckCircle2 className="linha-tarefa__marca" /> : <Circle className="linha-tarefa__marca" />}
            <span className="linha-tarefa__corpo">
              <strong>{task.title}</strong>
              <small>{diaLegivel(task.dueAt)}{task.churchId ? ` · ${churches.find(({ id }) => id === task.churchId)?.name ?? ''}` : ''}</small>
            </span>
            {atrasada && <span className="selo-atencao selo-atencao--atrasada">Atrasada</span>}
            {task.priority === 'high' && task.status === 'pending' && <span className="selo-atencao selo-atencao--urgente">Alta</span>}
          </button>
        })}</div>}
    </>}
  </div>
}
