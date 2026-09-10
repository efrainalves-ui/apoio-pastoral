import { useReloadOnSync } from '../sync/useReloadOnSync'
/* eslint-disable @typescript-eslint/no-misused-promises */
import { ArrowLeft, ArrowRight, Check, CircleDollarSign, Copy, Download, HandCoins, Plus, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuthVault } from '../auth/AuthVaultContext'
import { localDateKey } from '../shared/dates'
import { BudgetAreaNav } from '../components/BudgetAreaNav'
import { ShoppingListView } from './ShoppingListView'
import { FinancasPessoaisPage } from './FinancasPessoaisPage'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { categorySpending, currency, debtEndEstimate, debtPlan, debtProgress, effectivePaymentStatus, forecastSummary, monthKey, monthLabel, monthlySummary, shiftMonth } from '../family-budget/core'
import { downloadBudgetCsv, downloadBudgetPdf } from '../family-budget/export'
import { FamilyBudgetService } from '../family-budget/service'
import { DEBT_STATUS_LABELS, DEBT_TYPE_LABELS, EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABELS, GOAL_CATEGORY_LABELS, INCOME_CATEGORY_LABELS, PAYMENT_STATUS_LABELS, type BudgetBillData, type BudgetDebtData, type BudgetGoalData, type BudgetPlanData, type BudgetSnapshot, type DebtStatus, type DebtType, type ExpenseCategory, type GoalCategory, type PaymentStatus } from '../family-budget/types'

const service = new FamilyBudgetService()
const timestamp = () => new Date().toISOString()
const today = localDateKey
/*
  Seis áreas, e não nove.

  "Despesas", "Contas" e "Dívidas" descreviam a mesma coisa — dinheiro saindo —
  e obrigavam a decidir, antes de lançar, em qual das três a conta de luz mora.
  Elas viraram recortes dentro de Saídas. "Planejamento" e "Metas" juntaram-se
  pelo mesmo motivo: planejar o mês e guardar para um sonho são o mesmo gesto
  em prazos diferentes.

  Os endereços antigos continuam funcionando: quem tem um atalho salvo em
  /app/orcamento/dividas chega em Saídas com o recorte de dívidas aberto.
*/
const AREAS = {
  resumo: 'Visão geral',
  entradas: 'Entradas',
  saidas: 'Saídas',
  metas: 'Metas e Planejamento',
  compras: 'Lista de compras',
  relatorios: 'Relatórios',
} as const
type BudgetArea = keyof typeof AREAS

/** O recorte dentro de uma área, quando ela tem mais de um. */
const RECORTES: Partial<Record<BudgetArea, ReadonlyArray<readonly [string, string]>>> = {
  saidas: [['despesas', 'Despesas'], ['contas', 'Contas'], ['dividas', 'Dívidas']],
  metas: [['planejamento', 'Planejamento'], ['metas', 'Metas e sonhos']],
}

/** Endereço antigo para a área que hoje o contém. */
const AREA_DO_ENDERECO: Record<string, { area: BudgetArea; recorte: string }> = {
  resumo: { area: 'resumo', recorte: 'resumo' },
  entradas: { area: 'entradas', recorte: 'entradas' },
  despesas: { area: 'saidas', recorte: 'despesas' },
  contas: { area: 'saidas', recorte: 'contas' },
  dividas: { area: 'saidas', recorte: 'dividas' },
  saidas: { area: 'saidas', recorte: 'despesas' },
  planejamento: { area: 'metas', recorte: 'planejamento' },
  metas: { area: 'metas', recorte: 'metas' },
  compras: { area: 'compras', recorte: 'compras' },
  relatorios: { area: 'relatorios', recorte: 'relatorios' },
}

const sectionLabels = { resumo: 'Visão geral', entradas: 'Entradas', despesas: 'Despesas', planejamento: 'Planejamento', contas: 'Contas', dividas: 'Dívidas', metas: 'Metas', compras: 'Lista de compras', relatorios: 'Relatórios' }

type BudgetSection = keyof typeof sectionLabels

