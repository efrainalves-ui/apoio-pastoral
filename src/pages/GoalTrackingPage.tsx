/* eslint-disable @typescript-eslint/no-misused-promises */
import { ArrowLeft, CalendarPlus, Link2, Pencil, Plus, Trash2 } from 'lucide-react'
import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AgendaService } from '../agenda/service'
import type { AgendaEventEntity } from '../agenda/types'
import { useAuthVault } from '../auth/AuthVaultContext'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Field } from '../components/ui/Field'
import { GOAL_STATUS_LABELS, goalBudget, goalChurchResults, goalMonthlyResults, trackGoal } from '../evangelism/goalTracking'
import { EvangelismPlanningService } from '../evangelism/service'
import { emptyActionPlan, PLANNING_AREA_LABELS, type AnnualGoalEntity, type AnnualGoalInput, type GoalActionPlan } from '../evangelism/types'
import { GOAL_AREA_LABELS, type GoalArea } from '../goals/areas'
import { MONTH_LABELS, formatGoalValue } from '../goals/format'
import { useGoalSources } from '../goals/useGoalSources'

const service = new EvangelismPlanningService()
const agendaService = new AgendaService()
const dataCurta = (valor: string) => new Intl.DateTimeFormat('pt-BR').format(new Date(`${valor.slice(0, 10)}T12:00:00`))
const dinheiro = (valor: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor)

/** A meta ligada a uma área usa a mesma forma de mostrar número daquela área. */
function mostrarValor(area: GoalArea | null | undefined, valor: number) {
  return area ? formatGoalValue(area, valor) : String(valor)
}

