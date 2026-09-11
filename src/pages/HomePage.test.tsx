import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HomePage } from './HomePage'

const auth = vi.hoisted(() => ({ account: { id: 'conta-painel-ficticia' }, masterKey: {} as CryptoKey }))
const people = vi.hoisted(() => ([
  { id: 'a', name: 'Pessoa Fictícia A', fidelity: { category: 'tither' }, pastoralStatus: 'active', birthDate: null },
  { id: 'b', name: 'Pessoa Fictícia B', fidelity: { category: 'non_systematic_tither' }, pastoralStatus: 'active', birthDate: null },
  { id: 'c', name: 'Pessoa Fictícia C', fidelity: { category: 'non_tither' }, pastoralStatus: 'rescue', birthDate: null },
]))
const services = vi.hoisted(() => ({ listPeople: vi.fn(() => Promise.resolve(people)), getDistrict: vi.fn(() => Promise.resolve(null)), listFamilies: vi.fn(() => Promise.resolve([])), listEvents: vi.fn(() => Promise.resolve([])), listTasks: vi.fn(() => Promise.resolve([])), listPrayerRequests: vi.fn(() => Promise.resolve([{ id: 'prayer-fictitious', status: 'active', text: 'Conteúdo reservado fictício' }])), listFollowUps: vi.fn(() => Promise.resolve([])), listRounds: vi.fn(() => Promise.resolve([])), listVisits: vi.fn(() => Promise.resolve([])), listCampaigns: vi.fn(() => Promise.resolve([])) }))

vi.mock('../auth/AuthVaultContext', () => ({ useAuthVault: () => auth }))
vi.mock('../people/service', () => ({ PeopleService: class { listPeople = services.listPeople } }))
vi.mock('../district/service', () => ({ DistrictService: class { getDistrict = services.getDistrict; listChurches = vi.fn(() => Promise.resolve([])) } }))
vi.mock('../families/service', () => ({ FamilyService: class { listFamilies = services.listFamilies } }))
vi.mock('../agenda/service', () => ({ AgendaService: class { listEvents = services.listEvents } }))
vi.mock('../care/service', () => ({ CareService: class { listTasks = services.listTasks; listPrayerRequests = services.listPrayerRequests; listFollowUps = services.listFollowUps; listRounds = services.listRounds; listVisits = services.listVisits } }))
vi.mock('../goals/service', () => ({ GoalsService: class { listGoals = vi.fn(() => Promise.resolve([])); listEntries = vi.fn(() => Promise.resolve([])); listHistory = vi.fn(() => Promise.resolve([])) } }))
vi.mock('../evangelism/service', () => ({ EvangelismPlanningService: class { listCampaigns = services.listCampaigns } }))
vi.mock('../missionary/service', () => ({ MissionaryService: class { listInterests = vi.fn(() => Promise.resolve([])); listStudies = vi.fn(() => Promise.resolve([])); listUapgs = vi.fn(() => Promise.resolve([])) } }))

/* Sem isto, o DOM de um teste sobra para o seguinte e os localizadores duplicam. */
afterEach(cleanup)

describe('painel inicial', () => {
  /*
    Zero não é espera, é afirmação.

    Enquanto o cofre abre — quatro, cinco segundos com um distrito inteiro para
    decifrar — a tela mostrava "nenhuma pessoa, nenhum aniversário, nenhum
    pedido". Quem entra e vê o distrito zerado não pensa "está carregando":
    pensa que perdeu os dados.
  */
  it('mostra a espera antes de afirmar que não há nada', async () => {
    let liberar: (valor: typeof people) => void = () => undefined
    services.listPeople.mockReturnValueOnce(new Promise<typeof people>((resolve) => { liberar = resolve }))

    render(<MemoryRouter><HomePage /></MemoryRouter>)
    expect(screen.getByRole('status')).toHaveTextContent(/Abrindo/u)
    expect(screen.queryByRole('heading', { name: 'Fidelidade' })).toBeNull()

    liberar(people)
    expect(await screen.findByRole('heading', { name: 'Fidelidade' })).toBeInTheDocument()
  })

  it('mostra o cartão Fidelidade sem valores financeiros', async () => {
    render(<MemoryRouter><HomePage /></MemoryRouter>)
    expect(await screen.findByRole('heading', { name: 'Fidelidade' })).toBeInTheDocument()
    expect(screen.getByText('Dizimistas não sistemáticos')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Abrir Fidelidade/i })).toHaveAttribute('href', '/app/fidelidade')
    /*
      O número sobe animado. Conferi-lo sem esperar pega o meio da contagem — o
      que o teste media era a animação, não o dado.
    */
    await waitFor(() => expect(screen.getByText('Pedidos de oração').parentElement).toHaveTextContent('Pedidos de oração1'))
    expect(screen.queryByText('Conteúdo reservado fictício')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Evangelismo' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Abrir Evangelismo/i })).toHaveAttribute('href', '/app/evangelismo')
  })
})