const emptyBill = (): BudgetBillData => ({ name: '', category: 'utilities', amount: 0, dueDate: today(), recurring: false, status: 'pending', notes: '', createdAt: timestamp(), updatedAt: timestamp() })
const emptyDebt = (): BudgetDebtData => ({ name: '', type: 'card', initialAmount: 0, currentBalance: 0, installmentAmount: 0, totalInstallments: 0, paidInstallments: 0, dueDay: 1, interestRate: null, status: 'current', notes: '', payments: [], createdAt: timestamp(), updatedAt: timestamp() })
const emptyGoal = (): BudgetGoalData => ({ name: '', targetAmount: 0, reservedAmount: 0, targetDate: '', category: 'emergency', monthlyContribution: 0, notes: '', deposits: [], createdAt: timestamp(), updatedAt: timestamp() })
const dateInMonth = (month: string, day: number | string) => {
  const requested = Math.max(1, Number(day) || 1)
  const lastDay = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate()
  return `${month}-${String(Math.min(requested, lastDay)).padStart(2, '0')}`
}

function BudgetNav({ section, month }: { section: BudgetSection; month: string }) {
  const atual = AREA_DO_ENDERECO[section] ?? AREA_DO_ENDERECO.resumo!
  const recortes = RECORTES[atual.area]
  return <>
    <nav className="tira-abas" aria-label="Áreas do orçamento pessoal">
      {(Object.keys(AREAS) as BudgetArea[]).map((chave) => <Link
        key={chave}
        className={`chip-aba ${atual.area === chave ? 'chip-aba--ativa' : ''}`}
        aria-current={atual.area === chave ? 'page' : undefined}
        to={`/app/orcamento/${chave === 'saidas' ? 'despesas' : chave === 'metas' ? 'planejamento' : chave}?mes=${month}`}
      >{AREAS[chave]}</Link>)}
    </nav>
    {recortes && <nav className="tira-recortes" aria-label={`Recortes de ${AREAS[atual.area]}`}>
      {recortes.map(([chave, rotulo]) => <Link
        key={chave}
        className={`chip-recorte ${atual.recorte === chave ? 'chip-recorte--ativo' : ''}`}
        aria-current={atual.recorte === chave ? 'page' : undefined}
        to={`/app/orcamento/${chave}?mes=${month}`}
      >{rotulo}</Link>)}
    </nav>}
  </>
}

