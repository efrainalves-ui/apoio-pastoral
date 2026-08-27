import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { generateMasterKey } from '../crypto/vault'
import { db } from '../db/database'
import { DistrictService } from '../district/service'

const auth = vi.hoisted(() => ({
  account: null as { id: string; email: string } | null,
  masterKey: null as CryptoKey | null,
}))

vi.mock('../auth/AuthVaultContext', () => ({
  useAuthVault: () => ({ ...auth }),
}))

import { ChurchFormPage } from './ChurchFormPage'
import { DistrictPage } from './DistrictPage'

describe('telas do BL-004', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    localStorage.clear()
    auth.account = { id: crypto.randomUUID(), email: 'bl004.teste@example.invalid' }
    auth.masterKey = await generateMasterKey()
  })

  afterEach(async () => {
    await db.delete()
    auth.account = null
    auth.masterKey = null
  })

  it('mostra estado vazio, valida e cria o distrito', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><DistrictPage /></MemoryRouter>)

    expect(await screen.findByRole('heading', { name: 'Seu distrito começa aqui.' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Criar distrito' }))
    expect(await screen.findByText('Informe o nome do distrito.')).toBeInTheDocument()

    await user.type(screen.getByRole('textbox', { name: /nome do distrito/i }), 'Distrito Visual Fictício')
    await user.click(screen.getByRole('button', { name: 'Criar distrito' }))

    expect(await screen.findByRole('heading', { name: 'Distrito Visual Fictício' })).toBeInTheDocument()
    expect(screen.getByText('Nenhuma igreja cadastrada')).toBeInTheDocument()
  })

  it('valida e salva uma igreja sem plaintext persistido', async () => {
    const user = userEvent.setup()
    const service = new DistrictService()
    const district = await service.createDistrict(auth.account!.id, auth.masterKey!, 'Distrito de Teste')

    render(
      <MemoryRouter initialEntries={['/app/distrito/igrejas/nova']}>
        <Routes>
          <Route path="/app/distrito/igrejas/nova" element={<ChurchFormPage />} />
          <Route path="/app/distrito/igrejas/:churchId" element={<div>Igreja salva</div>} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: 'Nova igreja' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Salvar igreja' }))
    expect(await screen.findByText('Informe o nome da igreja.')).toBeInTheDocument()
    expect(screen.getByText('Selecione o tipo da igreja.')).toBeInTheDocument()

    await user.type(screen.getByRole('textbox', { name: /nome da igreja/i }), 'Grupo Modelo Fictício')
    await user.selectOptions(screen.getByRole('combobox', { name: /tipo/i }), 'group')
    await user.type(screen.getByRole('textbox', { name: /endereço/i }), 'Rua de Teste, 10')
    await user.click(screen.getByRole('button', { name: 'Adicionar horário' }))
    await user.click(screen.getByRole('button', { name: 'Salvar igreja' }))

    expect(await screen.findByText('Igreja salva')).toBeInTheDocument()
    expect(await service.listChurches(auth.account!.id, auth.masterKey!, district.id)).toHaveLength(1)
    const persisted = JSON.stringify({ records: await db.vaultRecords.toArray(), outbox: await db.outbox.toArray() })
    expect(persisted).not.toContain('Grupo Modelo Fictício')
    expect(persisted).not.toContain('Rua de Teste')
  }, 15_000)
})
