import axe from 'axe-core'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
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

describe('acessibilidade essencial', () => {
  it('não apresenta violações críticas ou sérias na tela de acesso', async () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/acesso']}>
        <App />
      </MemoryRouter>,
    )
    await screen.findByRole('heading', { name: /crie sua conta/i }, { timeout: 5_000 })
    const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })
    expect(results.violations.filter(({ impact }) => impact === 'critical' || impact === 'serious')).toEqual([])
  })
})