function MoneyInput({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <label className="field"><span className="field__label">{label}</span><input className="field__input" type="number" min="0" step="0.01" value={value || ''} onChange={(event) => onChange(Number(event.target.value))} /></label>
}


export function FamilyBudgetPage() {
  const { account, masterKey } = useAuthVault()
  const navigate = useNavigate()
  const params = useParams()
  const [searchParams] = useSearchParams()
  const section = (Object.hasOwn(sectionLabels, params.section ?? '') ? params.section : 'resumo') as BudgetSection
  const month = /^\d{4}-\d{2}$/u.test(searchParams.get('mes') ?? '') ? searchParams.get('mes')! : monthKey(new Date())
  const newRequested = searchParams.get('novo') === '1'
  const [snapshot, setSnapshot] = useState<BudgetSnapshot | null>(null)
  const [previous, setPrevious] = useState<BudgetSnapshot | null>(null)
  const [next, setNext] = useState<BudgetSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [billDraft, setBillDraft] = useState<BudgetBillData | null>(null)
  const [billId, setBillId] = useState('')
  const [debtDraft, setDebtDraft] = useState<BudgetDebtData | null>(null)
  const [debtId, setDebtId] = useState('')
  const [goalDraft, setGoalDraft] = useState<BudgetGoalData | null>(null)
  const [goalId, setGoalId] = useState('')
  const [debtMode, setDebtMode] = useState<'smallest' | 'interest'>('smallest')

  const load = useCallback(async () => {
    if (!account || !masterKey) return
    setLoading(true); setError('')
    try {
      const [current, prior, future] = await Promise.all([service.snapshot(account.id, masterKey, month), service.snapshot(account.id, masterKey, shiftMonth(month, -1)), service.snapshot(account.id, masterKey, shiftMonth(month, 1))])
      setSnapshot(current); setPrevious(prior); setNext(future)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível abrir o orçamento.') } finally { setLoading(false) }
  }, [account, masterKey, month])

  useReloadOnSync(load)
  useEffect(() => {
    if (!newRequested) return
    if (section === 'contas') setBillDraft({ ...emptyBill(), dueDate: `${month}-01` })
    if (section === 'dividas') setDebtDraft(emptyDebt())
    if (section === 'metas') setGoalDraft(emptyGoal())
  }, [newRequested, section, month])

  function go(target: BudgetSection, targetMonth = month, create = false) { void navigate(`/app/orcamento/${target}?${new URLSearchParams({ mes: targetMonth, ...(create ? { novo: '1' } : {}) }).toString()}`) }
  function done(message: string) { setNotice(message); setError(''); void load() }
  function fail(reason: unknown) { setError(reason instanceof Error ? reason.message : 'Não foi possível concluir esta ação.'); setNotice('') }
  async function remove(id: string, label: string) { if (!account || !window.confirm(`Deseja excluir ${label}?`)) return; try { await service.remove(account.id, id); done('Registro excluído.') } catch (reason) { fail(reason) } }

  const saveBill = async () => { if (!account || !masterKey || !billDraft) return; if (!(billDraft.amount > 0) || !billDraft.name.trim()) return fail(new Error('Informe o nome e o valor da conta.')); try { await service.saveBill(account.id, masterKey, billDraft, billId || undefined); setBillDraft(null); setBillId(''); done('Conta salva.') } catch (reason) { fail(reason) } }
  const saveDebt = async () => { if (!account || !masterKey || !debtDraft) return; if (!(debtDraft.initialAmount > 0) || !debtDraft.name.trim()) return fail(new Error('Informe o nome e o valor inicial da dívida.')); try { await service.saveDebt(account.id, masterKey, { ...debtDraft, currentBalance: debtId ? debtDraft.currentBalance : debtDraft.currentBalance || debtDraft.initialAmount }, debtId || undefined); setDebtDraft(null); setDebtId(''); done('Dívida salva.') } catch (reason) { fail(reason) } }
  const saveGoal = async () => { if (!account || !masterKey || !goalDraft) return; if (!(goalDraft.targetAmount > 0) || !goalDraft.name.trim()) return fail(new Error('Informe o nome e o valor desejado da meta.')); try { await service.saveGoal(account.id, masterKey, goalDraft, goalId || undefined); setGoalDraft(null); setGoalId(''); done('Meta salva.') } catch (reason) { fail(reason) } }

  if (loading || !snapshot) return <div className="app-loading" role="status">Abrindo Orçamento Familiar…</div>
  const summary = monthlySummary(snapshot)

  return <div className="page-stack family-budget-page">
    <header className="page-hero budget-hero"><div><p className="eyebrow">Orçamento</p><h1>Pessoal</h1></div></header>
    <BudgetAreaNav area="pessoal" month={month} />
    <BudgetNav section={section} month={month} />
    <div className="budget-month-nav"><Button variant="secondary" aria-label="Mês anterior" icon={<ArrowLeft />} onClick={() => go(section, shiftMonth(month, -1))} /><strong>{monthLabel(month)}</strong><Button variant="secondary" aria-label="Próximo mês" icon={<ArrowRight />} onClick={() => go(section, shiftMonth(month, 1))} /><Button variant="quiet" onClick={() => go(section, monthKey(new Date()))}>Mês atual</Button></div>
    {notice && <div className="alert alert--success" role="status">{notice}</div>}
    {error && <div className="alert alert--error" role="alert">{error}</div>}

    {/*
      Visão geral, Entradas e Saídas passam a ser servidas pelo modelo novo.
      As outras áreas continuam no antigo até serem reconstruídas — e o que já
      estava gravado aparece nas três novas por leitura, sem ser convertido.
    */}
    {(section === 'resumo' || section === 'entradas' || section === 'despesas') && <FinancasPessoaisPage
      area={section === 'resumo' ? 'resumo' : section === 'entradas' ? 'entradas' : 'saidas'}
      mes={month}
    />}

    {section === 'planejamento' && <PlanningView snapshot={snapshot} previous={previous} next={next} accountId={account?.id ?? ''} masterKey={masterKey} onDone={done} onFail={fail} />}
    {section === 'contas' && <BillsView snapshot={snapshot} draft={billDraft} setDraft={setBillDraft} editId={billId} setEditId={setBillId} save={() => void saveBill()} remove={(id) => void remove(id, 'esta conta')} accountId={account?.id ?? ''} masterKey={masterKey} month={month} done={done} fail={fail} />}
    {section === 'dividas' && <DebtsView snapshot={snapshot} draft={debtDraft} setDraft={setDebtDraft} editId={debtId} setEditId={setDebtId} save={() => void saveDebt()} remove={(id) => void remove(id, 'esta dívida')} mode={debtMode} setMode={setDebtMode} accountId={account?.id ?? ''} masterKey={masterKey} month={month} done={done} fail={fail} />}
    {section === 'metas' && <GoalsView snapshot={snapshot} draft={goalDraft} setDraft={setGoalDraft} editId={goalId} setEditId={setGoalId} save={() => void saveGoal()} remove={(id) => void remove(id, 'esta meta')} accountId={account?.id ?? ''} masterKey={masterKey} done={done} fail={fail} />}
    {section === 'compras' && <ShoppingListView accountId={account?.id ?? ''} masterKey={masterKey} onDone={done} onFail={fail} />}
    {section === 'relatorios' && <ReportsView snapshot={snapshot} previous={previous} summary={summary} />}
  </div>
}

function PlanningView({ snapshot, previous, next, accountId, masterKey, onDone, onFail }: { snapshot: BudgetSnapshot; previous: BudgetSnapshot | null; next: BudgetSnapshot | null; accountId: string; masterKey: CryptoKey | null; onDone: (message: string) => void; onFail: (reason: unknown) => void }) {
  const [limits, setLimits] = useState<Partial<Record<ExpenseCategory, number>>>(snapshot.plan?.limits ?? {})
  useEffect(() => setLimits(snapshot.plan?.limits ?? {}), [snapshot.plan])
  const spending = categorySpending(snapshot.expenses, snapshot.bills)
  const future = next ? forecastSummary(next) : null
  async function save() { if (!masterKey) return; const value: BudgetPlanData = { month: snapshot.month, limits, createdAt: snapshot.plan?.createdAt ?? timestamp(), updatedAt: timestamp() }; try { await service.savePlan(accountId, masterKey, value, snapshot.plan?.id); onDone('Planejamento salvo.') } catch (reason) { onFail(reason) } }
  return <><div className="page-actions"><Button icon={<Copy />} variant="secondary" disabled={!previous?.plan} onClick={() => setLimits(previous?.plan?.limits ?? {})}>Copiar mês anterior</Button><Button icon={<Check />} onClick={() => void save()}>Salvar planejamento</Button></div><Card title="Planejar o mês"><div className="budget-plan-list">{EXPENSE_CATEGORIES.map((category) => { const planned = limits[category] ?? 0; const spent = spending[category]; const remaining = planned - spent; return <div key={category}><span><strong>{EXPENSE_CATEGORY_LABELS[category]}</strong><small>Gasto: {currency(spent)} · {remaining >= 0 ? `restam ${currency(remaining)}` : `ultrapassou ${currency(Math.abs(remaining))}`}</small></span><MoneyInput label="Planejado" value={planned} onChange={(amount) => setLimits({ ...limits, [category]: amount })} /><progress max={Math.max(planned, spent, 1)} value={spent} /></div> })}</div></Card><Card title="Próximo mês" eyebrow={next ? monthLabel(next.month) : ''}><div className="budget-next-grid"><span>Entradas previstas<strong>{currency(next?.incomes.reduce((total, item) => total + item.amount, 0) ?? 0)}</strong></span><span>Contas fixas<strong>{currency(next?.bills.reduce((total, item) => total + item.amount, 0) ?? 0)}</strong></span><span>Parcelas e dívidas<strong>{currency(next?.debts.filter((item) => item.status !== 'paid_off').reduce((total, item) => total + item.installmentAmount, 0) ?? 0)}</strong></span><span>Metas planejadas<strong>{currency(next?.goals.reduce((total, item) => total + item.monthlyContribution, 0) ?? 0)}</strong></span><span>Estimativa de sobra<strong>{currency(future?.available ?? 0)}</strong></span></div></Card></>
}

function BillsView({ snapshot, draft, setDraft, editId, setEditId, save, remove, accountId, masterKey, month, done, fail }: { snapshot: BudgetSnapshot; draft: BudgetBillData | null; setDraft: (value: BudgetBillData | null) => void; editId: string; setEditId: (value: string) => void; save: () => void; remove: (id: string) => void; accountId: string; masterKey: CryptoKey | null; month: string; done: (message: string) => void; fail: (reason: unknown) => void }) {
  return <><div className="page-actions"><Button icon={<Plus />} onClick={() => { setEditId(''); setDraft({ ...emptyBill(), dueDate: `${month}-01` }) }}>Nova conta</Button></div>{draft && <Card title={editId ? 'Editar conta' : 'Nova conta'}><div className="form-grid"><label className="field"><span className="field__label">Nome da conta</span><input className="field__input" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label><label className="field"><span className="field__label">Categoria</span><select className="field__input" value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value as ExpenseCategory })}>{Object.entries(EXPENSE_CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><MoneyInput label="Valor" value={draft.amount} onChange={(amount) => setDraft({ ...draft, amount })} /><label className="field"><span className="field__label">Vencimento</span><input className="field__input" type="date" value={draft.dueDate} onChange={(event) => setDraft({ ...draft, dueDate: event.target.value })} /></label><label className="field"><span className="field__label">Situação</span><select className="field__input" value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as PaymentStatus })}>{Object.entries(PAYMENT_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="confirmation-check"><input type="checkbox" checked={draft.recurring} onChange={(event) => setDraft({ ...draft, recurring: event.target.checked })} /><span>Repetir mensalmente</span></label></div><label className="field"><span className="field__label">Observação</span><textarea className="field__input field__textarea" value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></label><div className="form-actions"><Button onClick={save}>Salvar conta</Button><Button variant="secondary" onClick={() => setDraft(null)}>Cancelar</Button></div></Card>}<Card title="Contas a pagar"><div className="budget-list">{snapshot.bills.map((bill) => <article className={effectivePaymentStatus(bill.status, bill.dueDate) === 'overdue' ? 'overdue' : ''} key={bill.id}><span><strong>{bill.name}</strong><small>{EXPENSE_CATEGORY_LABELS[bill.category]} · vence {bill.dueDate} · {PAYMENT_STATUS_LABELS[effectivePaymentStatus(bill.status, bill.dueDate)]}{bill.projected ? ' · Prevista' : ''}</small></span><strong>{currency(bill.amount)}</strong><div className="form-actions">{bill.projected ? <><Button variant="secondary" onClick={async () => { if (!masterKey) return; try { await service.confirmBill(accountId, masterKey, bill); done('Conta prevista confirmada.') } catch (reason) { fail(reason) } }}>Confirmar</Button><Button variant="quiet" onClick={() => { setEditId(''); setDraft({ ...bill }) }}>Editar</Button><Button variant="quiet" onClick={async () => { if (!masterKey || !bill.recurrenceId) return; await service.skipProjection(accountId, masterKey, 'bill', bill.recurrenceId, month); done('Previsão removida deste mês.') }}>Remover</Button></> : <><Button variant="quiet" onClick={() => { setEditId(bill.id); setDraft({ ...bill }) }}>Editar</Button><Button variant="danger" icon={<Trash2 />} aria-label={`Excluir conta ${bill.name}`} onClick={() => remove(bill.id)} /></>}</div></article>)}</div></Card></>
}

