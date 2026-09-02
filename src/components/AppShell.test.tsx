import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppShell } from './AppShell'

const auth = vi.hoisted(() => ({ account: { email: 'menu-ficticio@example.invalid' }, lock: vi.fn() }))

vi.mock('../auth/AuthVaultContext', () => ({ useAuthVault: () => auth }))

afterEach(() => { cleanup(); vi.restoreAllMocks(); auth.lock.mockReset() })

function renderShell() {
  render(<MemoryRouter initialEntries={['/app']}><Routes><Route path="/app" element={<AppShell />}><Route index element={<div>Início</div>} /></Route></Routes></MemoryRouter>)
}

describe('menu do aplicativo', () => {
  it('oferece os atalhos principais e a área Mais sem linguagem técnica', () => {
    renderShell()
    for (const label of ['Início', 'Agenda', 'Distrito', 'Visitação', 'Fidelidade', 'Sermões', 'Metas', 'Planejamento Anual', 'Evangelismo', 'Leitura', 'Orçamento Familiar', 'Mais']) expect(screen.getAllByRole('link', { name: label }).length).toBeGreaterThan(0)
    expect(screen.queryByText('V1 · Cuidado pastoral')).not.toBeInTheDocument()
    expect(screen.queryByText('Cofre desbloqueado')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Orçamento Familiar' })).toHaveClass('nav-item--personal')
    expect(screen.getByRole('link', { name: 'Leitura' })).toHaveClass('nav-item--personal')
    // Pessoas, famílias e cuidado pastoral moram dentro de Distrito e Visitação.
    for (const label of ['Pessoas e famílias', 'Visitas e cuidados', 'Pedidos de Oração']) expect(screen.queryByRole('link', { name: label })).not.toBeInTheDocument()
  })

  it('pede confirmação antes de sair e preserva a proteção de bloqueio', async () => {
    const user = userEvent.setup()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderShell()
    const leaveButton = screen.getAllByRole('button', { name: 'Sair' })[0]
    expect(leaveButton).toBeDefined()
    if (!leaveButton) return
    await user.click(leaveButton)
    expect(confirm).toHaveBeenCalledWith('Deseja sair do Apoio Pastoral neste dispositivo?')
    expect(auth.lock).toHaveBeenCalledOnce()
  })
})
