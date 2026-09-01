import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CommissionConfigData, CommissionEntity, CommissionMeetingData } from '../commissions/types'
import { CommissionConfigPage } from './CommissionConfigPage'
import { CommissionKindPage } from './CommissionKindPage'
import { CommissionsPage } from './CommissionsPage'

const auth = vi.hoisted(() => ({ account: { id: 'conta-comissoes-ficticia' }, masterKey: {} as CryptoKey }))
const fixtures = vi.hoisted(() => ({
  district: { id: 'distrito-ficticio' },
  church: {
    id: 'igreja-ficticia', districtId: 'distrito-ficticio', name: 'Igreja Fictícia de Teste', type: 'organized_church',
    externalCode: '', address: '', worshipSchedules: [], administrativeNotes: '', status: 'active', history: [],
    createdAt: '2027-01-01T00:00:00.000Z', updatedAt: '2027-01-01T00:00:00.000Z',
  },
  people: [
    { id: 'pessoa-a', name: 'Pessoa Fictícia A', currentChurchId: 'igreja-ficticia' },
    { id: 'pessoa-b', name: 'Pessoa Fictícia B', currentChurchId: 'igreja-ficticia' },
  ],
}))
const state = vi.hoisted(() => ({
  config: null as CommissionEntity<CommissionConfigData> | null,
  meetings: [] as CommissionEntity<CommissionMeetingData>[],
  saveConfig: vi.fn(),
  saveMeeting: vi.fn(),
}))

vi.mock('../auth/AuthVaultContext', () => ({ useAuthVault: () => auth }))
vi.mock('../district/service', () => ({ DistrictService: class {
  getDistrict = vi.fn(() => Promise.resolve(fixtures.district))
  listChurches = vi.fn(() => Promise.resolve([fixtures.church]))
  getChurch = vi.fn(() => Promise.resolve(fixtures.church))
} }))
vi.mock('../people/service', () => ({ PeopleService: class {
  listPeople = vi.fn(() => Promise.resolve(fixtures.people))
} }))
vi.mock('../commissions/service', () => ({ CommissionService: class {
  config = vi.fn(() => Promise.resolve(state.config))
  meetings = vi.fn(() => Promise.resolve(state.meetings))
  saveConfig = state.saveConfig
  saveMeeting = state.saveMeeting
} }))

function LocationView() {
  const location = useLocation()
  return <output aria-label="localização atual">{location.pathname}{location.search}</output>
}

beforeEach(() => {
  state.config = null
  state.meetings = []
  state.saveConfig.mockReset().mockImplementation((_accountId: string, _masterKey: CryptoKey, input: Omit<CommissionConfigData, 'updatedAt'>) => {
    const saved: CommissionEntity<CommissionConfigData> = { id: 'configuracao-ficticia', ...input, updatedAt: '2027-01-01T00:00:00.000Z' }
    state.config = saved
    return Promise.resolve(saved)
  })
  state.saveMeeting.mockReset().mockImplementation((_accountId: string, _masterKey: CryptoKey, input: CommissionMeetingData) => Promise.resolve({ id: 'reuniao-ficticia-criada', ...input }))
})

afterEach(cleanup)

