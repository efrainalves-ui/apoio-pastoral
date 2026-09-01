import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { encryptPayload, generateMasterKey } from '../crypto/vault'
import { db } from '../db/database'

const auth = vi.hoisted(() => ({ account: null as { id: string; email: string } | null, masterKey: null as CryptoKey | null }))
vi.mock('../auth/AuthVaultContext', () => ({ useAuthVault: () => ({ accounts: [], ...auth }) }))

import { NewDistrictPage } from './NewDistrictPage'

describe('cancelamento de Novo Distrito', () => {
  beforeEach(async () => {
    await db.delete(); await db.open(); localStorage.clear(); auth.account = { id: 'new-district-account', email: 'novo.distrito@example.invalid' }; auth.masterKey = await generateMasterKey()
    await db.vaultRecords.put({ id: 'district-fixture', accountId: auth.account.id, recordType: 'district', version: 1, createdAt: '2026-08-20T00:00:00.000Z', updatedAt: '2026-08-20T00:00:00.000Z', ...(await encryptPayload(auth.masterKey, { schemaVersion: 1, type: 'district', data: { name: 'Distrito Fictício' } }, 'district-fixture')) })
  })

  afterEach(async () => { await db.delete(); auth.account = null; auth.masterKey = null })

  it('cancela sem alterar dados e retorna à criação do distrito', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter initialEntries={['/app/novo-distrito']}><Routes><Route path="/app/novo-distrito" element={<NewDistrictPage />} /><Route path="/app/distrito" element={<h1>Criação do novo distrito</h1>} /></Routes></MemoryRouter>)
    expect(await screen.findByText('Registros atuais:')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(await screen.findByRole('heading', { name: 'Criação do novo distrito' })).toBeInTheDocument()
    expect(await db.vaultRecords.where('accountId').equals('new-district-account').count()).toBe(1)
  })
})
