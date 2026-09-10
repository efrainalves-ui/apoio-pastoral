import { ArrowLeft, ArrowRight } from 'lucide-react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Link } from 'react-router-dom'
import { BudgetAreaNav } from '../components/BudgetAreaNav'
import { FinancasPessoaisPage } from './FinancasPessoaisPage'
import { Button } from '../components/ui/Button'
import { monthKey, monthLabel, shiftMonth } from '../family-budget/core'
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

/** Qual área do modelo novo atende cada endereço. */
const AREA_NOVA: Partial<Record<string, 'resumo' | 'entradas' | 'saidas' | 'metas' | 'compras' | 'relatorios'>> = {
  resumo: 'resumo', entradas: 'entradas', despesas: 'saidas', contas: 'saidas', dividas: 'saidas',
  planejamento: 'metas', metas: 'metas', compras: 'compras', relatorios: 'relatorios',
}

const sectionLabels = { resumo: 'Visão geral', entradas: 'Entradas', despesas: 'Despesas', planejamento: 'Planejamento', contas: 'Contas', dividas: 'Dívidas', metas: 'Metas', compras: 'Lista de compras', relatorios: 'Relatórios' }

type BudgetSection = keyof typeof sectionLabels


function BudgetNav({ section, month }: { section: BudgetSection; month: string }) {
  const atual = AREA_DO_ENDERECO[section] ?? AREA_DO_ENDERECO.resumo!
  return <>
    <nav className="tira-abas" aria-label="Áreas do orçamento pessoal">
      {(Object.keys(AREAS) as BudgetArea[]).map((chave) => <Link
        key={chave}
        className={`chip-aba ${atual.area === chave ? 'chip-aba--ativa' : ''}`}
        aria-current={atual.area === chave ? 'page' : undefined}
        to={`/app/orcamento/${chave === 'saidas' ? 'despesas' : chave === 'metas' ? 'planejamento' : chave}?mes=${month}`}
      >{AREAS[chave]}</Link>)}
    </nav>

  </>
}

/**
 * A casca do Orçamento Pessoal.
 *
 * Ela guarda o que é comum às seis áreas — a alternância Pessoal/Trabalho, a
 * navegação e o mês escolhido — e entrega o resto ao módulo novo. Os dados
 * ficam onde são usados: cada área carrega o que precisa, e não há mais um
 * retrato do mês inteiro sendo aberto para depois ser descartado.
 */
export function FamilyBudgetPage() {
  const params = useParams()
  const [search] = useSearchParams()
  const navigate = useNavigate()
  const section = (Object.hasOwn(sectionLabels, params.section ?? '') ? params.section : 'resumo') as BudgetSection
  const month = search.get('mes') ?? monthKey(new Date())

  const irPara = (mes: string) => void navigate(`/app/orcamento/${section}?${new URLSearchParams({ mes }).toString()}`)

  return <div className="page-stack family-budget-page">
    <header className="page-hero budget-hero"><div><p className="eyebrow">Orçamento</p><h1>Pessoal</h1></div></header>
    <BudgetAreaNav area="pessoal" month={month} />
    <BudgetNav section={section} month={month} />

    <div className="budget-month-nav">
      <Button variant="secondary" aria-label="Mês anterior" icon={<ArrowLeft />} onClick={() => irPara(shiftMonth(month, -1))} />
      <strong>{monthLabel(month)}</strong>
      <Button variant="secondary" aria-label="Próximo mês" icon={<ArrowRight />} onClick={() => irPara(shiftMonth(month, 1))} />
      <Button variant="quiet" onClick={() => irPara(monthKey(new Date()))}>Mês atual</Button>
    </div>

    {AREA_NOVA[section] && <FinancasPessoaisPage area={AREA_NOVA[section]} mes={month} />}
  </div>
}