describe('navegação inicial de Comissões', () => {
  it.each([
    ['Comissão Diretiva', '/app/comissoes/diretiva?churchId=igreja-ficticia'],
    ['Reunião Administrativa', '/app/comissoes/administrativa?churchId=igreja-ficticia'],
  ])('abre o cartão %s pela área inteira', async (title, path) => {
    const user = userEvent.setup()
    render(<MemoryRouter initialEntries={['/app/comissoes']}><Routes>
      <Route path="/app/comissoes" element={<CommissionsPage />} />
      <Route path="*" element={<LocationView />} />
    </Routes></MemoryRouter>)

    const link = await screen.findByRole('link', { name: `Abrir ${title}` })
    expect(link).toHaveAttribute('href', path)
    expect(link).toHaveClass('commission-type-card__primary')
    await user.click(link)
    expect(screen.getByLabelText('localização atual')).toHaveTextContent(path)
  })

  it.each([
    ['Nova reunião da Comissão Diretiva', '/app/comissoes/diretiva?churchId=igreja-ficticia&nova=1'],
    ['Nova reunião da Reunião Administrativa', '/app/comissoes/administrativa?churchId=igreja-ficticia&nova=1'],
  ])('abre a criação correta pelo botão %s', async (label, path) => {
    const user = userEvent.setup()
    render(<MemoryRouter initialEntries={['/app/comissoes']}><Routes>
      <Route path="/app/comissoes" element={<CommissionsPage />} />
      <Route path="*" element={<LocationView />} />
    </Routes></MemoryRouter>)

    const button = await screen.findByRole('button', { name: label })
    expect(button).toHaveClass('button--secondary', 'commission-type-card__new')
    await user.click(button)
    expect(screen.getByLabelText('localização atual')).toHaveTextContent(path)
  })

  it('não mostra o recurso técnico de demonstração', async () => {
    render(<MemoryRouter><CommissionsPage /></MemoryRouter>)
    await screen.findByRole('link', { name: 'Abrir Comissão Diretiva' })
    expect(screen.queryByRole('button', { name: 'Preparar demonstração fictícia completa' })).not.toBeInTheDocument()
  })

  it('encaminha a igreja sem configuração para Configurar igreja', async () => {
    render(<MemoryRouter initialEntries={['/app/comissoes/diretiva?churchId=igreja-ficticia&nova=1']}>
      <CommissionKindPage kind="board" />
    </MemoryRouter>)

    expect(await screen.findByText('Antes de criar uma reunião, configure os responsáveis e o quórum desta igreja.')).toBeInTheDocument()
    const configure = screen.getByRole('link', { name: 'Configurar igreja' })
    expect(configure).toHaveClass('button--primary')
    expect(configure.getAttribute('href')).toContain('/app/comissoes/configurar?')
    expect(configure.getAttribute('href')).toContain('returnTo=')
  })

  it('retorna à criação da reunião depois de salvar a configuração', async () => {
    const user = userEvent.setup()
    const returnTo = encodeURIComponent('/app/comissoes/diretiva?churchId=igreja-ficticia&nova=1')
    render(<MemoryRouter initialEntries={[`/app/comissoes/configurar?churchId=igreja-ficticia&returnTo=${returnTo}`]}><Routes>
      <Route path="/app/comissoes/configurar" element={<CommissionConfigPage />} />
      <Route path="/app/comissoes/diretiva" element={<CommissionKindPage kind="board" />} />
      <Route path="/app/comissoes/:meetingId" element={<LocationView />} />
    </Routes></MemoryRouter>)

    await screen.findByText('Depois de salvar, você voltará automaticamente para criar a reunião.')
    await user.type(screen.getByLabelText('Quórum da Comissão Diretiva'), '2')
    await user.type(screen.getByLabelText('Quórum da Reunião Administrativa'), '5')
    await user.click(screen.getAllByRole('checkbox', { name: 'Pessoa Fictícia A' })[1]!)
    await user.selectOptions(screen.getByLabelText('Secretário(a)'), 'pessoa-b')
    await user.click(screen.getByRole('button', { name: 'Salvar configuração' }))

    await waitFor(() => expect(state.saveMeeting).toHaveBeenCalledTimes(1))
    // Sem escolher ninguém, quem preside é o pastor.
    expect(state.saveMeeting.mock.calls[0]?.[2]).toMatchObject({ churchId: 'igreja-ficticia', kind: 'board', presidentId: '', presidentLabel: 'Pastor do distrito' })
    expect(await screen.findByLabelText('localização atual')).toHaveTextContent('/app/comissoes/reuniao-ficticia-criada')
  })

  it('deixa claro que o presidente padrão é o pastor', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter initialEntries={['/app/comissoes/configurar?churchId=igreja-ficticia']}><CommissionConfigPage /></MemoryRouter>)

    expect(await screen.findByText('Pastor')).toBeInTheDocument()
    expect(screen.getByText('Em igreja organizada: pode ser escolhido um ancião, quando necessário.')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Quórum da Comissão Diretiva'), '2')
    await user.type(screen.getByLabelText('Quórum da Reunião Administrativa'), '5')
    await user.selectOptions(screen.getByLabelText('Secretário(a)'), 'pessoa-b')
    await user.click(screen.getByRole('button', { name: 'Salvar configuração' }))

    await waitFor(() => expect(state.saveConfig).toHaveBeenCalledTimes(1))
    expect(state.saveConfig.mock.calls[0]?.[2]).toMatchObject({ presidentMode: 'pastor', boardPresidentId: '' })
  })

  it('só oferece para presidir quem foi marcado como ancião', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter initialEntries={['/app/comissoes/configurar?churchId=igreja-ficticia']}><CommissionConfigPage /></MemoryRouter>)

    await screen.findByLabelText('Presidente')
    await user.selectOptions(screen.getByLabelText('Presidente'), 'elder')
    // Antes de marcar o ancião, ninguém aparece para presidir.
    expect(screen.getByLabelText('Ancião que vai presidir')).not.toHaveTextContent('Pessoa Fictícia A')

    await user.click(screen.getAllByRole('checkbox', { name: 'Pessoa Fictícia A' })[0]!)
    await user.selectOptions(screen.getByLabelText('Ancião que vai presidir'), 'pessoa-a')
    await user.type(screen.getByLabelText('Quórum da Comissão Diretiva'), '2')
    await user.type(screen.getByLabelText('Quórum da Reunião Administrativa'), '5')
    await user.selectOptions(screen.getByLabelText('Secretário(a)'), 'pessoa-b')
    await user.click(screen.getByRole('button', { name: 'Salvar configuração' }))

    await waitFor(() => expect(state.saveConfig).toHaveBeenCalledTimes(1))
    expect(state.saveConfig.mock.calls[0]?.[2]).toMatchObject({ presidentMode: 'elder', boardPresidentId: 'pessoa-a', elderIds: ['pessoa-a'] })
  })
})