export function GoalTrackingPage() {
  const { goalId = '' } = useParams()
  const navigate = useNavigate()
  const { account, masterKey } = useAuthVault()
  const { sources, churches, ready } = useGoalSources()
  const [goal, setGoal] = useState<AnnualGoalEntity | null>(null)
  const [events, setEvents] = useState<AgendaEventEntity[]>([])
  const [carregando, setCarregando] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [novoItem, setNovoItem] = useState('')
  const [novaDespesa, setNovaDespesa] = useState({ label: '', planned: '', spent: '' })
  const [novoEvento, setNovoEvento] = useState({ title: '', date: '', startTime: '19:00', endTime: '20:30', churchId: '' })
  const [eventoExistente, setEventoExistente] = useState('')

  const load = useCallback(async () => {
    if (!account || !masterKey || !goalId) return
    try {
      const [encontrada, agenda] = await Promise.all([
        service.getGoal(account.id, masterKey, goalId),
        agendaService.listEvents(account.id, masterKey),
      ])
      setGoal(encontrada); setEvents(agenda)
    } catch { setError('Não foi possível abrir o acompanhamento desta meta.') } finally { setCarregando(false) }
  }, [account, goalId, masterKey])
  useEffect(() => { void load() }, [load])

  async function salvar(mudanca: Partial<AnnualGoalInput>, aviso: string) {
    if (!account || !masterKey || !goal) return
    setError(''); setNotice('')
    const { id: _id, campaignIds: _campanhas, agendaEventIds: _eventos, history: _historico, createdAt: _criada, updatedAt: _atualizada, ...atual } = goal
    void _id; void _campanhas; void _eventos; void _historico; void _criada; void _atualizada
    try {
      const salva = await service.saveGoal(account.id, masterKey, { ...atual, ...mudanca }, goal.id)
      setGoal(salva); setNotice(aviso)
    } catch (motivo) { setError(motivo instanceof Error ? motivo.message : 'Não foi possível salvar a meta.') }
  }

  async function excluir() {
    if (!account || !masterKey || !goal || !window.confirm('Deseja excluir esta meta? Os compromissos da Agenda continuam onde estão.')) return
    await service.deleteGoal(account.id, masterKey, goal.id)
    await navigate('/app/planejamento')
  }

  async function criarEvento(event: FormEvent) {
    event.preventDefault()
    if (!account || !masterKey || !goal) return
    setError(''); setNotice('')
    try {
      const { goal: salva, reused } = await service.createGoalAgendaEvent(account.id, masterKey, goal.id, { ...novoEvento, churchId: novoEvento.churchId || null, location: '' })
      setGoal(salva); setNovoEvento({ title: '', date: '', startTime: '19:00', endTime: '20:30', churchId: '' })
      setNotice(reused ? 'Esse compromisso já estava na Agenda; nada foi repetido.' : 'Compromisso criado na Agenda e ligado à meta.')
      setEvents(await agendaService.listEvents(account.id, masterKey))
    } catch (motivo) { setError(motivo instanceof Error ? motivo.message : 'Não foi possível criar o compromisso.') }
  }

  async function ligarEvento() {
    if (!account || !masterKey || !goal || !eventoExistente) return
    const salva = await service.linkGoalAgendaEvent(account.id, masterKey, goal.id, eventoExistente)
    setGoal(salva); setEventoExistente(''); setNotice('Compromisso ligado à meta.')
  }

  async function desligarEvento(eventId: string) {
    if (!account || !masterKey || !goal) return
    const salva = await service.unlinkGoalAgendaEvent(account.id, masterKey, goal.id, eventId)
    setGoal(salva); setNotice('Compromisso desligado; ele continua na Agenda.')
  }

  if (carregando || !ready) return <div className="app-loading" role="status">Abrindo o acompanhamento…</div>
  if (!goal) return <div className="page-stack"><p>Meta não encontrada.</p><Link className="text-link" to="/app/planejamento">Voltar ao planejamento</Link></div>

  const acompanhamento = trackGoal(goal, sources)
  const meses = goalMonthlyResults(goal, sources)
  const maiorMes = Math.max(1, ...meses)
  const porIgreja = goalChurchResults(goal, sources)
  const orcamento = goalBudget(goal.budget)
  const plano = goal.actionPlan ?? emptyActionPlan()
  const eventosLigados = events.filter((event) => goal.agendaEventIds.includes(event.id))
  const disponiveis = events.filter((event) => !goal.agendaEventIds.includes(event.id)).slice(0, 60)
  const alvoIgreja = (churchId: string) => goal.churchTargets?.find((item) => item.churchId === churchId)?.target ?? 0
  const nomeIgreja = (churchId: string) => churches.find(({ id }) => id === churchId)?.name ?? 'Igreja'

  function ajustarIgreja(churchId: string, valor: number) {
    const atuais = (goal?.churchTargets ?? []).filter((item) => item.churchId !== churchId)
    void salvar({ churchTargets: valor > 0 ? [...atuais, { churchId, target: valor }] : atuais }, 'Divisão entre igrejas atualizada.')
  }

  function ajustarPlano(mudanca: Partial<GoalActionPlan>) {
    void salvar({ actionPlan: { ...plano, ...mudanca } }, 'Plano de ação salvo.')
  }

  function ajustarMes(mes: number, valor: number) {
    const chave = `${goal?.year}-${String(mes + 1).padStart(2, '0')}`
    const outros = (goal?.progress ?? []).filter((item) => item.month !== chave)
    void salvar({ progress: valor > 0 ? [...outros, { month: chave, amount: valor }] : outros }, 'Resultado do mês registrado.')
  }

  return <div className="page-stack page-narrow">
    <Link className="text-link back-link" to="/app/planejamento"><ArrowLeft />Voltar ao planejamento</Link>
    <header className="page-hero">
      <div>
        <p className="eyebrow">{PLANNING_AREA_LABELS[goal.area]} · {goal.year}</p>
        <h1>{goal.title}</h1>
        <p>Meta do distrito. Dividir entre igrejas é opcional.</p>
      </div>
      <div className="page-actions"><Link className="button button--secondary" to={`/app/planejamento/${goal.id}/editar`}><Pencil />Editar meta</Link></div>
    </header>
    {notice && <div className="alert alert--success" role="status">{notice}</div>}
    {error && <div className="alert alert--error" role="alert">{error}</div>}

    <Card title="1. Resumo">
      <div className="goal-summary">
        <div><small>Período</small><strong>{goal.startDate ? `${dataCurta(goal.startDate)} a ${dataCurta(goal.dueDate)}` : `até ${dataCurta(goal.dueDate)}`}</strong></div>
        <div><small>Meta do distrito</small><strong>{mostrarValor(goal.linkedArea, acompanhamento.target)}</strong></div>
        <div><small>Resultado</small><strong>{mostrarValor(goal.linkedArea, acompanhamento.result)}</strong></div>
        <div><small>Quanto falta</small><strong>{mostrarValor(goal.linkedArea, acompanhamento.missing)}</strong></div>
        <div><small>Situação</small><strong>{GOAL_STATUS_LABELS[acompanhamento.status]}</strong></div>
      </div>
      <span className="goal-bar" aria-hidden="true"><span style={{ width: `${acompanhamento.percent}%` }} /></span>
      <p className="goal-card__percent">{acompanhamento.percent}% da meta</p>
      {acompanhamento.automatic && <p className="muted">O resultado vem de {GOAL_AREA_LABELS[goal.linkedArea as GoalArea]}. Não precisa lançar de novo aqui.</p>}
    </Card>

    <Card title="2. Igrejas participantes" eyebrow="Opcional">
      <p className="muted">Se quiser, divida a meta entre as igrejas. A meta funciona igual sem isso.</p>
      <div className="goal-church-list">
        {churches.map((church) => <div className="goal-church" key={church.id}>
          <span>{church.name}</span>
          <input className="field__input" type="number" min={0} step="any" aria-label={`Meta de ${church.name}`} defaultValue={alvoIgreja(church.id) || ''}
            onBlur={(event) => ajustarIgreja(church.id, Number(event.target.value))} />
          <small>{alvoIgreja(church.id) ? mostrarValor(goal.linkedArea, alvoIgreja(church.id)) : 'sem divisão'}</small>
        </div>)}
        {!churches.length && <p className="muted">Cadastre as igrejas do distrito para dividir a meta.</p>}
      </div>
      {acompanhamento.churchTargetsSum > 0 && <p className="muted">Soma das igrejas: {mostrarValor(goal.linkedArea, acompanhamento.churchTargetsSum)}</p>}
      {acompanhamento.targetsMismatch && <p className="alert alert--warning" role="status">A soma das igrejas está diferente da meta do distrito. Você pode continuar assim se for o que planejou.</p>}
    </Card>

    <Card title="3. Plano de ação">
      <div className="form-grid">
        <Field label="O que será feito" name="plano-o-que" defaultValue={plano.what} onBlur={(event) => ajustarPlano({ what: event.target.value })} />
        <Field label="Como será feito" name="plano-como" defaultValue={plano.how} onBlur={(event) => ajustarPlano({ how: event.target.value })} />
        <Field label="Onde será feito" name="plano-onde" defaultValue={plano.where} onBlur={(event) => ajustarPlano({ where: event.target.value })} />
        <Field label="Quem participa" name="plano-quem" defaultValue={plano.who} onBlur={(event) => ajustarPlano({ who: event.target.value })} />
      </div>
      <label className="field" htmlFor="plano-acoes">
        <span className="field__label">Ações necessárias</span>
        <textarea id="plano-acoes" className="field__input field__textarea" defaultValue={plano.actions} onBlur={(event) => ajustarPlano({ actions: event.target.value })} />
      </label>
      <div className="settings-list">
        {plano.checklist.map((item) => <label key={item.id} className="confirmation-check">
          <input type="checkbox" checked={item.done} onChange={() => ajustarPlano({ checklist: plano.checklist.map((atual) => atual.id === item.id ? { ...atual, done: !atual.done } : atual) })} />
          <span>{item.label}</span>
          <Button variant="secondary" icon={<Trash2 />} aria-label={`Remover ${item.label}`} onClick={() => { if (window.confirm(`Remover "${item.label}" da lista?`)) ajustarPlano({ checklist: plano.checklist.filter((atual) => atual.id !== item.id) }) }} />
        </label>)}
      </div>
      <div className="form-actions">
        <Field label="Nova tarefa da lista" name="plano-nova-tarefa" value={novoItem} onChange={(event) => setNovoItem(event.target.value)} />
        <Button icon={<Plus />} disabled={!novoItem.trim()} onClick={() => { ajustarPlano({ checklist: [...plano.checklist, { id: crypto.randomUUID(), label: novoItem.trim(), done: false }] }); setNovoItem('') }}>Adicionar</Button>
      </div>
    </Card>

    <Card title="4. Agenda">
      <p className="muted">Os compromissos ficam na Agenda. Aqui você só vê quais pertencem a esta meta.</p>
      <div className="planning-goal-list">
        {eventosLigados.map((event) => <div key={event.id} className="task-attention-row">
          <span><strong>{event.title}</strong><small>{dataCurta(event.startAt)}</small></span>
          <span className="row-actions">
            <Link className="text-link" to={`/app/agenda/${event.id}/editar`}>Abrir</Link>
            <Button variant="secondary" onClick={() => desligarEvento(event.id)}>Desligar</Button>
          </span>
        </div>)}
        {!eventosLigados.length && <p className="muted">Nenhum compromisso ligado ainda.</p>}
      </div>
      <form onSubmit={criarEvento} className="form-grid">
        <Field label="Novo compromisso" name="meta-evento-titulo" value={novoEvento.title} onChange={(event) => setNovoEvento({ ...novoEvento, title: event.target.value })} />
        <Field label="Data" name="meta-evento-data" type="date" value={novoEvento.date} onChange={(event) => setNovoEvento({ ...novoEvento, date: event.target.value })} />
        <Field label="Início" name="meta-evento-inicio" type="time" value={novoEvento.startTime} onChange={(event) => setNovoEvento({ ...novoEvento, startTime: event.target.value })} />
        <Field label="Fim" name="meta-evento-fim" type="time" value={novoEvento.endTime} onChange={(event) => setNovoEvento({ ...novoEvento, endTime: event.target.value })} />
        <label className="field" htmlFor="meta-evento-igreja">
          <span className="field__label">Igreja</span>
          <select id="meta-evento-igreja" className="field__input" value={novoEvento.churchId} onChange={(event) => setNovoEvento({ ...novoEvento, churchId: event.target.value })}>
            <option value="">Sem igreja definida</option>
            {churches.map((church) => <option value={church.id} key={church.id}>{church.name}</option>)}
          </select>
        </label>
        <Button type="submit" icon={<CalendarPlus />} disabled={!novoEvento.title.trim() || !novoEvento.date}>Criar na Agenda</Button>
      </form>
      <div className="form-actions">
        <label className="field" htmlFor="meta-evento-existente">
          <span className="field__label">Ligar um compromisso que já existe</span>
          <select id="meta-evento-existente" className="field__input" value={eventoExistente} onChange={(event) => setEventoExistente(event.target.value)}>
            <option value="">Escolher da Agenda</option>
            {disponiveis.map((event) => <option value={event.id} key={event.id}>{dataCurta(event.startAt)} · {event.title}</option>)}
          </select>
        </label>
        <Button variant="secondary" icon={<Link2 />} disabled={!eventoExistente} onClick={ligarEvento}>Ligar à meta</Button>
      </div>
      <Link className="text-link" to={`/app/evangelismo/nova?meta=${goal.id}`}>Criar campanha para esta meta</Link>
    </Card>

    <Card title="5. Orçamento">
      <p className="muted">Orçamento desta meta pastoral. Ele não entra no Orçamento Familiar.</p>
      <div className="goal-summary">
        <div><small>Previsão</small><strong>{dinheiro(orcamento.planned)}</strong></div>
        <div><small>Despesas</small><strong>{dinheiro(orcamento.spent)}</strong></div>
        <div><small>Saldo</small><strong>{dinheiro(orcamento.balance)}</strong></div>
      </div>
      <div className="budget-item-list">
        {(goal.budget ?? []).map((item) => <article key={item.id}>
          <span><strong>{item.label}</strong><small>Previsto {dinheiro(item.planned)} · Gasto {dinheiro(item.spent)}</small></span>
          <Button variant="secondary" icon={<Trash2 />} aria-label={`Remover ${item.label}`} onClick={() => { if (window.confirm(`Remover "${item.label}" do orçamento?`)) void salvar({ budget: (goal.budget ?? []).filter((atual) => atual.id !== item.id) }, 'Item removido do orçamento.') }} />
        </article>)}
        {!(goal.budget ?? []).length && <p className="muted">Nenhum item lançado.</p>}
      </div>
      <div className="form-grid">
        <Field label="Item" name="meta-orcamento-item" value={novaDespesa.label} onChange={(event) => setNovaDespesa({ ...novaDespesa, label: event.target.value })} />
        <Field label="Previsto" name="meta-orcamento-previsto" type="number" min={0} step="any" value={novaDespesa.planned} onChange={(event) => setNovaDespesa({ ...novaDespesa, planned: event.target.value })} />
        <Field label="Gasto" name="meta-orcamento-gasto" type="number" min={0} step="any" value={novaDespesa.spent} onChange={(event) => setNovaDespesa({ ...novaDespesa, spent: event.target.value })} />
      </div>
      <div className="form-actions">
        <Button icon={<Plus />} disabled={!novaDespesa.label.trim()} onClick={() => { void salvar({ budget: [...(goal.budget ?? []), { id: crypto.randomUUID(), label: novaDespesa.label.trim(), planned: Number(novaDespesa.planned) || 0, spent: Number(novaDespesa.spent) || 0 }] }, 'Item somado ao orçamento da meta.'); setNovaDespesa({ label: '', planned: '', spent: '' }) }}>Somar ao orçamento</Button>
      </div>
      <label className="field" htmlFor="meta-orcamento-notas">
        <span className="field__label">Observações do orçamento</span>
        <textarea id="meta-orcamento-notas" className="field__input field__textarea" defaultValue={goal.budgetNotes ?? ''} onBlur={(event) => void salvar({ budgetNotes: event.target.value }, 'Observações do orçamento salvas.')} />
      </label>
    </Card>

    <Card title="6. Acompanhamento">
      <ul className="goal-months">
        {MONTH_LABELS.map((label, index) => <li key={label}>
          <span className="goal-months__bar"><span style={{ height: `${Math.round(((meses[index] ?? 0) / maiorMes) * 100)}%` }} /></span>
          <small>{label}</small>
          <small>{mostrarValor(goal.linkedArea, meses[index] ?? 0)}</small>
        </li>)}
      </ul>
      {acompanhamento.automatic
        ? <p className="muted">Resultado do distrito: {mostrarValor(goal.linkedArea, acompanhamento.result)} · {GOAL_STATUS_LABELS[acompanhamento.status]}</p>
        : <>
          <p className="muted">Registre o resultado de cada mês. Resultado do distrito: {acompanhamento.result} · {GOAL_STATUS_LABELS[acompanhamento.status]}</p>
          <div className="goal-church-list">
            {MONTH_LABELS.map((label, index) => <div className="goal-church" key={`campo-${label}`}>
              <span>{label}</span>
              <input className="field__input" type="number" min={0} step="any" aria-label={`Resultado de ${label}`} defaultValue={meses[index] || ''} onBlur={(event) => ajustarMes(index, Number(event.target.value))} />
              <small />
            </div>)}
          </div>
        </>}
      {porIgreja.length > 0 && <div className="goal-church-list">
        {porIgreja.map((item) => <div className="goal-church" key={item.churchId}>
          <span>{nomeIgreja(item.churchId)}<small>{mostrarValor(goal.linkedArea, item.result)} de {mostrarValor(goal.linkedArea, item.target)}</small></span>
          <span className="goal-bar" aria-hidden="true"><span style={{ width: `${item.percent}%` }} /></span>
          <small>{item.percent}%</small>
        </div>)}
      </div>}
    </Card>

    <Button variant="danger" icon={<Trash2 />} onClick={excluir}>Excluir meta</Button>
  </div>
}
