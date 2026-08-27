import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'

const auth = vi.hoisted(() => ({
  account: null,
  masterKey: null,
  initialized: true,
  recoveryCode: null,
  register: vi.fn(),
  unlock: vi.fn(),
  recover: vi.fn(),
  clearRecoveryCode: vi.fn(),
}))

vi.mock('../auth/AuthVaultContext', () => ({ useAuthVault: () => auth }))

afterEach(cleanup)

describe('shell do aplicativo', () => {
  it('mostra a entrada segura quando não existe sessão desbloqueada', async () => {
    render(<MemoryRouter initialEntries={['/acesso']}><App /></MemoryRouter>)
    expect(await screen.findByRole('heading', { name: /crie sua conta/i })).toBeInTheDocument()
    expect(screen.getByText(/seus dados, só seus/i)).toBeInTheDocument()
  })

  it('protege uma rota interna enquanto não existe sessão desbloqueada', async () => {
    render(<MemoryRouter initialEntries={['/app/distrito']}><App /></MemoryRouter>)
    expect(await screen.findByRole('heading', { name: /crie sua conta/i })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /visão do distrito/i })).not.toBeInTheDocument()
  })
})
