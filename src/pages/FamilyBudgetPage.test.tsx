import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FamilyBudgetPage } from './FamilyBudgetPage'

const auth = vi.hoisted(() => ({ account: { id: 'conta-orcamento-ficticia' }, masterKey: {} as CryptoKey }))
const calls = vi.hoisted(() => ({ saveExpense: vi.fn(), remove: vi.fn() }))
const stamps = { createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z' }
const snapshot = (month: string) => ({ month, incomes: [], expenses: [], bills: [], debts: [], goals: [], plan: null })

vi.mock('../auth/AuthVaultContext', () => ({ useAuthVault: () => auth }))
vi.mock('../family-budget/service', () => ({ FamilyBudgetService: class {
  snapshot = vi.fn((_accountId: string, _masterKey: CryptoKey, month: string) => Promise.resolve(snapshot(month)))
  saveExpense = calls.saveExpense
  remove = calls.remove
} }))

afterEach(() => { cleanup(); calls.saveExpense.mockReset().mockImplementation((_accountId, _masterKey, input) => Promise.resolve({ id: 'despesa-ficticia', ...input, ...stamps })); calls.remove.mockReset() })

function renderBudget(entry: string) {
  render(<MemoryRouter initialEntries={[entry]}><Routes><Route path="/app/orcamento/:section" element={<FamilyBudgetPage />} /></Routes></MemoryRouter>)
}

describe('interface do orçamento pessoal', () => {
  /*
    Seis áreas, e não nove. "Despesas", "Contas" e "Dívidas" descreviam a mesma
    coisa — dinheiro saindo — e viraram recortes dentro de Saídas; planejar o
    mês e guardar para um sonho juntaram-se em Metas e Planejamento.
  */
  it('mostra estado vazio acolhedor e as seis áreas do módulo', async () => {
    renderBudget('/app/orcamento/resumo?mes=2026-08')
    expect(await screen.findByRole('heading', { name: 'Pessoal' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Comece com o que já sabe' })).toBeInTheDocument()
    for (const label of ['Visão geral', 'Entradas', 'Saídas', 'Metas e Planejamento', 'Lista de compras', 'Relatórios']) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument()
    }
  })

  it('o endereço antigo continua chegando, agora dentro da área que o contém', async () => {
    renderBudget('/app/orcamento/dividas?mes=2026-08')
    expect(await screen.findByRole('link', { name: 'Saídas' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Dívidas' })).toHaveAttribute('aria-current', 'page')
  })

  it('as duas áreas do Orçamento ficam visíveis o tempo todo', async () => {
    // A separação entre o dinheiro da família e o do ministério é o ponto do
    // módulo: ela não pode depender de o pastor lembrar de abrir um menu.
    renderBudget('/app/orcamento/resumo?mes=2026-08')
    const areas = await screen.findByRole('navigation', { name: 'Áreas do Orçamento' })
    expect(within(areas).getByRole('link', { name: 'Pessoal' })).toHaveClass('active')
    expect(within(areas).getByRole('link', { name: 'Trabalho' })).toHaveAttribute('href', expect.stringContaining('/app/orcamento/trabalho/resumo'))
  })

  it('explica e registra o dízimo somente como acompanhamento', async () => {
    const user = userEvent.setup()
    renderBudget('/app/orcamento/despesas?mes=2026-08&novo=1')
    await screen.findByRole('heading', { name: 'Nova despesa' })
    await user.selectOptions(screen.getAllByLabelText('Categoria')[0]!, 'tithe')
    expect(screen.getByText('O dízimo já foi descontado do salário?')).toBeInTheDocument()
    await user.click(screen.getByLabelText('Sim, apenas registrar'))
    expect(screen.getByText('O valor será acompanhado, mas não diminuirá novamente o disponível.')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Descrição'), 'Dízimo Fictício')
    await user.type(screen.getByLabelText('Valor'), '300')
    await user.click(screen.getByRole('button', { name: 'Salvar despesa' }))
    expect(calls.saveExpense).toHaveBeenCalledWith('conta-orcamento-ficticia', auth.masterKey, expect.objectContaining({ category: 'tithe', titheDeducted: true, amount: 300 }), undefined)
  })
})