function DebtsView({ snapshot, draft, setDraft, editId, setEditId, save, remove, mode, setMode, accountId, masterKey, month, done, fail }: { snapshot: BudgetSnapshot; draft: BudgetDebtData | null; setDraft: (value: BudgetDebtData | null) => void; editId: string; setEditId: (value: string) => void; save: () => void; remove: (id: string) => void; mode: 'smallest' | 'interest'; setMode: (mode: 'smallest' | 'interest') => void; accountId: string; masterKey: CryptoKey | null; month: string; done: (message: string) => void; fail: (reason: unknown) => void }) {
  const plan = debtPlan({ incomes: snapshot.incomes, expenses: snapshot.expenses, bills: snapshot.bills, debts: snapshot.debts, mode })
  const active = snapshot.debts.filter((item) => item.status !== 'paid_off')
  return <><section className="budget-metrics"><div><span>Dívidas ativas</span><strong>{currency(active.reduce((total, item) => total + item.currentBalance, 0))}</strong></div><div><span>Parcelas do mês</span><strong>{currency(active.reduce((total, item) => total + item.installmentAmount, 0))}</strong></div><div><span>Quantidade</span><strong>{active.length}</strong></div><div><span>Atrasadas</span><strong>{active.filter((item) => item.status === 'overdue').length}</strong></div></section><div className="page-actions"><Button icon={<Plus />} onClick={() => { setEditId(''); setDraft(emptyDebt()) }}>Nova dívida</Button></div>{draft && <Card title={editId ? 'Editar dívida' : 'Nova dívida'}><div className="form-grid"><label className="field"><span className="field__label">Nome da dívida</span><input className="field__input" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label><label className="field"><span className="field__label">Tipo</span><select className="field__input" value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value as DebtType })}>{Object.entries(DEBT_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><MoneyInput label="Valor total inicial" value={draft.initialAmount} onChange={(initialAmount) => setDraft({ ...draft, initialAmount })} /><MoneyInput label="Saldo atual" value={draft.currentBalance} onChange={(currentBalance) => setDraft({ ...draft, currentBalance })} /><MoneyInput label="Valor da parcela" value={draft.installmentAmount} onChange={(installmentAmount) => setDraft({ ...draft, installmentAmount })} /><label className="field"><span className="field__label">Total de parcelas</span><input className="field__input" type="number" min="0" value={draft.totalInstallments || ''} onChange={(event) => setDraft({ ...draft, totalInstallments: Number(event.target.value) })} /></label><label className="field"><span className="field__label">Parcelas pagas</span><input className="field__input" type="number" min="0" value={draft.paidInstallments || ''} onChange={(event) => setDraft({ ...draft, paidInstallments: Number(event.target.value) })} /></label><label className="field"><span className="field__label">Dia do vencimento</span><input className="field__input" type="number" min="1" max="31" value={draft.dueDay} onChange={(event) => setDraft({ ...draft, dueDay: Number(event.target.value) })} /></label><MoneyInput label="Juros ao mês (opcional, %)" value={draft.interestRate ?? 0} onChange={(interestRate) => setDraft({ ...draft, interestRate: interestRate || null })} /><label className="field"><span className="field__label">Situação</span><select className="field__input" value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as DebtStatus })}>{Object.entries(DEBT_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div><label className="field"><span className="field__label">Observação</span><textarea className="field__input field__textarea" value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></label><div className="form-actions"><Button onClick={save}>Salvar dívida</Button><Button variant="secondary" onClick={() => setDraft(null)}>Cancelar</Button></div></Card>}<Card title="Dívidas"><div className="budget-debt-list">{snapshot.debts.map((debt) => <article key={debt.id}><div><span><strong>{debt.name}</strong><small>{DEBT_TYPE_LABELS[debt.type]} · {DEBT_STATUS_LABELS[debt.status]}</small></span><strong>{currency(debt.currentBalance)}</strong></div><progress max={debt.initialAmount || 1} value={debt.initialAmount - debt.currentBalance} /><small>{debtProgress(debt).toFixed(0)}% quitada{debtEndEstimate(debt) !== null ? ` · cerca de ${debtEndEstimate(debt)} mês(es) restantes` : ''}</small><div className="form-actions"><Button variant="secondary" icon={<HandCoins />} onClick={async () => { if (!masterKey) return; const value = window.prompt('Valor pago nesta parcela:', String(debt.installmentAmount || '')); if (!value) return; try { await service.payDebt(accountId, masterKey, debt, Number(value.replace(',', '.')), dateInMonth(month, debt.dueDay)); done('Pagamento registrado.') } catch (reason) { fail(reason) } }}>Registrar parcela</Button><Button variant="quiet" onClick={() => { setEditId(debt.id); setDraft({ ...debt }) }}>Editar</Button><Button variant="danger" icon={<Trash2 />} aria-label={`Excluir dívida ${debt.name}`} onClick={() => remove(debt.id)} /></div></article>)}</div></Card><Card title="Meu plano de dívidas" eyebrow="Simulação"><div className="segmented" role="group" aria-label="Modo de simulação"><button className={mode === 'smallest' ? 'active' : ''} onClick={() => setMode('smallest')}>Quitar menores primeiro</button><button className={mode === 'interest' ? 'active' : ''} onClick={() => setMode('interest')}>Priorizar juros maiores</button></div><p className="muted">O primeiro modo traz vitórias mais rápidas. O segundo prioriza taxas maiores quando elas foram informadas.</p><div className="budget-next-grid"><span>Entrou no mês<strong>{currency(plan.income)}</strong></span><span>Despesas essenciais<strong>{currency(plan.essential)}</strong></span><span>Comprometido com parcelas<strong>{currency(plan.installments)}</strong></span><span>Disponível para acelerar<strong>{currency(plan.available)}</strong></span><span>Previsão aproximada<strong>{plan.months ? `${plan.months} mês(es)` : 'Ainda não disponível'}</strong></span></div>{plan.available === 0 && <div className="alert">Revise o planejamento do mês e veja quais gastos podem ser ajustados.</div>}<ol className="budget-plan-order">{plan.ordered.map((debt) => <li key={debt.id}><span>{debt.name}</span><strong>{currency(debt.currentBalance)}</strong></li>)}</ol></Card></>
}

