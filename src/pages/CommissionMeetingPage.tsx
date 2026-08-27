import { CalendarPlus, Check, ChevronDown, ChevronUp, Copy, FileText, Printer, Send, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuthVault } from '../auth/AuthVaultContext'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { agendaText, canDeliberate, reorderAgenda, requiredMajority } from '../commissions/core'
import { CommissionService } from '../commissions/service'
import type { CommissionAgendaItem, CommissionEntity, CommissionMeetingData, CommissionTaskData, DecisionDestination, DecisionType, TaskStatus } from '../commissions/types'
import { DistrictService } from '../district/service'
import { PeopleService } from '../people/service'
import type { PersonEntity } from '../people/types'

const service = new CommissionService()
const districts = new DistrictService()
const peopleService = new PeopleService()

const emptyItem = (): CommissionAgendaItem => ({ id: crypto.randomUUID(), order: 0, title: '', department: '', description: '', proposal: '', decisionType: 'approve', customDecisionType: '', destination: 'internal', responsibleId: '', dueDate: '', privateNotes: '' })
const decisionLabels: Record<DecisionType, string> = { approve: 'Aprovar', recommend: 'Recomendar', record: 'Registrar', grant: 'Conceder', refer: 'Encaminhar', custom: 'Personalizado' }
const destinationLabels: Record<DecisionDestination, string> = { internal: 'Execução interna', administrative: 'Reunião Administrativa', regular_church: 'Reunião regular da igreja', record: 'Somente registro', other: 'Outro destino' }
const statusLabels: Record<TaskStatus, string> = { pending: 'Pendente', in_progress: 'Em andamento', completed: 'Concluída', cancelled: 'Cancelada' }
const resultLabels = { approved: 'Aprovado', rejected: 'Rejeitado', deferred: 'Adiado', recorded: 'Registrado' }

