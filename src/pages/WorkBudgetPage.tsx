import { useReloadOnSync } from '../sync/useReloadOnSync'
/* eslint-disable @typescript-eslint/no-misused-promises */
import { ArrowLeft, ArrowRight, Car, HandCoins, Plus, ReceiptText, Trash2 } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuthVault } from '../auth/AuthVaultContext'
import { BudgetAreaNav } from '../components/BudgetAreaNav'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { monthKey, monthLabel, shiftMonth } from '../family-budget/core'
import { DistrictService } from '../district/service'
import type { ChurchEntity } from '../district/types'
import { allowanceBalances, currency, mileageByChurch, workMonthSummary } from '../work-budget/core'
import { WorkBudgetService } from '../work-budget/service'
import {
  ALLOWANCE_CATEGORY_LABELS, WORK_EXPENSE_CATEGORY_LABELS, suggestedAllowance,
  type AllowanceCategory, type MileageData, type WorkAllowanceData, type WorkBudgetSnapshot,
  type WorkExpenseCategory, type WorkExpenseData,
} from '../work-budget/types'

const service = new WorkBudgetService()
const districtService = new DistrictService()
const carimbo = () => new Date().toISOString()
const hoje = () => new Date().toISOString().slice(0, 10)

const sectionLabels = { resumo: 'Visão do mês', auxilios: 'Auxílios', despesas: 'Despesas', quilometragem: 'Quilometragem' } as const
type WorkSection = keyof typeof sectionLabels

const vazioAuxilio = (): WorkAllowanceData => ({ category: 'fuel', description: '', amount: 0, date: hoje(), churchId: null, notes: '', createdAt: carimbo(), updatedAt: carimbo() })
const vazioDespesa = (): WorkExpenseData => ({ category: 'fuel', description: '', amount: 0, date: hoje(), allowanceCategory: 'fuel', churchId: null, visitId: null, agendaEventId: null, notes: '', createdAt: carimbo(), updatedAt: carimbo() })
const vazioKm = (): MileageData => ({ date: hoje(), churchId: null, reason: '', agendaEventId: null, kilometers: 0, amount: null, notes: '', createdAt: carimbo(), updatedAt: carimbo() })

