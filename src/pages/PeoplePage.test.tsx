import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { generateMasterKey } from '../crypto/vault'
import { db } from '../db/database'
import { DistrictService } from '../district/service'
import { PeopleService } from '../people/service'
import { emptyPersonInput } from '../people/types'

const auth = vi.hoisted(() => ({
  account: null as { id: string; email: string } | null,
  masterKey: null as CryptoKey | null,
}))

vi.mock('../auth/AuthVaultContext', () => ({ useAuthVault: () => ({ ...auth }) }))

import { PeoplePage } from './PeoplePage'

describe('lista e pesquisa local de pessoas', () => {
  beforeEach(async () => {
    await db.delete(); await db.open(); localStorage.clear()
    auth.account = { id: crypto.randomUUID(), email: 'pessoas.teste@example.invalid' }
    auth.masterKey = await generateMasterKey()
  })

  afterEach(async () => { await db.delete(); auth.account = null; auth.masterKey = null })

  it('lista por igreja e pesquisa sem criar índice pessoal em texto aberto', async () => {
    const districtService = new DistrictService(); const peopleService = new PeopleService()
    const district = await districtService.createDistrict(auth.account!.id, auth.masterKey!, 'Distrito Fictício')
    const church = await districtService.createChurch(auth.account!.id, auth.masterKey!, district.id, { name: 'Igreja Aurora Fictícia', type: 'organized_church', externalCode: '', address: '', worshipSchedules: [], administrativeNotes: '', status: 'active' })
    await peopleService.createPerson(auth.account!.id, auth.masterKey!, { ...emptyPersonInput(), name: 'Pessoa Aurora Fictícia', birthDate: '1990-08-20', currentChurchId: church.id })

    const user = userEvent.setup()
    render(<MemoryRouter initialEntries={[`/app/pessoas?church=${church.id}`]}><PeoplePage /></MemoryRouter>)
    expect(await screen.findByText('Pessoa Aurora Fictícia')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Igreja' })).toHaveValue(church.id)
    await user.type(screen.getByRole('textbox', { name: 'Pesquisar por nome' }), 'inexistente')
    expect(await screen.findByText('Nenhuma pessoa encontrada')).toBeInTheDocument()
    expect(JSON.stringify(await db.vaultRecords.toArray())).not.toContain('Pessoa Aurora Fictícia')
  })
})
