import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgendaEventEntity } from '../agenda/types'
import { AgendaFormPage } from './AgendaFormPage'

const estado = vi.hoisted(() => ({
  eventId: undefined as string | undefined,
  apagar: vi.fn(() => Promise.resolve()),
  navegou: [] as string[],
}))

vi.mock('react-router-dom', async (importarOriginal) => ({
  ...await importarOriginal<Record<string, unknown>>(),
  useParams: () => ({ eventId: estado.eventId }),
  useNavigate: () => (destino: string) => { estado.navegou.push(destino); return Promise.resolve() },
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
}))

vi.mock('../auth/AuthVaultContext', () => ({ useAuthVault: () => ({ accounts: [], account: { id: 'conta-ficticia' }, masterKey: {} as CryptoKey }) }))

function evento(): AgendaEventEntity {
  return {
    id: 'agenda-evento-ficticio', title: 'Pregação fictícia', category: 'preaching', churchId: null,
    location: 'Local fictício', address: '', visitTarget: 'none', sermonId: null, sermonSnapshot: null,
    ceremonyDetails: null, startAt: '2026-09-05T19:00', endAt: '2026-09-05T20:00', allDay: false,
    reminderMinutes: null, notes: '', includeInItinerary: true, mondayException: false,
    createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
  }
}

vi.mock('../agenda/service', async (importarOriginal) => ({
  ...await importarOriginal<Record<string, unknown>>(),
  AgendaService: class {
    listEvents = vi.fn(() => Promise.resolve([]))
    getEvent = vi.fn(() => Promise.resolve(estado.eventId ? evento() : null))
    deleteEvent = estado.apagar
    updateEvent = vi.fn()
    createEvent = vi.fn()
  },
}))
vi.mock('../district/service', () => ({ DistrictService: class { getDistrict = vi.fn(() => Promise.resolve(null)); listChurches = vi.fn(() => Promise.resolve([])) } }))
vi.mock('../sermons/service', () => ({ SermonService: class { list = vi.fn(() => Promise.resolve([])) } }))
vi.mock('../people/service', () => ({ PeopleService: class { listPeople = vi.fn(() => Promise.resolve([])) } }))
vi.mock('../evangelism/service', () => ({ EvangelismPlanningService: class { syncFromAgendaEvent = vi.fn() } }))

describe('excluir compromisso pela tela de edição', () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks() })
  beforeEach(() => { estado.eventId = 'agenda-evento-ficticio'; estado.apagar.mockClear(); estado.navegou = [] })

  it('oferece excluir ao editar, e apaga depois de confirmar', async () => {
    // O botão só existia na visão Lista. Quem abre o compromisso para mexer
    // nele procura o apagar ali dentro, e não achar faz parecer que não dá.
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<MemoryRouter><AgendaFormPage /></MemoryRouter>)

    await user.click(await screen.findByRole('button', { name: /Excluir compromisso/i }))

    expect(estado.apagar).toHaveBeenCalledWith('conta-ficticia', expect.anything(), 'agenda-evento-ficticio')
    expect(estado.navegou).toContain('/app/agenda')
  })

  it('não apaga quando a confirmação é recusada', async () => {
    // Exclusão de dado pede aviso antes, e recusar precisa mesmo recusar.
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<MemoryRouter><AgendaFormPage /></MemoryRouter>)

    await user.click(await screen.findByRole('button', { name: /Excluir compromisso/i }))

    expect(estado.apagar).not.toHaveBeenCalled()
    expect(estado.navegou).toHaveLength(0)
  })

  it('não oferece excluir quando o compromisso ainda está sendo criado', async () => {
    // Não há o que apagar, e um botão de excluir aqui só assustaria.
    estado.eventId = undefined
    render(<MemoryRouter><AgendaFormPage /></MemoryRouter>)

    expect(await screen.findByRole('heading', { name: 'Novo compromisso' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Excluir compromisso/i })).not.toBeInTheDocument()
  })
})
