import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { generateMasterKey } from '../crypto/vault'
import { db } from '../db/database'
import { DistrictService } from '../district/service'
import { MissionaryService } from '../missionary/service'
import { PeopleService } from '../people/service'

const auth = vi.hoisted(() => ({ account: null as { id: string; email: string } | null, masterKey: null as CryptoKey | null }))
vi.mock('../auth/AuthVaultContext', () => ({ useAuthVault: () => ({ ...auth }) }))

import { CommunityGroupsPage } from './CommunityGroupsPage'

describe('edição visual dos registros missionários', () => {
  beforeEach(async () => {
    await db.delete(); await db.open(); localStorage.clear()
    auth.account = { id: crypto.randomUUID(), email: 'missionario.teste@example.invalid' }
    auth.masterKey = await generateMasterKey()
  })

  afterEach(async () => { vi.restoreAllMocks(); await db.delete(); auth.account = null; auth.masterKey = null })

  it('visualiza, preenche a edição, salva com o mesmo ID e remove após confirmação', async () => {
    const districtService = new DistrictService(); const peopleService = new PeopleService(); const missionaryService = new MissionaryService()
    const district = await districtService.createDistrict(auth.account!.id, auth.masterKey!, 'Distrito Fictício')
    const church = await districtService.createChurch(auth.account!.id, auth.masterKey!, district.id, { name: 'Igreja Fictícia', type: 'organized_church', externalCode: '', address: '', worshipSchedules: [], administrativeNotes: '', status: 'active' })
    const leader = await peopleService.createPerson(auth.account!.id, auth.masterKey!, { name: 'Líder Fictício', birthDate: '', whatsapp: '', notes: '', pastoralStatus: 'active', currentChurchId: church.id })
    await missionaryService.saveClass(auth.account!.id, auth.masterKey!, { churchId: church.id, teacherId: leader.id, assistantId: null, ageGroup: 'adults', participantIds: [leader.id] })
    const group = await missionaryService.saveSmallGroup(auth.account!.id, auth.masterKey!, { churchId: church.id, name: 'PG Visual Fictício', leaderId: leader.id, associateId: null, host: 'Casa Fictícia', address: '', day: 'terça', time: '19:00', participantIds: [leader.id], active: true })
    await missionaryService.saveUapg(auth.account!.id, auth.masterKey!, { churchId: church.id, name: 'UAPG Visual Fictícia', smallGroupId: group.id, notes: '', active: true })

    const user = userEvent.setup(); render(<MemoryRouter><CommunityGroupsPage /></MemoryRouter>)
    expect(await screen.findByText('Classe Adultos')).toBeInTheDocument(); expect(screen.getByText('PG Visual Fictício')).toBeInTheDocument(); expect(screen.getByText('UAPG Visual Fictícia')).toBeInTheDocument()

    const originalRow = screen.getByText('PG Visual Fictício').closest<HTMLElement>('.entity-row')!
    await user.click(within(originalRow).getByRole('button', { name: 'Editar' }))
    const editCard = screen.getByRole('heading', { name: 'Editar Pequeno Grupo' }).closest('section')!
    const name = within(editCard).getByDisplayValue('PG Visual Fictício'); expect(name).toHaveValue('PG Visual Fictício')
    expect(within(editCard).getByRole('combobox', { name: 'Líder' })).toHaveValue(leader.id)
    await user.clear(name); await user.type(name, 'PG Visual Editado'); await user.click(within(editCard).getByRole('button', { name: 'Salvar alterações' }))

    expect(await screen.findByText('PG Visual Editado')).toBeInTheDocument()
    expect((await missionaryService.listSmallGroups(auth.account!.id, auth.masterKey!))[0]).toMatchObject({ id: group.id, leaderId: leader.id, name: 'PG Visual Editado' })

    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const editedRow = screen.getByText('PG Visual Editado').closest<HTMLElement>('.entity-row')!
    await user.click(within(editedRow).getByRole('button', { name: 'Remover' }))
    expect(confirm).toHaveBeenCalledOnce(); await waitFor(() => expect(screen.queryByText('PG Visual Editado')).not.toBeInTheDocument())
  }, 15_000)
})