function MoneyInput({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <label className="field"><span className="field__label">{label}</span><input className="field__input" type="number" min="0" step="0.01" value={value || ''} onChange={(event) => onChange(Number(event.target.value))} /></label>
}

function ChurchSelect({ label, value, churches, onChange }: { label: string; value: string | null; churches: ChurchEntity[]; onChange: (value: string | null) => void }) {
  return <label className="field"><span className="field__label">{label}</span>
    <select className="field__input" value={value ?? ''} onChange={(event) => onChange(event.target.value || null)}>
      <option value="">Sem igreja</option>
      {churches.map((church) => <option key={church.id} value={church.id}>{church.name}</option>)}
    </select>
  </label>
}

export function WorkBudgetPage() {
  const { account, masterKey } = useAuthVault()
  const navigate = useNavigate()
  const params = useParams()
  const [searchParams] = useSearchParams()
  const section = (Object.hasOwn(sectionLabels, params.section ?? '') ? params.section : 'resumo') as WorkSection
  const month = /^\d{4}-\d{2}$/u.test(searchParams.get('mes') ?? '') ? searchParams.get('mes')! : monthKey(new Date())

  const [snapshot, setSnapshot] = useState<WorkBudgetSnapshot | null>(null)
  const [churches, setChurches] = useState<ChurchEntity[]>([])
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [allowanceDraft, setAllowanceDraft] = useState<WorkAllowanceData | null>(null)
  const [allowanceId, setAllowanceId] = useState('')
  const [expenseDraft, setExpenseDraft] = useState<WorkExpenseData | null>(null)
  const [expenseId, setExpenseId] = useState('')
  const [mileageDraft, setMileageDraft] = useState<MileageData | null>(null)
  const [mileageId, setMileageId] = useState('')

  const load = useCallback(async () => {
    if (!account || !masterKey) return
    setLoading(true)
    try {
      setSnapshot(await service.snapshot(account.id, masterKey, month))
      const district = await districtService.getDistrict(account.id, masterKey)
      setChurches(district ? await districtService.listChurches(account.id, masterKey, district.id) : [])
    } catch (motivo) {
      setError(motivo instanceof Error ? motivo.message : 'Não foi possível abrir o orçamento do trabalho.')
    } finally {
      setLoading(false)
    }
  }, [account, masterKey, month])
  useReloadOnSync(load)

  const nomeDaIgreja = useMemo(() => {
    const porId = new Map(churches.map((church) => [church.id, church.name]))
    return (id: string | null) => id ? porId.get(id) ?? 'Igreja removida' : 'Sem igreja'
  }, [churches])

  const balances = useMemo(() => snapshot ? allowanceBalances(snapshot.allowances, snapshot.expenses) : [], [snapshot])
  const summary = useMemo(() => snapshot ? workMonthSummary(snapshot.allowances, snapshot.expenses, snapshot.mileage) : null, [snapshot])
  const kmPorIgreja = useMemo(() => snapshot ? mileageByChurch(snapshot.mileage) : [], [snapshot])

  const ir = (destino: WorkSection, mes = month) => void navigate(`/app/orcamento/trabalho/${destino}?mes=${mes}`)
  const pronto = async (mensagem: string) => { setNotice(mensagem); setError(''); await load() }
  const falhou = (motivo: unknown) => setError(motivo instanceof Error ? motivo.message : 'Não foi possível salvar.')

  async function salvarAuxilio() {
    if (!account || !masterKey || !allowanceDraft) return
    try { await service.saveAllowance(account.id, masterKey, allowanceDraft, allowanceId || undefined); setAllowanceDraft(null); setAllowanceId(''); await pronto('Auxílio registrado.') } catch (motivo) { falhou(motivo) }
  }
  async function salvarDespesa() {
    if (!account || !masterKey || !expenseDraft) return
    try { await service.saveExpense(account.id, masterKey, expenseDraft, expenseId || undefined); setExpenseDraft(null); setExpenseId(''); await pronto('Despesa registrada.') } catch (motivo) { falhou(motivo) }
  }
  async function salvarKm() {
    if (!account || !masterKey || !mileageDraft) return
    try { await service.saveMileage(account.id, masterKey, mileageDraft, mileageId || undefined); setMileageDraft(null); setMileageId(''); await pronto('Deslocamento registrado.') } catch (motivo) { falhou(motivo) }
  }
  async function apagar(id: string, oQue: string) {
    if (!account || !masterKey || !window.confirm(`Apagar ${oQue}?`)) return
    try { await service.remove(account.id, masterKey, id); await pronto('Registro apagado.') } catch (motivo) { falhou(motivo) }
  }

  if (loading || !snapshot || !summary) return <div className="app-loading" role="status">Abrindo o orçamento do trabalho…</div>

  return <div className="page-stack">
    <header className="page-hero"><div><p className="eyebrow">Orçamento</p><h1>Trabalho</h1></div></header>
    <BudgetAreaNav area="trabalho" month={month} />
    <nav className="budget-nav" aria-label="Áreas do orçamento do trabalho">
      {(Object.keys(sectionLabels) as WorkSection[]).map((chave) => <Link className={section === chave ? 'active' : ''} key={chave} to={`/app/orcamento/trabalho/${chave}?mes=${month}`}>{sectionLabels[chave]}</Link>)}
    </nav>
    <div className="budget-month-nav">
      <Button variant="secondary" aria-label="Mês anterior" icon={<ArrowLeft />} onClick={() => ir(section, shiftMonth(month, -1))} />
      <strong>{monthLabel(month)}</strong>
      <Button variant="secondary" aria-label="Próximo mês" icon={<ArrowRight />} onClick={() => ir(section, shiftMonth(month, 1))} />
      <Button variant="quiet" onClick={() => ir(section, monthKey(new Date()))}>Mês atual</Button>
    </div>
    {notice && <div className="alert alert--success" role="status">{notice}</div>}
    {error && <div className="alert alert--error" role="alert">{error}</div>}

    {section === 'resumo' && <>
      <section className="budget-metrics" aria-label="Resumo do mês no trabalho">
        <div><span>Auxílios recebidos</span><strong>{currency(summary.received)}</strong></div>
        <div><span>Despesas do ministério</span><strong>{currency(summary.spent)}</strong></div>
        <div><span>Saldo dos auxílios</span><strong>{currency(summary.balance)}</strong></div>
        <div><span>Pago do próprio bolso</span><strong>{currency(summary.fromPocket)}</strong></div>
        <div><span>Quilômetros</span><strong>{summary.kilometers.toLocaleString('pt-BR')}</strong></div>
      </section>
      <Card title="Saldo por auxílio">
        {balances.length === 0
          ? <p className="card-copy">Nenhum auxílio ou despesa neste mês.</p>
          : <div className="entity-list">{balances.map((linha) => <div className="entity-row" key={linha.category}>
              <span><strong>{ALLOWANCE_CATEGORY_LABELS[linha.category]}</strong><small>Recebido {currency(linha.received)} · gasto {currency(linha.spent)}</small></span>
              <strong>{currency(linha.balance)}</strong>
              {linha.fromPocket && <span className="status-pill status-pill--warning">{currency(linha.overspent)} do bolso</span>}
            </div>)}</div>}
        {summary.fromPocket > 0 && <div className="alert alert--warning" role="status">
          Neste mês, {currency(summary.fromPocket)} saíram do seu bolso: o que passou de cada auxílio, mais as despesas sem auxílio apontado.
        </div>}
      </Card>
      <section className="budget-quick-actions" aria-label="Ações rápidas">
        <button onClick={() => { setAllowanceDraft(vazioAuxilio()); ir('auxilios') }}><HandCoins /><span>Registrar auxílio</span></button>
        <button onClick={() => { setExpenseDraft(vazioDespesa()); ir('despesas') }}><ReceiptText /><span>Registrar despesa</span></button>
        <button onClick={() => { setMileageDraft(vazioKm()); ir('quilometragem') }}><Car /><span>Registrar deslocamento</span></button>
      </section>
    </>}

    {section === 'auxilios' && <>
      <div className="page-actions"><Button icon={<Plus />} onClick={() => { setAllowanceId(''); setAllowanceDraft(vazioAuxilio()) }}>Novo auxílio</Button></div>
      {allowanceDraft && <Card title={allowanceId ? 'Editar auxílio' : 'Novo auxílio'}>
        <div className="form-grid">
          <label className="field"><span className="field__label">Tipo</span><select className="field__input" value={allowanceDraft.category} onChange={(event) => setAllowanceDraft({ ...allowanceDraft, category: event.target.value as AllowanceCategory })}>{Object.entries(ALLOWANCE_CATEGORY_LABELS).map(([valor, rotulo]) => <option key={valor} value={valor}>{rotulo}</option>)}</select></label>
          <label className="field"><span className="field__label">Auxílio ou cartão</span><input className="field__input" value={allowanceDraft.description} onChange={(event) => setAllowanceDraft({ ...allowanceDraft, description: event.target.value })} /></label>
          <MoneyInput label="Valor" value={allowanceDraft.amount} onChange={(amount) => setAllowanceDraft({ ...allowanceDraft, amount })} />
          <label className="field"><span className="field__label">Data</span><input className="field__input" type="date" value={allowanceDraft.date} onChange={(event) => setAllowanceDraft({ ...allowanceDraft, date: event.target.value })} /></label>
          <ChurchSelect label="Igreja (opcional)" value={allowanceDraft.churchId} churches={churches} onChange={(churchId) => setAllowanceDraft({ ...allowanceDraft, churchId })} />
        </div>
        <label className="field"><span className="field__label">Observação</span><textarea className="field__input field__textarea" value={allowanceDraft.notes} onChange={(event) => setAllowanceDraft({ ...allowanceDraft, notes: event.target.value })} /></label>
        <div className="form-actions"><Button onClick={salvarAuxilio}>Salvar auxílio</Button><Button variant="secondary" onClick={() => setAllowanceDraft(null)}>Cancelar</Button></div>
      </Card>}
      <Card title="Auxílios do mês">
        {snapshot.allowances.length === 0 ? <p className="card-copy">Nenhum auxílio registrado neste mês.</p> : <div className="entity-list">{snapshot.allowances.map((item) => <div className="entity-row" key={item.id}>
          <span><strong>{item.description}</strong><small>{ALLOWANCE_CATEGORY_LABELS[item.category]} · {item.date} · {nomeDaIgreja(item.churchId)}</small></span>
          <strong>{currency(item.amount)}</strong>
          <Button variant="quiet" onClick={() => { setAllowanceId(item.id); const { id: _id, ...dados } = item; void _id; setAllowanceDraft(dados) }}>Editar</Button>
          <Button variant="danger" icon={<Trash2 />} aria-label={`Apagar auxílio ${item.description}`} onClick={() => apagar(item.id, 'este auxílio')} />
        </div>)}</div>}
      </Card>
    </>}

    {section === 'despesas' && <>
      <div className="page-actions"><Button icon={<Plus />} onClick={() => { setExpenseId(''); setExpenseDraft(vazioDespesa()) }}>Nova despesa</Button></div>
      {expenseDraft && <Card title={expenseId ? 'Editar despesa' : 'Nova despesa'}>
        <div className="form-grid">
          <label className="field"><span className="field__label">Tipo</span><select className="field__input" value={expenseDraft.category} onChange={(event) => { const category = event.target.value as WorkExpenseCategory; setExpenseDraft({ ...expenseDraft, category, allowanceCategory: suggestedAllowance(category) }) }}>{Object.entries(WORK_EXPENSE_CATEGORY_LABELS).map(([valor, rotulo]) => <option key={valor} value={valor}>{rotulo}</option>)}</select></label>
          <label className="field"><span className="field__label">Descrição</span><input className="field__input" value={expenseDraft.description} onChange={(event) => setExpenseDraft({ ...expenseDraft, description: event.target.value })} /></label>
          <MoneyInput label="Valor" value={expenseDraft.amount} onChange={(amount) => setExpenseDraft({ ...expenseDraft, amount })} />
          <label className="field"><span className="field__label">Data</span><input className="field__input" type="date" value={expenseDraft.date} onChange={(event) => setExpenseDraft({ ...expenseDraft, date: event.target.value })} /></label>
          <label className="field"><span className="field__label">Pago pelo auxílio</span>
            <select className="field__input" value={expenseDraft.allowanceCategory ?? ''} onChange={(event) => setExpenseDraft({ ...expenseDraft, allowanceCategory: (event.target.value || null) as AllowanceCategory | null })}>
              <option value="">Do próprio bolso</option>
              {Object.entries(ALLOWANCE_CATEGORY_LABELS).map(([valor, rotulo]) => <option key={valor} value={valor}>{rotulo}</option>)}
            </select>
          </label>
          <ChurchSelect label="Igreja (opcional)" value={expenseDraft.churchId} churches={churches} onChange={(churchId) => setExpenseDraft({ ...expenseDraft, churchId })} />
        </div>
        <label className="field"><span className="field__label">Observação</span><textarea className="field__input field__textarea" value={expenseDraft.notes} onChange={(event) => setExpenseDraft({ ...expenseDraft, notes: event.target.value })} /></label>
        <div className="form-actions"><Button onClick={salvarDespesa}>Salvar despesa</Button><Button variant="secondary" onClick={() => setExpenseDraft(null)}>Cancelar</Button></div>
      </Card>}
      <Card title="Despesas do mês">
        {snapshot.expenses.length === 0 ? <p className="card-copy">Nenhuma despesa registrada neste mês.</p> : <div className="entity-list">{snapshot.expenses.map((item) => <div className="entity-row" key={item.id}>
          <span><strong>{item.description}</strong><small>{WORK_EXPENSE_CATEGORY_LABELS[item.category]} · {item.date} · {item.allowanceCategory ? ALLOWANCE_CATEGORY_LABELS[item.allowanceCategory] : 'Do próprio bolso'} · {nomeDaIgreja(item.churchId)}</small></span>
          <strong>{currency(item.amount)}</strong>
          <Button variant="quiet" onClick={() => { setExpenseId(item.id); const { id: _id, ...dados } = item; void _id; setExpenseDraft(dados) }}>Editar</Button>
          <Button variant="danger" icon={<Trash2 />} aria-label={`Apagar despesa ${item.description}`} onClick={() => apagar(item.id, 'esta despesa')} />
        </div>)}</div>}
      </Card>
    </>}

    {section === 'quilometragem' && <>
      <div className="page-actions"><Button icon={<Plus />} onClick={() => { setMileageId(''); setMileageDraft(vazioKm()) }}>Novo deslocamento</Button></div>
      {mileageDraft && <Card title={mileageId ? 'Editar deslocamento' : 'Novo deslocamento'}>
        <div className="form-grid">
          <label className="field"><span className="field__label">Data</span><input className="field__input" type="date" value={mileageDraft.date} onChange={(event) => setMileageDraft({ ...mileageDraft, date: event.target.value })} /></label>
          <ChurchSelect label="Igreja" value={mileageDraft.churchId} churches={churches} onChange={(churchId) => setMileageDraft({ ...mileageDraft, churchId })} />
          <label className="field"><span className="field__label">Motivo ou compromisso (opcional)</span><input className="field__input" value={mileageDraft.reason} onChange={(event) => setMileageDraft({ ...mileageDraft, reason: event.target.value })} /></label>
          <label className="field"><span className="field__label">Quilômetros</span><input className="field__input" type="number" min="0" step="0.1" value={mileageDraft.kilometers || ''} onChange={(event) => setMileageDraft({ ...mileageDraft, kilometers: Number(event.target.value) })} /></label>
          <MoneyInput label="Gasto (opcional)" value={mileageDraft.amount ?? 0} onChange={(amount) => setMileageDraft({ ...mileageDraft, amount: amount || null })} />
        </div>
        <div className="form-actions"><Button onClick={salvarKm}>Salvar deslocamento</Button><Button variant="secondary" onClick={() => setMileageDraft(null)}>Cancelar</Button></div>
      </Card>}
      <Card title="Total por igreja no mês">
        {kmPorIgreja.length === 0 ? <p className="card-copy">Nenhum deslocamento registrado neste mês.</p> : <div className="entity-list">{kmPorIgreja.map((linha) => <div className="entity-row" key={linha.churchId ?? 'sem-igreja'}>
          <span><strong>{nomeDaIgreja(linha.churchId)}</strong><small>{linha.trips} deslocamento(s)</small></span>
          <strong>{linha.kilometers.toLocaleString('pt-BR')} km</strong>
          {linha.amount > 0 && <span>{currency(linha.amount)}</span>}
        </div>)}</div>}
      </Card>
      <Card title="Deslocamentos do mês">
        {snapshot.mileage.length === 0 ? <p className="card-copy">Nada registrado ainda.</p> : <div className="entity-list">{snapshot.mileage.map((item) => <div className="entity-row" key={item.id}>
          <span><strong>{nomeDaIgreja(item.churchId)}</strong><small>{item.date}{item.reason ? ` · ${item.reason}` : ''}</small></span>
          <strong>{item.kilometers.toLocaleString('pt-BR')} km</strong>
          <Button variant="quiet" onClick={() => { setMileageId(item.id); const { id: _id, ...dados } = item; void _id; setMileageDraft(dados) }}>Editar</Button>
          <Button variant="danger" icon={<Trash2 />} aria-label={`Apagar deslocamento de ${item.date}`} onClick={() => apagar(item.id, 'este deslocamento')} />
        </div>)}</div>}
      </Card>
      <p className="muted">Os quilômetros são informados por você. O aplicativo não usa GPS nem registra localização.</p>
    </>}
  </div>
}
