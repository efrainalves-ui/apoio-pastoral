import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgendaEventEntity } from '../agenda/types'
import { AgendaPage } from './AgendaPage'

const data = vi.hoisted(() => ({ events: [] as AgendaEventEntity[] }))

vi.mock('../auth/AuthVaultContext', () => ({ useAuthVault: () => ({ accounts: [], account: { id: 'agenda-conta-ficticia' }, masterKey: {} as CryptoKey }) }))
vi.mock('../agenda/service', () => ({
  AgendaService: class { listEvents = vi.fn(() => Promise.resolve(data.events)); deleteEvent = vi.fn() },
  mondayRestItems: vi.fn(() => []),
}))
vi.mock('../district/service', () => ({ DistrictService: class { getDistrict = vi.fn(() => Promise.resolve(null)); listChurches = vi.fn(() => Promise.resolve([])) } }))

function event(overrides: Partial<AgendaEventEntity> = {}): AgendaEventEntity {
  const now = new Date()
  now.setHours(10, 0, 0, 0)
  const end = new Date(now.getTime() + 60 * 60_000)
  return { id: 'agenda-evento-ficticio', title: 'Visita de teste fictícia', category: 'visit', churchId: null, location: 'Local fictício', address: 'Endereço fictício', visitTarget: 'family', sermonId: null, sermonSnapshot: null, startAt: now.toISOString(), endAt: end.toISOString(), allDay: false, reminderMinutes: 15, notes: '', includeInItinerary: true, mondayException: false, createdAt: now.toISOString(), updatedAt: now.toISOString(), ...overrides }
}

describe('agenda visual', () => {
  afterEach(cleanup)
  beforeEach(() => { data.events = [event()] })

  it('alterna entre Dia, Semana, Mês e Lista com controles acessíveis', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><AgendaPage /></MemoryRouter>)

    expect(await screen.findByRole('tab', { name: 'Semana' })).toHaveAttribute('aria-selected', 'true')
    await user.click(screen.getByRole('tab', { name: 'Dia' }))
    expect(screen.getByRole('tab', { name: 'Dia' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('region', { name: 'Grade do dia' })).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Mês' }))
    const month = screen.getByRole('region', { name: 'Calendário mensal' })
    expect(month).toBeInTheDocument()
    expect(within(month).getAllByText(/^(Dom|Seg|Ter|Qua|Qui|Sex|Sáb)$/).slice(0, 7).map((element) => element.textContent)).toEqual(['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'])
    await user.click(screen.getByRole('tab', { name: 'Lista' }))
    expect(screen.getByRole('link', { name: /editar visita de teste fictícia/i })).toBeInTheDocument()
  })

  it('oferece Hoje, navegação e criação rápida com horário preenchido', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><AgendaPage /></MemoryRouter>)

    await screen.findByRole('tab', { name: 'Semana' })
    await user.click(screen.getByRole('tab', { name: 'Dia' }))
    const quickCreate = screen.getByRole('link', { name: 'Criar compromisso às 10:00' })
    expect(quickCreate).toHaveAttribute('href', expect.stringContaining('/app/agenda/novo?inicio='))
    await user.click(screen.getByRole('button', { name: 'Próximo período' }))
    await user.click(screen.getByRole('button', { name: 'Hoje' }))
    expect(screen.getByRole('link', { name: 'Novo compromisso' })).toBeInTheDocument()
  })

  it('mostra rótulo, cor por categoria e ações de visita, sermão e itinerário', async () => {
    const user = userEvent.setup()
    data.events = [event({ category: 'preaching', title: 'Pregação fictícia', sermonId: 'sermao-ficticio', sermonSnapshot: { id: 'sermao-ficticio', title: 'Sermão fictício', theme: 'Esperança', mainText: 'Texto fictício' } }), event({ id: 'visita-ficticia', category: 'visit' })]
    render(<MemoryRouter><AgendaPage /></MemoryRouter>)

    await screen.findByRole('tab', { name: 'Semana' })
    await user.click(screen.getByRole('tab', { name: 'Lista' }))
    expect(screen.getAllByText('Pregação').find((element) => element.classList.contains('agenda-category--preaching'))).toBeTruthy()
    expect(screen.getByRole('link', { name: /abrir sermão de pregação fictícia/i })).toHaveAttribute('href', '/app/sermoes/sermao-ficticio')
    expect(screen.getByRole('link', { name: /registrar visita visita de teste fictícia/i })).toHaveAttribute('href', '/app/visitas/nova?agenda=visita-ficticia')
    await user.click(screen.getByRole('button', { name: 'Itinerário' }))
    expect(screen.getByRole('button', { name: 'Baixar itinerário' })).toBeInTheDocument()
  })
  it('no mês, o dia escolhido em cima abre a lista embaixo, e o compromisso embaixo abre para edição', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><AgendaPage /></MemoryRouter>)

    await screen.findByRole('tab', { name: 'Semana' })
    await user.click(screen.getByRole('tab', { name: 'Mês' }))

    const hoje = new Date()
    const rotulo = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' }).format(hoje)
    const numero = screen.getByRole('button', { name: `${rotulo}, 1 compromisso(s)` })
    expect(numero.querySelector('.ponto-categoria--visit')).toBeTruthy()

    // A semana corrente já aparece embaixo, sem que seja preciso tocar em nada.
    const abaixo = screen.getByRole('link', { name: /abrir visita de teste fictícia/i })
    expect(abaixo).toHaveAttribute('href', '/app/agenda/agenda-evento-ficticio/editar')
    expect(abaixo.classList.contains('compromisso')).toBe(true)

    // Tocar no número escolhe o dia; tocar de novo solta a escolha.
    await user.click(numero)
    expect(numero).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getAllByRole('link', { name: /abrir visita de teste fictícia/i })).toHaveLength(1)
    await user.click(numero)
    expect(numero).toHaveAttribute('aria-pressed', 'false')
  })

  it('a semana lista os sete dias sem colunas vazias', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><AgendaPage /></MemoryRouter>)

    await screen.findByRole('tab', { name: 'Semana' })
    await user.click(screen.getByRole('tab', { name: 'Semana' }))
    expect(document.querySelectorAll('.dias-abaixo > section')).toHaveLength(7)
    expect(screen.getAllByRole('link', { name: /^Criar compromisso em / })).toHaveLength(6)
  })
})