function GoalsView({ snapshot, draft, setDraft, editId, setEditId, save, remove, accountId, masterKey, done, fail }: { snapshot: BudgetSnapshot; draft: BudgetGoalData | null; setDraft: (value: BudgetGoalData | null) => void; editId: string; setEditId: (value: string) => void; save: () => void; remove: (id: string) => void; accountId: string; masterKey: CryptoKey | null; done: (message: string) => void; fail: (reason: unknown) => void }) {
  return <><div className="page-actions"><Button icon={<Plus />} onClick={() => { setEditId(''); setDraft(emptyGoal()) }}>Nova meta</Button></div>{draft && <Card title={editId ? 'Editar meta' : 'Nova meta'}><div className="form-grid"><label className="field"><span className="field__label">Nome da meta</span><input className="field__input" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label><label className="field"><span className="field__label">Categoria</span><select className="field__input" value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value as GoalCategory })}>{Object.entries(GOAL_CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><MoneyInput label="Valor desejado" value={draft.targetAmount} onChange={(targetAmount) => setDraft({ ...draft, targetAmount })} /><MoneyInput label="Valor já reservado" value={draft.reservedAmount} onChange={(reservedAmount) => setDraft({ ...draft, reservedAmount })} /><MoneyInput label="Contribuição mensal planejada" value={draft.monthlyContribution} onChange={(monthlyContribution) => setDraft({ ...draft, monthlyContribution })} /><label className="field"><span className="field__label">Prazo desejado</span><input className="field__input" type="date" value={draft.targetDate} onChange={(event) => setDraft({ ...draft, targetDate: event.target.value })} /></label></div><label className="field"><span className="field__label">Observação</span><textarea className="field__input field__textarea" value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></label><div className="form-actions"><Button onClick={save}>Salvar meta</Button><Button variant="secondary" onClick={() => setDraft(null)}>Cancelar</Button></div></Card>}<div className="budget-goal-grid">{snapshot.goals.map((goal) => <Card key={goal.id} title={goal.name} eyebrow={GOAL_CATEGORY_LABELS[goal.category]}><div className="budget-goal-progress"><strong>{currency(goal.reservedAmount)} de {currency(goal.targetAmount)}</strong><progress max={goal.targetAmount || 1} value={goal.reservedAmount} /><small>{Math.min(100, goal.targetAmount ? goal.reservedAmount / goal.targetAmount * 100 : 0).toFixed(0)}% concluída{goal.targetDate ? ` · prazo ${goal.targetDate}` : ''}</small></div><div className="form-actions"><Button variant="secondary" icon={<CircleDollarSign />} onClick={async () => { if (!masterKey) return; const value = window.prompt('Valor do depósito:'); if (!value) return; try { await service.depositGoal(accountId, masterKey, goal, Number(value.replace(',', '.')), today()); done('Depósito registrado na meta.') } catch (reason) { fail(reason) } }}>Registrar depósito</Button><Button variant="quiet" onClick={() => { setEditId(goal.id); setDraft({ ...goal }) }}>Editar</Button><Button variant="danger" icon={<Trash2 />} aria-label={`Excluir meta ${goal.name}`} onClick={() => remove(goal.id)} /></div></Card>)}</div></>
}

