/* eslint-disable @typescript-eslint/no-misused-promises */
import { ArrowLeft } from 'lucide-react'
import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuthVault } from '../auth/AuthVaultContext'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Field } from '../components/ui/Field'
import { EvangelismPlanningService } from '../evangelism/service'
import { LINKABLE_AREAS } from '../evangelism/goalTracking'
import { PLANNING_AREAS, PLANNING_AREA_LABELS, type AnnualGoalInput, type PlanningArea } from '../evangelism/types'
import { GOAL_AREA_LABELS, type GoalArea } from '../goals/areas'

const service = new EvangelismPlanningService()

/** A meta nasce simples: igrejas, plano, orçamento e agenda entram no acompanhamento. */
const emptyGoal = (year: number): AnnualGoalInput => ({
  title: '', description: '', area: 'discipleship', year, churchIds: [], responsible: '',
  startDate: `${year}-01-01`, dueDate: `${year}-12-31`, target: 0, linkedArea: null,
  priority: 'normal', status: 'planned', notes: '', references: [],
})

export function AnnualGoalPage() {
  const { goalId } = useParams()
  const [search] = useSearchParams()
  const navigate = useNavigate()
  const { account, masterKey } = useAuthVault()
  const [draft, setDraft] = useState<AnnualGoalInput>(() => emptyGoal(Number(search.get('ano')) || new Date().getFullYear()))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!account || !masterKey || !goalId) return
    const goal = await service.getGoal(account.id, masterKey, goalId)
    if (!goal) { setError('Meta não encontrada.'); return }
    const { id: _id, campaignIds: _campanhas, agendaEventIds: _eventos, history: _historico, createdAt: _criada, updatedAt: _atualizada, ...input } = goal
    void _id; void _campanhas; void _eventos; void _historico; void _criada; void _atualizada
    setDraft(input)
  }, [account, goalId, masterKey])
  useEffect(() => { void load() }, [load])

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!account || !masterKey) return
    setBusy(true); setError('')
    try {
      const ano = Number((draft.startDate ?? draft.dueDate).slice(0, 4)) || draft.year
      const saved = await service.saveGoal(account.id, masterKey, { ...draft, year: ano }, goalId)
      await navigate(`/app/planejamento/${saved.id}`)
    } catch (motivo) {
      setError(motivo instanceof Error ? motivo.message : 'Não foi possível salvar a meta.')
    } finally { setBusy(false) }
  }

  return <div className="page-stack page-narrow">
    <Link className="text-link back-link" to={goalId ? `/app/planejamento/${goalId}` : '/app/planejamento'}><ArrowLeft />Voltar</Link>
    <header className="page-hero"><div>
      <p className="eyebrow">Planejamento Anual</p>
      <h1>{goalId ? 'Editar meta do planejamento' : 'Nova meta do planejamento'}</h1>
    </div></header>
    {error && <div className="alert alert--error" role="alert">{error}</div>}
    <form onSubmit={save}>
      <Card>
        <div className="form-grid">
          <Field label="Título" name="annual-goal-title" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} required />
          <label className="field" htmlFor="annual-goal-area">
            <span className="field__label">Área estratégica</span>
            <select id="annual-goal-area" className="field__input" value={draft.area} onChange={(event) => setDraft({ ...draft, area: event.target.value as PlanningArea })}>
              {PLANNING_AREAS.map((area) => <option value={area} key={area}>{PLANNING_AREA_LABELS[area]}</option>)}
            </select>
          </label>
          <label className="field" htmlFor="annual-goal-link">
            <span className="field__label">Ligar a uma meta acompanhada (opcional)</span>
            <select id="annual-goal-link" className="field__input" value={draft.linkedArea ?? ''} onChange={(event) => setDraft({ ...draft, linkedArea: (event.target.value || null) as GoalArea | null })}>
              <option value="">Sem ligação</option>
              {LINKABLE_AREAS.map((area) => <option value={area} key={area}>{GOAL_AREA_LABELS[area]}</option>)}
            </select>
          </label>
          <Field label="Data de início" name="annual-goal-start" type="date" value={draft.startDate ?? ''} onChange={(event) => setDraft({ ...draft, startDate: event.target.value })} required />
          <Field label="Data de fim" name="annual-goal-due" type="date" value={draft.dueDate} onChange={(event) => setDraft({ ...draft, dueDate: event.target.value })} required />
          <Field label="Quantidade esperada" name="annual-goal-target" type="number" min={0} step="any" value={draft.target ?? 0} onChange={(event) => setDraft({ ...draft, target: Number(event.target.value) })} />
        </div>
      </Card>
      <div className="form-actions">
        <Button type="submit" disabled={busy}>{busy ? 'Salvando…' : 'Salvar meta'}</Button>
        <Link className="button button--secondary" to={goalId ? `/app/planejamento/${goalId}` : '/app/planejamento'}>Cancelar</Link>
      </div>
    </form>
  </div>
}