export function CommissionMeetingPage() {
  const { meetingId = '' } = useParams()
  const navigate = useNavigate()
  const { account, masterKey } = useAuthVault()
  const [meeting, setMeeting] = useState<CommissionEntity<CommissionMeetingData> | null>(null)
  const [people, setPeople] = useState<PersonEntity[]>([])
  const [churchName, setChurchName] = useState('Igreja')
  const [quorum, setQuorum] = useState(0)
  const [tasks, setTasks] = useState<CommissionEntity<CommissionTaskData>[]>([])
  const [item, setItem] = useState(emptyItem())
  const [editingItemId, setEditingItemId] = useState('')
  const [tab, setTab] = useState<'reuniao' | 'pauta' | 'documentos' | 'pendencias'>('reuniao')
  const [votes, setVotes] = useState<Record<string, { favorable: string; against: string; abstentions: string }>>({})
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!account || !masterKey) return
    const found = await service.meeting(account.id, masterKey, meetingId)
    if (!found) return
    setMeeting(found)
    const config = await service.config(account.id, masterKey, found.churchId)
    setQuorum(found.kind === 'board' ? config?.boardQuorum ?? 0 : config?.administrativeQuorum ?? 0)
    setPeople((await peopleService.listPeople(account.id, masterKey)).filter((person) => person.currentChurchId === found.churchId))
    const district = await districts.getDistrict(account.id, masterKey)
    const churches = district ? await districts.listChurches(account.id, masterKey, district.id) : []
    setChurchName(churches.find((church) => church.id === found.churchId)?.name ?? 'Igreja')
    setTasks(await service.tasks(account.id, masterKey, meetingId))
  }, [account, masterKey, meetingId])

  useEffect(() => { void load() }, [load])
  const personName = useCallback((id: string) => people.find((person) => person.id === id)?.name ?? (id ? 'Pessoa não localizada' : 'A confirmar'), [people])
  const present = (meeting?.participantIds.length ?? 0) + (meeting?.votingGuestNames.length ?? 0)
  const hasQuorum = canDeliberate(present, quorum)
  const frozen = Boolean(meeting?.finalizedAt)
  const agendaDoc = useMemo(() => meeting ? service.agendaDocument(meeting, churchName, personName) : '', [meeting, churchName, personName])
  const minutesDoc = useMemo(() => meeting ? service.minutesDocument(meeting, churchName, quorum, personName) : '', [meeting, churchName, quorum, personName])

  async function run(action: () => Promise<void>, success?: string) {
    setBusy(true); setError(''); setMessage('')
    try { await action(); if (success) setMessage(success) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível concluir esta ação.') } finally { setBusy(false) }
  }

  function change(patch: Partial<CommissionMeetingData>) { if (meeting && !frozen) setMeeting({ ...meeting, ...patch, updatedAt: new Date().toISOString() }) }
  async function saveMeeting() {
    if (!account || !masterKey || !meeting) return
    await run(async () => { setMeeting(await service.saveMeeting(account.id, masterKey, meeting, meeting.id)) }, 'Reunião salva.')
  }

  function toggleParticipant(id: string) {
    if (!meeting) return
    change({ participantIds: meeting.participantIds.includes(id) ? meeting.participantIds.filter((value) => value !== id) : [...meeting.participantIds, id] })
  }

  async function submitItem() {
    if (!meeting) return
    if (!item.title.trim() || !item.proposal.trim()) { setError('Informe o assunto e a proposta.'); return }
    const next = editingItemId
      ? meeting.agenda.map((entry) => entry.id === editingItemId ? { ...item, order: entry.order } : entry)
      : [...meeting.agenda, { ...item, order: meeting.agenda.length + 1 }]
    if (!account || !masterKey) return
    await run(async () => { setMeeting(await service.saveMeeting(account.id, masterKey, { ...meeting, agenda: next, updatedAt: new Date().toISOString() }, meeting.id)); setItem(emptyItem()); setEditingItemId('') }, editingItemId ? 'Assunto atualizado.' : 'Assunto adicionado à pauta.')
  }

  function editItem(entry: CommissionAgendaItem) { setItem(entry); setEditingItemId(entry.id); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  async function saveAgenda(agenda: CommissionAgendaItem[], success: string) { if (!account || !masterKey || !meeting) return; await run(async () => { setMeeting(await service.saveMeeting(account.id, masterKey, { ...meeting, agenda, updatedAt: new Date().toISOString() }, meeting.id)) }, success) }
  function removeItem(id: string) { if (meeting) void saveAgenda(meeting.agenda.filter((entry) => entry.id !== id).map((entry, index) => ({ ...entry, order: index + 1 })), 'Assunto removido.') }
  function moveItem(index: number, target: number) { if (meeting) void saveAgenda(reorderAgenda(meeting.agenda, index, target), 'Ordem atualizada.') }

  async function vote(entry: CommissionAgendaItem) {
    if (!account || !masterKey || !meeting) return
    const draft = votes[entry.id] ?? { favorable: '0', against: '0', abstentions: '0' }
    await run(async () => { setMeeting(await service.confirmVote(account.id, masterKey, meeting.id, entry.id, Number(draft.favorable), Number(draft.against), Number(draft.abstentions))) }, 'Votação confirmada e registrada na ata.')
  }

  function updateFinalText(entry: CommissionAgendaItem, finalText: string) {
    if (!meeting || !entry.vote) return
    change({ agenda: meeting.agenda.map((candidate) => candidate.id === entry.id ? { ...candidate, vote: { ...candidate.vote!, finalText } } : candidate) })
  }

  async function forward(entry: CommissionAgendaItem) {
    if (!account || !masterKey || !meeting) return
    await run(async () => {
      const target = await service.forwardToAdministrative(account.id, masterKey, meeting.id, entry.id)
      setMessage(`Assunto encaminhado. A Reunião Administrativa foi preparada.`)
      void navigate(`/app/comissoes/${target.id}`)
    })
  }

  async function createTask(entry: CommissionAgendaItem) {
    if (!account || !masterKey || !meeting) return
    await run(async () => { await service.createTask(account.id, masterKey, meeting, entry); setTasks(await service.tasks(account.id, masterKey, meeting.id)); setTab('pendencias') }, 'Pendência criada.')
  }

  async function setTaskStatus(taskId: string, status: TaskStatus) {
    if (!account || !masterKey) return
    await run(async () => { await service.updateTaskStatus(account.id, masterKey, taskId, status); setTasks(await service.tasks(account.id, masterKey, meetingId)) }, 'Situação atualizada.')
  }

  async function addToAgenda(taskId: string) {
    if (!account || !masterKey) return
    await run(async () => { await service.addTaskToAgenda(account.id, masterKey, taskId); setTasks(await service.tasks(account.id, masterKey, meetingId)) }, 'Pendência adicionada à Agenda pastoral.')
  }

  async function copy(text: string) { await navigator.clipboard.writeText(text); setMessage('Texto copiado.') }
  async function finalize() {
    if (!account || !masterKey || !meeting) return
    await run(async () => { setMeeting(await service.finalizeMeeting(account.id, masterKey, meeting.id)) }, 'Ata finalizada. O histórico desta reunião está protegido.')
  }

  if (!meeting) return <div className="app-loading">Abrindo reunião…</div>
  const memberOptions = people

  return <div className="page-stack commission-print-root">
    <Link className="text-link back-link no-print" to="/app/comissoes">Voltar a Comissões</Link>
    <header className="page-hero"><div><p className="eyebrow">{meeting.kind === 'board' ? 'Comissão Diretiva' : 'Reunião Administrativa'}</p><h1>{meeting.date || 'Rascunho de reunião'}</h1><p>{churchName} · {present} com voto · quórum mínimo {quorum || 'não configurado'}</p></div><span className={`status-pill ${hasQuorum ? 'status-pill--success' : 'status-pill--warning'}`}>{hasQuorum ? 'Quórum confirmado' : 'Sem quórum'}</span></header>
    {frozen && <div className="alert alert--success" role="status">Ata finalizada. A reunião está disponível somente para consulta, cópia e impressão.</div>}
    {message && <div className="alert alert--success" role="status">{message}</div>}
    {error && <div className="alert alert--error" role="alert">{error}</div>}
    <div className="filter-bar no-print" role="tablist" aria-label="Seções da reunião">
      <Button variant={tab === 'reuniao' ? 'primary' : 'secondary'} onClick={() => setTab('reuniao')}>Reunião</Button>
      <Button variant={tab === 'pauta' ? 'primary' : 'secondary'} onClick={() => setTab('pauta')}>Pauta e votação</Button>
      <Button variant={tab === 'documentos' ? 'primary' : 'secondary'} onClick={() => setTab('documentos')}>Agenda e ata</Button>
      <Button variant={tab === 'pendencias' ? 'primary' : 'secondary'} onClick={() => setTab('pendencias')}>Pendências ({tasks.length})</Button>
    </div>

    {tab === 'reuniao' && <>
      <Card title="Dados da reunião"><div className="form-grid">
        <label className="field"><span className="field__label">Data</span><input className="field__input" disabled={frozen} type="date" value={meeting.date} onChange={(event) => change({ date: event.target.value })} /></label>
        <label className="field"><span className="field__label">Horário</span><input className="field__input" disabled={frozen} type="time" value={meeting.time} onChange={(event) => change({ time: event.target.value })} /></label>
        <label className="field"><span className="field__label">Local</span><input className="field__input" disabled={frozen} value={meeting.location} onChange={(event) => change({ location: event.target.value })} /></label>
        <label className="field"><span className="field__label">Presidente</span><select className="field__input" disabled={frozen} value={meeting.presidentId} onChange={(event) => change({ presidentId: event.target.value })}><option value="">Selecionar</option>{memberOptions.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
        <label className="field"><span className="field__label">Secretário(a)</span><select className="field__input" disabled={frozen} value={meeting.secretaryId} onChange={(event) => change({ secretaryId: event.target.value })}><option value="">Selecionar</option>{memberOptions.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
        <label className="field"><span className="field__label">Oração</span><input className="field__input" disabled={frozen} value={meeting.openingPrayer} onChange={(event) => change({ openingPrayer: event.target.value })} /></label>
      </div><label className="field"><span className="field__label">Reflexão</span><textarea className="field__input" disabled={frozen} value={meeting.reflection} onChange={(event) => change({ reflection: event.target.value })} /></label><label className="field"><span className="field__label">Observações para a ata</span><textarea className="field__input" disabled={frozen} value={meeting.notes} onChange={(event) => change({ notes: event.target.value })} /></label></Card>
      <Card title="Participantes"><p>Marque quem esteve presente e teve direito a voto.</p><div className="checkbox-grid">{memberOptions.map((person) => <label className="choice-card" key={person.id}><input type="checkbox" disabled={frozen} checked={meeting.participantIds.includes(person.id)} onChange={() => toggleParticipant(person.id)} /><span>{person.name}</span></label>)}</div><div className="form-grid"><label className="field"><span className="field__label">Convidados</span><textarea className="field__input" disabled={frozen} placeholder="Um nome fictício por linha" value={meeting.guestNames.join('\n')} onChange={(event) => change({ guestNames: event.target.value.split('\n').map((value) => value.trim()).filter(Boolean) })} /></label><label className="field"><span className="field__label">Convidados com voz e voto</span><textarea className="field__input" disabled={frozen} placeholder="Um nome fictício por linha" value={meeting.votingGuestNames.join('\n')} onChange={(event) => change({ votingGuestNames: event.target.value.split('\n').map((value) => value.trim()).filter(Boolean) })} /></label></div></Card>
      {!frozen && <Button disabled={busy} onClick={() => void saveMeeting()} icon={<Check />}>Salvar reunião</Button>}
    </>}

    {tab === 'pauta' && <>
      {!frozen && <Card title={editingItemId ? 'Editar assunto' : 'Novo assunto'}><div className="form-grid">
        <label className="field"><span className="field__label">Assunto</span><input className="field__input" value={item.title} onChange={(event) => setItem({ ...item, title: event.target.value })} /></label>
        <label className="field"><span className="field__label">Área</span><input className="field__input" value={item.department} onChange={(event) => setItem({ ...item, department: event.target.value })} /></label>
        <label className="field"><span className="field__label">Tipo</span><select className="field__input" value={item.decisionType} onChange={(event) => setItem({ ...item, decisionType: event.target.value as DecisionType })}>{Object.entries(decisionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        {item.decisionType === 'custom' && <label className="field"><span className="field__label">Tipo personalizado</span><input className="field__input" value={item.customDecisionType} onChange={(event) => setItem({ ...item, customDecisionType: event.target.value })} /></label>}
        <label className="field"><span className="field__label">Responsável</span><select className="field__input" value={item.responsibleId} onChange={(event) => setItem({ ...item, responsibleId: event.target.value })}><option value="">A definir</option>{memberOptions.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
        <label className="field"><span className="field__label">Prazo</span><input className="field__input" type="date" value={item.dueDate} onChange={(event) => setItem({ ...item, dueDate: event.target.value })} /></label>
        <label className="field"><span className="field__label">Destino</span><select className="field__input" value={item.destination} onChange={(event) => setItem({ ...item, destination: event.target.value as DecisionDestination })}>{Object.entries(destinationLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      </div><label className="field"><span className="field__label">Descrição</span><textarea className="field__input field__textarea" value={item.description} onChange={(event) => setItem({ ...item, description: event.target.value })} /></label><label className="field"><span className="field__label">Proposta</span><textarea className="field__input field__textarea" value={item.proposal} onChange={(event) => setItem({ ...item, proposal: event.target.value })} /></label><label className="field"><span className="field__label">Anotações privadas</span><textarea className="field__input field__textarea" value={item.privateNotes} onChange={(event) => setItem({ ...item, privateNotes: event.target.value })} /></label><div className="form-actions"><Button disabled={busy} onClick={() => void submitItem()}>{editingItemId ? 'Atualizar assunto' : 'Adicionar à pauta'}</Button>{editingItemId && <Button variant="secondary" onClick={() => { setItem(emptyItem()); setEditingItemId('') }}>Cancelar edição</Button>}</div></Card>}
      <Card title="Ordem dos assuntos">{meeting.agenda.length ? <div className="entity-list">{meeting.agenda.map((entry, index) => {
        const draft = votes[entry.id] ?? { favorable: '0', against: '0', abstentions: '0' }
        return <article className="entity-row commission-agenda-item" key={entry.id}><div><strong>{entry.order}. {entry.title}</strong><small>{decisionLabels[entry.decisionType]} · {destinationLabels[entry.destination]}{entry.department ? ` · ${entry.department}` : ''}</small>{entry.sourceVoteNumber && <small>Voto de origem: {entry.sourceVoteNumber}</small>}<p>{agendaText(entry)}</p>{entry.responsibleId && <small>Responsável: {personName(entry.responsibleId)}{entry.dueDate ? ` · prazo ${entry.dueDate}` : ''}</small>}
          {entry.vote ? <div className="decision-result"><strong>{entry.vote.voteNumber ?? 'Decisão sem número'} · {resultLabels[entry.vote.result]}</strong><span>{entry.vote.favorable} favoráveis · {entry.vote.against} contrários · {entry.vote.abstentions} abstenções</span><label className="field"><span className="field__label">Texto final da ata</span><textarea className="field__input field__textarea" disabled={frozen} value={entry.vote.finalText} onChange={(event) => updateFinalText(entry, event.target.value)} /></label></div> : <div className="vote-grid"><label className="field"><span className="field__label">Favoráveis</span><input className="field__input" type="number" min="0" value={draft.favorable} onChange={(event) => setVotes({ ...votes, [entry.id]: { ...draft, favorable: event.target.value } })} /></label><label className="field"><span className="field__label">Contrários</span><input className="field__input" type="number" min="0" value={draft.against} onChange={(event) => setVotes({ ...votes, [entry.id]: { ...draft, against: event.target.value } })} /></label><label className="field"><span className="field__label">Abstenções</span><input className="field__input" type="number" min="0" value={draft.abstentions} onChange={(event) => setVotes({ ...votes, [entry.id]: { ...draft, abstentions: event.target.value } })} /></label><div><small>Maioria necessária: {requiredMajority(Number(draft.favorable), Number(draft.against))}</small><Button disabled={busy || frozen || (!hasQuorum && entry.decisionType !== 'record')} onClick={() => void vote(entry)}>Confirmar votação</Button></div></div>}
        </div><div className="form-actions no-print">{!frozen && !entry.vote && <><Button variant="secondary" onClick={() => editItem(entry)}>Editar</Button><Button variant="secondary" disabled={index === 0} aria-label="Mover para cima" onClick={() => moveItem(index, index - 1)} icon={<ChevronUp />} /><Button variant="secondary" disabled={index === meeting.agenda.length - 1} aria-label="Mover para baixo" onClick={() => moveItem(index, index + 1)} icon={<ChevronDown />} /><Button variant="danger" aria-label="Remover assunto" onClick={() => removeItem(entry.id)} icon={<Trash2 />} /></>}{entry.vote?.result === 'approved' && entry.responsibleId && <Button variant="secondary" onClick={() => void createTask(entry)}>Criar pendência</Button>}{meeting.kind === 'board' && entry.destination === 'administrative' && entry.vote?.result === 'approved' && <Button onClick={() => void forward(entry)} icon={<Send />}>Encaminhar</Button>}</div></article>
      })}</div> : <div className="empty-state"><FileText /><strong>Nenhum assunto na pauta</strong></div>}</Card>
      {!frozen && meeting.agenda.length > 0 && <Button disabled={busy} onClick={() => void saveMeeting()} icon={<Check />}>Salvar pauta e textos</Button>}
    </>}

    {tab === 'documentos' && <><Card title="Agenda da reunião" action={<FileText />}><pre className="preserved-text commission-document">{agendaDoc}</pre><div className="form-actions no-print"><Button variant="secondary" onClick={() => void copy(agendaDoc)} icon={<Copy />}>Copiar agenda</Button><Button variant="secondary" onClick={() => window.print()} icon={<Printer />}>Imprimir / salvar em PDF</Button></div></Card><Card title="Ata da reunião"><pre className="preserved-text commission-document">{minutesDoc}</pre><div className="form-actions no-print"><Button variant="secondary" onClick={() => void copy(minutesDoc)} icon={<Copy />}>Copiar ata</Button><Button variant="secondary" onClick={() => window.print()} icon={<Printer />}>Imprimir / salvar em PDF</Button>{!frozen && <Button disabled={busy} onClick={() => void finalize()}>Finalizar ata</Button>}</div></Card></>}

    {tab === 'pendencias' && <Card title="Pendências da reunião">{tasks.length ? <div className="entity-list">{tasks.map((task) => <div className="entity-row" key={task.id}><span><strong>{task.title}</strong><small>Responsável: {personName(task.responsibleId)} · prazo {task.dueDate || 'a definir'}</small>{task.agendaEventId && <small>Adicionada à Agenda pastoral</small>}</span><div className="form-actions"><label className="field"><span className="field__label">Situação</span><select className="field__input" value={task.status} onChange={(event) => void setTaskStatus(task.id, event.target.value as TaskStatus)}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><Button variant="secondary" disabled={Boolean(task.agendaEventId)} onClick={() => void addToAgenda(task.id)} icon={<CalendarPlus />}>{task.agendaEventId ? 'Na Agenda' : 'Adicionar à Agenda'}</Button></div></div>)}</div> : <div className="empty-state"><Check /><strong>Nenhuma pendência criada</strong><p>Após uma decisão, use “Criar pendência” no assunto aprovado.</p></div>}</Card>}
  </div>
}