function ReportsView({ snapshot, previous, summary }: { snapshot: BudgetSnapshot; previous: BudgetSnapshot | null; summary: ReturnType<typeof monthlySummary> }) {
  const spending = categorySpending(snapshot.expenses, snapshot.bills)
  const previousSummary = previous ? monthlySummary(previous) : null
  const lines = [`Mês: ${monthLabel(snapshot.month)}`, `Entradas: ${currency(summary.income)}`, `Saídas: ${currency(summary.outflow)}`, `Disponível: ${currency(summary.available)}`, `Dívidas ativas: ${currency(summary.debtTotal)}`, '', 'Gastos por categoria:', ...EXPENSE_CATEGORIES.filter((category) => spending[category] > 0).map((category) => `${EXPENSE_CATEGORY_LABELS[category]}: ${currency(spending[category])}`), '', `Contas pagas: ${snapshot.bills.filter((item) => item.status === 'paid').length}`, `Contas pendentes: ${snapshot.bills.filter((item) => effectivePaymentStatus(item.status, item.dueDate) === 'pending').length}`, `Contas atrasadas: ${snapshot.bills.filter((item) => effectivePaymentStatus(item.status, item.dueDate) === 'overdue').length}`, `Metas: ${snapshot.goals.length}`]
  const rows = [['Tipo', 'Descrição', 'Categoria', 'Data', 'Valor', 'Situação'], ...snapshot.incomes.filter((item) => !item.projected).map((item) => ['Entrada', item.description, INCOME_CATEGORY_LABELS[item.category], item.date, item.amount.toFixed(2), 'Confirmada']), ...snapshot.expenses.filter((item) => !item.projected).map((item) => ['Despesa', item.description, EXPENSE_CATEGORY_LABELS[item.category], item.date, item.amount.toFixed(2), PAYMENT_STATUS_LABELS[effectivePaymentStatus(item.status, item.date)]]), ...snapshot.bills.filter((item) => !item.projected).map((item) => ['Conta', item.name, EXPENSE_CATEGORY_LABELS[item.category], item.dueDate, item.amount.toFixed(2), PAYMENT_STATUS_LABELS[effectivePaymentStatus(item.status, item.dueDate)]])]
  return <><div className="page-actions"><Button icon={<Download />} onClick={() => downloadBudgetPdf('Orçamento Familiar', lines, snapshot.month)}>Gerar PDF local</Button><Button variant="secondary" icon={<Download />} onClick={() => downloadBudgetCsv(rows, snapshot.month)}>Exportar planilha local</Button></div><section className="budget-metrics"><div><span>Entradas</span><strong>{currency(summary.income)}</strong></div><div><span>Saídas</span><strong>{currency(summary.outflow)}</strong></div><div><span>Disponível</span><strong>{currency(summary.available)}</strong></div><div><span>Comparação com mês anterior</span><strong>{previousSummary ? currency(summary.outflow - previousSummary.outflow) : 'Sem dados'}</strong></div></section><div className="home-grid"><Card title="Gastos por categoria"><div className="budget-report-categories">{EXPENSE_CATEGORIES.filter((category) => spending[category] > 0).map((category) => <div key={category}><span>{EXPENSE_CATEGORY_LABELS[category]}</span><strong>{currency(spending[category])}</strong></div>)}</div></Card><Card title="Situação das contas"><div className="budget-next-grid"><span>Pagas<strong>{snapshot.bills.filter((item) => item.status === 'paid').length}</strong></span><span>Pendentes<strong>{snapshot.bills.filter((item) => effectivePaymentStatus(item.status, item.dueDate) === 'pending').length}</strong></span><span>Atrasadas<strong>{snapshot.bills.filter((item) => effectivePaymentStatus(item.status, item.dueDate) === 'overdue').length}</strong></span><span>Dívidas ativas<strong>{snapshot.debts.filter((item) => item.status !== 'paid_off').length}</strong></span><span>Metas<strong>{snapshot.goals.length}</strong></span></div></Card></div></>
}
