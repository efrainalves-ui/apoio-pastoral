import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({
  account: { id: 'restricted-feature-account', email: 'v1@example.invalid' },
  masterKey: {} as CryptoKey,
  initialized: true,
  recoveryCode: null as string | null,
  lock: vi.fn(),
}))

vi.mock('../auth/AuthVaultContext', () => ({ useAuthVault: () => auth }))

import { App } from './App'

afterEach(() => cleanup())

describe('recursos temporariamente desativados', () => {
  it.each(['/app/transferencia', '/app/novo-distrito'])('redireciona a rota removida %s para a configuração inicial quando não há distrito', async (path) => {
    render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>)
    expect(await screen.findByRole('heading', { name: 'Vamos organizar seu distrito' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /transferência de distrito|iniciar novo distrito/i })).not.toBeInTheDocument()
  })
})
