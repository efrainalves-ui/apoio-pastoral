import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BackupPage } from './BackupPage'

vi.mock('../auth/AuthVaultContext', () => ({ useAuthVault: () => ({ accounts: [], account: null, masterKey: null }) }))
afterEach(cleanup)

describe('confirmação visual da restauração', () => {
  it('explica substituição e exige confirmação explícita', () => {
    render(<BackupPage />)
    expect(screen.getByText(/podem substituir versões locais/i)).toBeVisible()
    expect(screen.getByText(/não inclui o Orçamento Familiar/i)).toBeVisible()
    fireEvent.change(screen.getByLabelText('Arquivo de backup'), { target: { files: [new File(['fictício'], 'backup-ficticio.apb')] } })
    const button = screen.getByRole('button', { name: 'Restaurar este backup' })
    expect(button).toBeDisabled()
    fireEvent.click(screen.getByRole('checkbox'))
    expect(button).toBeEnabled()
  })
})
