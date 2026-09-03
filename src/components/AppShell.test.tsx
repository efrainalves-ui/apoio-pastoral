import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppShell } from './AppShell'

const auth = vi.hoisted(() => ({ account: { email: 'menu-ficticio@example.invalid' }, lock: vi.fn(), signOut: vi.fn(() => Promise.resolve()) }))

vi.mock('../auth/AuthVaultContext', () => ({ useAuthVault: () => auth }))

afterEach(() => { cleanup(); vi.restoreAllMocks(); auth.lock.mockReset(); auth.signOut.mockReset() })

function renderShell() {
  render(<MemoryRouter initialEntries={['/app']}><Routes><Route path="/app" element={<AppShell />}><Route index element={<div>Início</div>} /></Route></Routes></MemoryRouter>)
}

describe('menu do aplicativo', () => {
  it('oferece os atalhos principais sem linguagem técnica', () => {
    renderShell()
    for (const label of ['Início', 'Agenda', 'Distrito', 'Visitação', 'Fidelidade', 'Sermões', 'Metas', 'Planejamento Anual', 'Evangelismo', 'Leitura', 'Orçamento', 'Materiais']) expect(screen.getAllByRole('link', { name: label }).length).toBeGreaterThan(0)
    expect(screen.queryByText('V1 · Cuidado pastoral')).not.toBeInTheDocument()
    expect(screen.queryByText('Cofre desbloqueado')).not.toBeInTheDocument()
    // Orçamento continua marcado como área pessoal no menu, mesmo agora que
    // ele reúne Pessoal e Trabalho: quem entra ali entra pelo lado da família.
    expect(screen.getByRole('link', { name: 'Orçamento' })).toHaveClass('nav-item--personal')
    expect(screen.getByRole('link', { name: 'Leitura' })).toHaveClass('nav-item--personal')
    // Pessoas, famílias e cuidado pastoral moram dentro de Distrito e Visitação.
    for (const label of ['Pessoas e famílias', 'Visitas e cuidados', 'Pedidos de Oração']) expect(screen.queryByRole('link', { name: label })).not.toBeInTheDocument()
    // As configurações são só o ícone, ao lado de Sair; trocar de conta saiu.
    expect(screen.queryByText('Mais')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Trocar conta' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Configurações' }).length).toBeGreaterThan(0)
  })

  it('pede confirmação antes de sair e encerra a sessão no serviço', async () => {
    // Sair precisa encerrar a sessão, não só fechar o cofre: antes o aparelho
    // seguia autenticado depois de o pastor achar que tinha saído.
    const user = userEvent.setup()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderShell()
    const leaveButton = screen.getAllByRole('button', { name: 'Sair' })[0]
    expect(leaveButton).toBeDefined()
    if (!leaveButton) return
    await user.click(leaveButton)
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('encerra sua sessão'))
    expect(auth.signOut).toHaveBeenCalledOnce()
    expect(auth.lock).not.toHaveBeenCalled()
  })

  it('bloqueia o cofre sem encerrar a sessão', async () => {
    const user = userEvent.setup()
    renderShell()
    const botao = screen.getAllByRole('button', { name: 'Bloquear cofre' })[0]
    expect(botao).toBeDefined()
    if (!botao) return
    await user.click(botao)
    expect(auth.lock).toHaveBeenCalledOnce()
    expect(auth.signOut).not.toHaveBeenCalled()
  })
})
