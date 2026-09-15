import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgendaEventEntity, AgendaEventInput } from '../agenda/types'
import { notificarDadosSincronizados } from '../sync/useReloadOnSync'
import { casamentoVazio, noivoVazio } from '../casamentos/core'
import { AgendaFormPage } from './AgendaFormPage'

const estado = vi.hoisted(() => ({
  eventId: undefined as string | undefined,
  evento: null as AgendaEventEntity | null,
  apagar: vi.fn(() => Promise.resolve()),
  criados: [] as AgendaEventInput[],
  atualizados: [] as AgendaEventInput[],
  vinculados: [] as string[],
  processos: [] as unknown[],
  eventos: [] as AgendaEventEntity[],
  navegou: [] as string[],
  params: 'inicio=2026-10-06T10:00',
  casamentos: [] as unknown[],
  casamentosCriados: [] as Array<{ origem: string; dados: Record<string, unknown>; id: string }>,
  sincronizados: [] as string[],
}))

vi.mock('react-router-dom', async (importarOriginal) => ({
  ...await importarOriginal<Record<string, unknown>>(),
  useParams: () => ({ eventId: estado.eventId }),
  useNavigate: () => (destino: string) => { estado.navegou.push(destino); return Promise.resolve() },
  // Uma terça-feira: a folga de segunda não trava o botão de salvar.
  useSearchParams: () => [new URLSearchParams(estado.params), vi.fn()],
}))

vi.mock('../auth/AuthVaultContext', () => ({ useAuthVault: () => ({ accounts: [], account: { id: 'conta-ficticia' }, masterKey: {} as CryptoKey }) }))

const IGREJAS = [
  { id: 'igreja-a', districtId: 'd', name: 'Igreja Central Fictícia', status: 'active' },
  { id: 'igreja-b', districtId: 'd', name: 'Igreja Norte Fictícia', status: 'active' },
]
const PESSOAS = [
  { id: 'pessoa-1', name: 'Maria Fictícia', currentChurchId: 'igreja-a' },
  { id: 'pessoa-2', name: 'João Diácono Fictício', currentChurchId: 'igreja-a' },
]

function eventoBase(overrides: Partial<AgendaEventEntity> = {}): AgendaEventEntity {
  return {
    id: 'agenda-evento-ficticio', title: 'Pregação fictícia', category: 'preaching', churchId: null,
    location: 'Local fictício', address: '', visitTarget: 'none', sermonId: null, sermonSnapshot: null,
    ceremonyDetails: null, startAt: '2026-09-08T19:00', endAt: '2026-09-08T20:00', allDay: false,
    reminderMinutes: null, notes: '', includeInItinerary: true, mondayException: false,
    createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z', ...overrides,
  }
}

vi.mock('../agenda/service', async (importarOriginal) => ({
  ...await importarOriginal<Record<string, unknown>>(),
  AgendaService: class {
    listEvents = vi.fn(() => Promise.resolve(estado.eventos))
    getEvent = vi.fn(() => Promise.resolve(estado.eventId ? estado.evento : null))
    deleteEvent = estado.apagar
    updateEvent = vi.fn((_a: string, _k: CryptoKey, id: string, input: AgendaEventInput) => { estado.atualizados.push(input); return Promise.resolve({ id, ...input, createdAt: '', updatedAt: '' }) })
    createEvent = vi.fn((_a: string, _k: CryptoKey, input: AgendaEventInput) => { estado.criados.push(input); return Promise.resolve({ id: 'criado', ...input, createdAt: '', updatedAt: '' }) })
  },
}))
vi.mock('../agenda/vinculoComissao', () => ({ VinculoAgendaComissao: class { vincular = vi.fn((_a: string, _k: CryptoKey, event: AgendaEventEntity) => { estado.vinculados.push(event.id); return Promise.resolve({ tipo: 'sem_vinculo' }) }) } }))
vi.mock('../district/service', () => ({ DistrictService: class { getDistrict = vi.fn(() => Promise.resolve({ id: 'd' })); listChurches = vi.fn(() => Promise.resolve(IGREJAS)) } }))
vi.mock('../sermons/service', () => ({ SermonService: class { list = vi.fn(() => Promise.resolve([])) } }))
vi.mock('../people/service', () => ({ PeopleService: class { listPeople = vi.fn(() => Promise.resolve(PESSOAS)) } }))
vi.mock('../families/service', () => ({ FamilyService: class { listFamilies = vi.fn(() => Promise.resolve([{ id: 'familia-1', name: 'Família Fictícia' }])) } }))
vi.mock('../nominations/service', () => ({ NominationService: class { list = vi.fn(() => Promise.resolve(estado.processos)) } }))
vi.mock('../evangelism/service', () => ({ EvangelismPlanningService: class { syncFromAgendaEvent = vi.fn() } }))
vi.mock('../work-budget/service', () => ({ WorkBudgetService: class { configuracao = vi.fn(() => Promise.resolve({ id: 'config', uniao: 'União Fictícia do Norte', campo: 'Associação Fictícia Central' })) } }))
vi.mock('../casamentos/service', async (importarOriginal) => ({
  ...await importarOriginal<Record<string, unknown>>(),
  CasamentoService: class {
    listar = vi.fn(() => Promise.resolve(estado.casamentos))
    criar = vi.fn((_a: string, _k: CryptoKey, origem: string, dados: Record<string, unknown>, id: string) => { estado.casamentosCriados.push({ origem, dados, id }); return Promise.resolve({ id, ...dados }) })
    sincronizarDaAgenda = vi.fn((_a: string, _k: CryptoKey, event: AgendaEventEntity) => { estado.sincronizados.push(event.casamentoId ?? ''); return Promise.resolve(null) })
    obter = vi.fn(() => Promise.resolve(null))
    salvar = vi.fn()
  },
}))

function abrir() { return render(<MemoryRouter><AgendaFormPage /></MemoryRouter>) }
async function escolherCategoria(user: ReturnType<typeof userEvent.setup>, rotulo: string) {
  await user.selectOptions(await screen.findByLabelText('Categoria'), rotulo)
}
async function aguardarCarregar() { await screen.findByRole('option', { name: 'Igreja Central Fictícia' }) }
const salvar = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole('button', { name: 'Salvar compromisso' }))

beforeEach(() => {
  estado.eventId = undefined; estado.evento = null; estado.apagar.mockClear(); estado.navegou = []
  estado.criados = []; estado.atualizados = []; estado.vinculados = []; estado.processos = []; estado.eventos = []
  estado.params = 'inicio=2026-10-06T10:00'; estado.casamentos = []; estado.casamentosCriados = []; estado.sincronizados = []
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('excluir compromisso pela tela de edição', () => {
  beforeEach(() => { estado.eventId = 'agenda-evento-ficticio'; estado.evento = eventoBase() })

  it('oferece excluir ao editar, e apaga depois de confirmar', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    abrir()
    await user.click(await screen.findByRole('button', { name: /Excluir compromisso/i }))
    expect(estado.apagar).toHaveBeenCalledWith('conta-ficticia', expect.anything(), 'agenda-evento-ficticio')
    expect(estado.navegou).toContain('/app/agenda')
  })

  it('não apaga quando a confirmação é recusada', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    abrir()
    await user.click(await screen.findByRole('button', { name: /Excluir compromisso/i }))
    expect(estado.apagar).not.toHaveBeenCalled()
    expect(estado.navegou).toHaveLength(0)
  })

  it('não oferece excluir quando o compromisso ainda está sendo criado', async () => {
    estado.eventId = undefined
    abrir()
    expect(await screen.findByRole('heading', { name: 'Novo compromisso' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Excluir compromisso/i })).not.toBeInTheDocument()
  })

  it('não substitui um campo digitado quando chegam alterações sincronizadas', async () => {
    const user = userEvent.setup()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    abrir()
    const reminder = await screen.findByRole('spinbutton', { name: 'Lembrete em minutos' })
    await user.clear(reminder)
    await user.type(reminder, '45')
    notificarDadosSincronizados()
    expect(confirm).toHaveBeenCalled()
    expect(reminder).toHaveValue(45)
  })
})

describe('o que saiu de todos os tipos', () => {
  it('nenhum tipo mostra "dia todo", "Comentários" ou textos explicativos', async () => {
    const user = userEvent.setup()
    abrir(); await aguardarCarregar()
    const categorias = within(screen.getByLabelText('Categoria')).getAllByRole('option').map((option) => option.textContent ?? '')
    expect(categorias).not.toContain('Viagem')
    expect(categorias).not.toContain('PGP')
    expect(categorias).not.toContain('Santa Ceia')
    expect(categorias).toContain('Ceia do Senhor')
    for (const categoria of categorias) {
      await escolherCategoria(user, categoria)
      expect(screen.queryByText(/dia todo/i), categoria).not.toBeInTheDocument()
      expect(screen.queryByText(/Comentários/i), categoria).not.toBeInTheDocument()
      expect(screen.queryByText(/Duração de/i), categoria).not.toBeInTheDocument()
      expect(screen.queryByText(/retrato/i), categoria).not.toBeInTheDocument()
      // O batismo mantém o seu checklist; só a Ceia do Senhor perdeu o registro posterior.
      if (categoria === 'Ceia do Senhor') expect(screen.queryByText('Registro posterior')).not.toBeInTheDocument()
      const temObservacoes = ['Reunião', 'Treinamento', 'Evento', 'Concílio'].includes(categoria)
      expect(Boolean(screen.queryByLabelText('Observações')), categoria).toBe(temObservacoes)
    }
  })
})

describe('visita', () => {
  it('não pede título e grava "Visita — nome" com a pessoa escolhida', async () => {
    const user = userEvent.setup()
    abrir(); await aguardarCarregar()
    expect(screen.queryByLabelText('Título')).not.toBeInTheDocument()
    await user.type(screen.getByRole('combobox', { name: 'Pessoa ou família' }), 'mar')
    await user.keyboard('{Enter}')
    expect(screen.getByRole('button', { name: 'Remover Maria Fictícia' })).toBeInTheDocument()
    await salvar(user)
    expect(estado.criados[0]).toMatchObject({ category: 'visit', title: 'Visita — Maria Fictícia', pessoaId: 'pessoa-1', visitTarget: 'person', allDay: false })
  })
})

describe('reunião, treinamento, evento e concílio', () => {
  it('online não mostra local; presencial mostra; trocar para online apaga o local', async () => {
    const user = userEvent.setup()
    abrir(); await aguardarCarregar()
    await escolherCategoria(user, 'Reunião')
    await user.click(screen.getByRole('radio', { name: 'Presencial' }))
    await user.type(screen.getByLabelText('Local'), 'Salão fictício')
    await user.click(screen.getByRole('radio', { name: 'Online' }))
    expect(screen.queryByLabelText('Local')).not.toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: 'Presencial' }))
    expect(screen.getByLabelText('Local')).toHaveValue('')
  })

  it('o alcance abre só o que pede, e trocar de alcance limpa o anterior', async () => {
    const user = userEvent.setup()
    abrir(); await aguardarCarregar()
    await escolherCategoria(user, 'Treinamento')
    await user.click(screen.getByRole('radio', { name: 'Distrital' }))
    await user.click(screen.getByRole('radio', { name: 'Outro público' }))
    await user.type(screen.getByLabelText('Qual público?'), 'Público fictício')
    await user.click(screen.getByRole('radio', { name: 'Igreja local' }))
    expect(screen.queryByLabelText('Qual público?')).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Igreja' })).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: 'Distrital' }))
    expect(screen.getByRole('radio', { name: 'Outro público' })).not.toBeChecked()
    await user.click(screen.getByRole('radio', { name: 'Departamento' }))
    await user.type(screen.getByRole('combobox', { name: 'Departamento' }), 'músi')
    await user.keyboard('{Enter}')
    expect(screen.getByRole('button', { name: 'Remover Música' })).toBeInTheDocument()
  })

  it('reunião online distrital é gravada com o formato, o alcance e as observações', async () => {
    const user = userEvent.setup()
    abrir(); await aguardarCarregar()
    await escolherCategoria(user, 'Reunião')
    await user.type(screen.getByLabelText('Título'), 'Reunião fictícia')
    await user.click(screen.getByRole('radio', { name: 'Online' }))
    await user.click(screen.getByRole('radio', { name: 'Distrital' }))
    await user.click(screen.getByRole('radio', { name: 'Pastores e anciãos' }))
    await user.type(screen.getByLabelText('Observações'), 'Observação fictícia')
    await salvar(user)
    expect(estado.criados[0]).toMatchObject({
      category: 'meeting', title: 'Reunião fictícia', notes: 'Observação fictícia', location: '',
      encontro: { formato: 'online', alcance: 'distrital', publico: 'pastores_anciaos', publicoOutro: '', departamento: '' },
    })
  })

  it('Concílio pede o tipo e o formato, sem alcance: PGP presencial com local e observações', async () => {
    const user = userEvent.setup()
    abrir(); await aguardarCarregar()
    await escolherCategoria(user, 'Treinamento')
    await user.click(screen.getByRole('radio', { name: 'Igreja local' }))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Igreja' }), 'Igreja Norte Fictícia')
    await escolherCategoria(user, 'Concílio')
    expect(screen.getByRole('group', { name: 'Tipo' })).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Alcance' })).not.toBeInTheDocument()
    for (const opcao of ['Associação/Missão/União', 'Distrital', 'Igreja local', 'Departamento']) expect(screen.queryByRole('radio', { name: opcao })).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Igreja' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: 'PGP' }))
    await user.click(screen.getByRole('radio', { name: 'Presencial' }))
    await user.type(screen.getByLabelText('Local'), 'Auditório Fictício')
    await user.type(screen.getByLabelText('Observações'), 'Observação fictícia do PGP')
    await salvar(user)
    expect(estado.criados[0]).toMatchObject({
      category: 'council', title: 'PGP', churchId: null, location: 'Auditório Fictício', notes: 'Observação fictícia do PGP',
      startAt: '2026-10-06T09:00', endAt: '2026-10-06T12:00',
      encontro: { tipoConcilio: 'pgp', formato: 'presencial', alcance: null, publico: null, departamento: '' },
    })
  })

  it('Concílio online não pede local', async () => {
    const user = userEvent.setup()
    abrir(); await aguardarCarregar()
    await escolherCategoria(user, 'Concílio')
    await user.click(screen.getByRole('radio', { name: 'Concílio' }))
    await user.click(screen.getByRole('radio', { name: 'Online' }))
    expect(screen.queryByLabelText('Local')).not.toBeInTheDocument()
    await salvar(user)
    expect(estado.criados[0]).toMatchObject({ category: 'council', title: 'Concílio', location: '', encontro: { tipoConcilio: 'concilio', formato: 'online', alcance: null } })
  })

  it('Reunião, Treinamento e Evento oferecem os quatro alcances, com Associação/Missão/União primeiro', async () => {
    const user = userEvent.setup()
    abrir(); await aguardarCarregar()
    for (const categoria of ['Reunião', 'Treinamento', 'Evento']) {
      await escolherCategoria(user, categoria)
      const alcance = screen.getByRole('group', { name: 'Alcance' })
      expect(within(alcance).getAllByRole('radio').map((radio) => radio.closest('label')?.textContent), categoria)
        .toEqual(['Associação/Missão/União', 'Distrital', 'Igreja local', 'Departamento'])
    }
  })

  it('Associação/Missão/União: escolhe o nível, sugere o cadastro e limpa a igreja e o departamento escolhidos antes', async () => {
    estado.eventos = [eventoBase({
      id: 'treinamento-anterior', category: 'training', title: 'Treinamento anterior fictício',
      encontro: { formato: 'online', alcance: 'institucional', nivelInstitucional: 'missao', instituicao: 'Missão Fictícia do Sul', publico: null, publicoOutro: '', departamento: '' },
    })]
    const user = userEvent.setup()
    abrir(); await aguardarCarregar()
    await escolherCategoria(user, 'Reunião')
    await user.type(screen.getByLabelText('Título'), 'Reunião fictícia da Missão')
    await user.click(screen.getByRole('radio', { name: 'Online' }))
    await user.click(screen.getByRole('radio', { name: 'Igreja local' }))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Igreja' }), 'Igreja Norte Fictícia')
    await user.click(screen.getByRole('radio', { name: 'Departamento' }))
    await user.type(screen.getByRole('combobox', { name: 'Departamento' }), 'músi')
    await user.keyboard('{Enter}')
    await user.click(screen.getByRole('radio', { name: 'Associação/Missão/União' }))
    expect(screen.queryByRole('combobox', { name: 'Departamento' })).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Igreja' })).not.toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Instituição' })).toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: 'Missão' }))
    const nome = screen.getByLabelText('Nome da instituição')
    const sugestoes = () => [...(document.getElementById(nome.getAttribute('list') ?? '')?.querySelectorAll('option') ?? [])].map((opcao) => opcao.getAttribute('value'))
    expect(sugestoes()).toEqual(['Associação Fictícia Central', 'Missão Fictícia do Sul'])
    await user.click(screen.getByRole('radio', { name: 'União' }))
    expect(sugestoes()).toEqual(['União Fictícia do Norte'])
    await user.click(screen.getByRole('radio', { name: 'Missão' }))
    await user.type(nome, 'Missão Fictícia do Sul')
    await salvar(user)
    expect(estado.criados[0]).toMatchObject({
      category: 'meeting', title: 'Reunião fictícia da Missão', churchId: null,
      encontro: { formato: 'online', alcance: 'institucional', nivelInstitucional: 'missao', instituicao: 'Missão Fictícia do Sul', publico: null, departamento: '', departamentoOutro: '' },
    })
  })

  it('Associação/Missão/União funciona sem o nome e no formato presencial', async () => {
    const user = userEvent.setup()
    abrir(); await aguardarCarregar()
    await escolherCategoria(user, 'Evento')
    await user.type(screen.getByLabelText('Título'), 'Evento fictício da Associação')
    await user.click(screen.getByRole('radio', { name: 'Presencial' }))
    await user.type(screen.getByLabelText('Local'), 'Ginásio Fictício')
    await user.click(screen.getByRole('radio', { name: 'Associação/Missão/União' }))
    await user.click(screen.getByRole('radio', { name: 'Associação' }))
    await salvar(user)
    expect(estado.criados[0]).toMatchObject({ category: 'event', location: 'Ginásio Fictício', encontro: { formato: 'presencial', alcance: 'institucional', nivelInstitucional: 'associacao', instituicao: '' } })
  })
})

describe('editar o alcance e registros antigos de encontros', () => {
  beforeEach(() => { estado.eventId = 'agenda-evento-ficticio' })

  it('treinamento da União abre com o resumo e, trocado para Distrital, não leva a instituição', async () => {
    estado.evento = eventoBase({
      category: 'training', title: 'Treinamento fictício da União', location: '',
      encontro: { formato: 'online', alcance: 'institucional', nivelInstitucional: 'uniao', instituicao: 'União Fictícia do Norte', publico: null, publicoOutro: '', departamento: '' },
    })
    const user = userEvent.setup()
    abrir()
    expect(await screen.findByText('Treinamento · União · União Fictícia do Norte')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'União' })).toBeChecked()
    expect(screen.getByLabelText('Nome da instituição')).toHaveValue('União Fictícia do Norte')
    await user.click(screen.getByRole('radio', { name: 'Distrital' }))
    await user.click(screen.getByRole('radio', { name: 'Todos os líderes' }))
    await salvar(user)
    expect(estado.atualizados[0]).toMatchObject({ title: 'Treinamento fictício da União', encontro: { alcance: 'distrital', publico: 'todos_lideres', nivelInstitucional: null, instituicao: '' } })
  })

  it('reunião antiga de departamento, sem os campos novos, abre e grava como estava', async () => {
    estado.evento = eventoBase({ category: 'meeting', title: 'Reunião antiga fictícia', location: '', encontro: { formato: 'online', alcance: 'departamento', publico: null, publicoOutro: '', departamento: 'Ministério Jovem' } })
    const user = userEvent.setup()
    abrir()
    expect(await screen.findByText('Reunião · Departamento de Ministério Jovem')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Departamento' })).toBeChecked()
    await salvar(user)
    expect(estado.atualizados[0]).toMatchObject({ title: 'Reunião antiga fictícia', encontro: { alcance: 'departamento', departamento: 'Ministério Jovem' } })
  })

  it('Concílio antigo com alcance e igreja abre sem o alcance e grava sem nada escondido', async () => {
    estado.evento = eventoBase({
      category: 'council', title: 'Concílio', churchId: 'igreja-a', location: '', notes: 'Anotação fictícia do concílio',
      encontro: { formato: 'online', alcance: 'igreja', publico: null, publicoOutro: '', departamento: '', tipoConcilio: 'concilio' },
    })
    const user = userEvent.setup()
    abrir()
    expect(await screen.findByRole('radio', { name: 'Concílio' })).toBeChecked()
    expect(screen.queryByRole('group', { name: 'Alcance' })).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Igreja' })).not.toBeInTheDocument()
    expect(document.querySelector('.resumo-do-alcance')).toBeNull()
    await salvar(user)
    expect(estado.atualizados[0]).toMatchObject({ category: 'council', title: 'Concílio', churchId: null, notes: 'Anotação fictícia do concílio', encontro: { formato: 'online', tipoConcilio: 'concilio', alcance: null } })
  })

  it('PGP antigo presencial abre como Concílio do tipo PGP e mantém o local', async () => {
    estado.evento = eventoBase({ category: 'council', title: 'PGP', location: 'Sede Fictícia', encontro: { formato: 'presencial', alcance: 'distrital', publico: 'administrativo', publicoOutro: '', departamento: '', tipoConcilio: 'pgp' } })
    const user = userEvent.setup()
    abrir()
    expect(await screen.findByRole('radio', { name: 'PGP' })).toBeChecked()
    expect(screen.getByLabelText('Local')).toHaveValue('Sede Fictícia')
    expect(screen.queryByRole('group', { name: 'Público' })).not.toBeInTheDocument()
    await salvar(user)
    expect(estado.atualizados[0]).toMatchObject({ title: 'PGP', location: 'Sede Fictícia', encontro: { formato: 'presencial', tipoConcilio: 'pgp', alcance: null, publico: null } })
  })
})

describe('pregação', () => {
  it('todas as igrejas vincula o distrito inteiro e mostra os nomes', async () => {
    const user = userEvent.setup()
    abrir(); await aguardarCarregar()
    await escolherCategoria(user, 'Pregação')
    await user.click(screen.getByRole('radio', { name: 'Todas as igrejas — evento distrital' }))
    expect(screen.getByText('Igreja Central Fictícia, Igreja Norte Fictícia')).toBeInTheDocument()
    await salvar(user)
    expect(estado.criados[0]).toMatchObject({ escolhaDeIgreja: 'todas', churchIds: ['igreja-a', 'igreja-b'], title: 'Pregação · Todas as igrejas do distrito' })
  })

  it('Enter numa busca sem resultado não salva o compromisso', async () => {
    const user = userEvent.setup()
    abrir(); await aguardarCarregar()
    await escolherCategoria(user, 'Pregação')
    await user.click(screen.getByRole('radio', { name: 'Todas as igrejas — evento distrital' }))
    await user.click(screen.getByRole('radio', { name: 'Duas ou mais igrejas' }))
    await user.type(screen.getByRole('combobox', { name: 'Igrejas' }), 'Norte{Enter}')
    expect(estado.criados).toHaveLength(0)
    expect(estado.navegou).toHaveLength(0)
  })

  it('duas ou mais igrejas por busca; outra igreja pede o nome', async () => {
    const user = userEvent.setup()
    abrir(); await aguardarCarregar()
    await escolherCategoria(user, 'Pregação')
    await user.click(screen.getByRole('radio', { name: 'Duas ou mais igrejas' }))
    const busca = screen.getByRole('combobox', { name: 'Igrejas' })
    await user.type(busca, 'central'); await user.keyboard('{Enter}')
    await user.type(busca, 'norte'); await user.keyboard('{Enter}')
    expect(screen.getByRole('button', { name: 'Remover Igreja Norte Fictícia' })).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: 'Outra igreja' }))
    expect(screen.getByLabelText('Nome da igreja')).toBeRequired()
    await user.type(screen.getByLabelText('Nome da igreja'), 'Igreja Vizinha Fictícia')
    await salvar(user)
    expect(estado.criados[0]).toMatchObject({ escolhaDeIgreja: 'outra', churchId: null, churchIds: [], location: 'Igreja Vizinha Fictícia' })
  })
})

describe('comissão', () => {
  it('"Outra" pede o nome e guarda as pautas no compromisso; salvar chama o vínculo', async () => {
    const user = userEvent.setup()
    abrir(); await aguardarCarregar()
    await escolherCategoria(user, 'Comissão')
    await user.click(screen.getByRole('radio', { name: 'Outra' }))
    await user.type(screen.getByLabelText('Nome da comissão'), 'Comissão de Obras Fictícia')
    await user.type(screen.getByLabelText('Nova pauta'), 'Telhado fictício{Enter}')
    await user.type(screen.getByLabelText('Nova pauta'), 'Pintura fictícia{Enter}')
    await user.click(screen.getByRole('button', { name: 'Subir pauta 2' }))
    await user.selectOptions(screen.getByLabelText('Andamento da pauta 1'), 'Em andamento')
    await salvar(user)
    expect(estado.criados[0]?.title).toBe('Comissão de Obras Fictícia')
    expect(estado.criados[0]?.comissao?.pautas?.map(({ titulo, andamento }) => [titulo, andamento])).toEqual([['Pintura fictícia', 'em_andamento'], ['Telhado fictício', 'pendente']])
    expect(estado.vinculados).toEqual(['criado'])
  })

  it('Diretiva exige a igreja', async () => {
    const user = userEvent.setup()
    abrir(); await aguardarCarregar()
    await escolherCategoria(user, 'Comissão')
    await user.click(screen.getByRole('radio', { name: 'Diretiva' }))
    expect(screen.getByRole('combobox', { name: 'Igreja' })).toBeRequired()
    expect(screen.queryByLabelText('Nome da comissão')).not.toBeInTheDocument()
  })
})

describe('Ceia do Senhor', () => {
  it('traz o primeiro diácono cadastrado e deixa a diaconisa pendente', async () => {
    estado.processos = [{
      id: 'processo', churchId: 'igreja-a', period: '2026', status: 'completed',
      offices: [{ id: 'o1', title: 'Primeiro diácono', status: 'open' }, { id: 'o2', title: 'Primeira diaconisa', status: 'open' }],
      candidates: [{ officeId: 'o1', personId: 'pessoa-2', status: 'recommended', consent: true, eligibility: 'confirmed', fidelityAlert: false, vote: { result: 'approved' } }],
    }]
    const user = userEvent.setup()
    abrir(); await aguardarCarregar()
    await escolherCategoria(user, 'Ceia do Senhor')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Igreja' }), 'Igreja Central Fictícia')
    expect(screen.getByLabelText('Primeiro diácono')).toHaveValue('João Diácono Fictício')
    expect(screen.getByLabelText('Primeira diaconisa')).toHaveValue('')
    expect(screen.getByText('Pendente')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Primeira diaconisa'), 'Diaconisa Digitada Fictícia')
    expect(screen.getByText('Nome digitado')).toBeInTheDocument()

    await user.click(within(screen.getByRole('group', { name: 'Materiais completos?' })).getByRole('radio', { name: 'Não' }))
    await user.click(within(screen.getByRole('group', { name: 'Precisa providenciar?' })).getByRole('radio', { name: 'Sim' }))
    await user.click(screen.getByRole('checkbox', { name: 'Pão' }))
    await user.type(screen.getByLabelText('Quantidade de pão'), '3')
    await user.click(screen.getByRole('checkbox', { name: 'Outro' }))
    await user.type(screen.getByLabelText('Qual material?'), 'Toalha fictícia')
    await salvar(user)
    expect(estado.criados[0]?.ceia).toEqual({
      responsaveis: [
        { papel: 'primeiro_diacono', personId: 'pessoa-2', nome: 'João Diácono Fictício' },
        { papel: 'primeira_diaconisa', personId: null, nome: 'Diaconisa Digitada Fictícia' },
      ],
      materiaisCompletos: false, precisaProvidenciar: true,
      materiais: [{ item: 'pao', quantidade: 3, outro: '' }, { item: 'outro', quantidade: null, outro: 'Toalha fictícia' }],
    })
  })

  it('sem registro de diaconato, os dois ficam para digitar; materiais completos esconde o resto', async () => {
    const user = userEvent.setup()
    abrir(); await aguardarCarregar()
    await escolherCategoria(user, 'Ceia do Senhor')
    expect(screen.getAllByText('Pendente')).toHaveLength(2)
    await user.click(within(screen.getByRole('group', { name: 'Materiais completos?' })).getByRole('radio', { name: 'Não' }))
    await user.click(within(screen.getByRole('group', { name: 'Precisa providenciar?' })).getByRole('radio', { name: 'Sim' }))
    await user.click(screen.getByRole('checkbox', { name: 'Vinho' }))
    await user.click(within(screen.getByRole('group', { name: 'Materiais completos?' })).getByRole('radio', { name: 'Sim' }))
    expect(screen.queryByRole('group', { name: 'Precisa providenciar?' })).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'Vinho' })).not.toBeInTheDocument()
  })
})

describe('casamento e dedicação', () => {
  it('casamento novo pela Agenda cria o acompanhamento e o compromisso aponta para ele', async () => {
    const user = userEvent.setup()
    abrir(); await aguardarCarregar()
    await escolherCategoria(user, 'Casamento')
    expect(screen.queryByLabelText('Título')).not.toBeInTheDocument()
    expect(screen.queryByText(/Pessoas envolvidas/)).not.toBeInTheDocument()
    expect(screen.queryByText('Checklist da cerimônia')).not.toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: 'Criar novo acompanhamento' }))
    await user.type(screen.getByLabelText('Nome da noiva'), 'Noiva Fictícia')
    await user.type(screen.getByLabelText('Nome do noivo'), 'Noivo Fictício')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Igreja' }), 'Igreja Central Fictícia')
    await user.type(screen.getByLabelText('Pastor oficiante'), 'Pastor Fictício')
    await salvar(user)
    const criado = estado.casamentosCriados[0]
    expect(criado).toMatchObject({ origem: 'agenda', dados: { pastorOficiante: 'Pastor Fictício', noiva: { nome: 'Noiva Fictícia' }, cerimonia: { data: '2026-10-06', igrejaId: 'igreja-a' } } })
    expect(estado.criados[0]).toMatchObject({ category: 'wedding', casamentoId: criado?.id, papelNoCasamento: 'cerimonia', title: 'Casamento de Noiva Fictícia e Noivo Fictício', casamento: null, allDay: false })
  })

  it('noivos já acompanhados: avisa, e só cria outro quando pedido', async () => {
    estado.casamentos = [{ id: 'c-existente', ...casamentoVazio('casamentos'), noiva: { ...noivoVazio(), nome: 'Noiva Fictícia' }, noivo: { ...noivoVazio(), nome: 'Noivo Fictício' } }]
    const user = userEvent.setup()
    abrir(); await aguardarCarregar()
    await escolherCategoria(user, 'Casamento')
    await user.click(screen.getByRole('radio', { name: 'Criar novo acompanhamento' }))
    await user.type(screen.getByLabelText('Nome da noiva'), 'noiva ficticia')
    await user.type(screen.getByLabelText('Nome do noivo'), 'Noivo Fictício')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Igreja' }), 'Igreja Central Fictícia')
    await salvar(user)
    expect(screen.getByText('Já existe acompanhamento com estes noivos.')).toBeInTheDocument()
    expect(estado.criados).toHaveLength(0)
    await user.click(screen.getByRole('button', { name: 'Criar outro mesmo assim' }))
    expect(estado.casamentosCriados).toHaveLength(1)
    expect(estado.criados).toHaveLength(1)
  })

  it('vincular a casamento existente traz data, igreja e local, e sincroniza o acompanhamento', async () => {
    estado.casamentos = [{ id: 'c1', ...casamentoVazio('casamentos'), noiva: { ...noivoVazio(), nome: 'Ana Fictícia' }, noivo: { ...noivoVazio(), nome: 'Bruno Fictício' }, dataPretendida: '2026-11-20', igrejaPretendidaId: 'igreja-b', localPretendido: 'Salão fictício', pastorOficiante: 'Pastor Oficiante Fictício' }]
    const user = userEvent.setup()
    abrir(); await aguardarCarregar()
    await escolherCategoria(user, 'Casamento')
    await user.click(screen.getByRole('radio', { name: 'Vincular a casamento existente' }))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Casamento' }), 'c1')
    expect(screen.getByLabelText('Data')).toHaveValue('2026-11-20')
    expect(screen.getByRole('combobox', { name: 'Igreja' })).toHaveValue('igreja-b')
    expect(screen.getByLabelText('Local')).toHaveValue('Salão fictício')
    expect(screen.getByLabelText('Pastor oficiante')).toHaveValue('Pastor Oficiante Fictício')
    await salvar(user)
    expect(estado.criados[0]).toMatchObject({ casamentoId: 'c1', papelNoCasamento: 'cerimonia', title: 'Casamento de Ana Fictícia e Bruno Fictício' })
    expect(estado.casamentosCriados).toHaveLength(0)
    expect(estado.sincronizados).toEqual(['c1'])
  })

  it('não agenda duas vezes o mesmo casamento', async () => {
    estado.casamentos = [{ id: 'c1', ...casamentoVazio('casamentos'), noiva: { ...noivoVazio(), nome: 'Ana Fictícia' } }]
    estado.eventos = [eventoBase({ id: 'cerimonia-existente', category: 'wedding', casamentoId: 'c1', papelNoCasamento: 'cerimonia', startAt: '2026-12-01T16:00', endAt: '2026-12-01T17:00' })]
    const user = userEvent.setup()
    abrir(); await aguardarCarregar()
    await escolherCategoria(user, 'Casamento')
    await user.click(screen.getByRole('radio', { name: 'Vincular a casamento existente' }))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Casamento' }), 'c1')
    expect(screen.getByText(/Este casamento já tem compromisso na Agenda/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Abrir compromisso na Agenda' })).toHaveAttribute('href', '/agenda/cerimonia-existente/editar'.replace(/^/, '/app'))
    await salvar(user)
    expect(estado.criados).toHaveLength(0)
  })

  it('aberto a partir do acompanhamento, já vem como casamento vinculado', async () => {
    estado.params = 'inicio=2026-10-06T10:00&casamento=c1'
    estado.casamentos = [{ id: 'c1', ...casamentoVazio('casamentos'), noiva: { ...noivoVazio(), nome: 'Ana Fictícia' }, cerimonia: { data: '2026-12-05', inicio: '15:00', fim: '16:30', igrejaId: 'igreja-a', local: 'Templo fictício' } }]
    abrir(); await aguardarCarregar()
    expect(screen.getByLabelText('Categoria')).toHaveValue('wedding')
    expect(screen.getByRole('radio', { name: 'Vincular a casamento existente' })).toBeChecked()
    expect(await screen.findByDisplayValue('2026-12-05')).toBeInTheDocument()
    expect(screen.getByLabelText('Início')).toHaveValue('15:00')
    expect(screen.getByLabelText('Término')).toHaveValue('16:30')
  })

  it('compromisso já ligado mostra o acompanhamento, e não pede os noivos de novo', async () => {
    estado.eventId = 'agenda-evento-ficticio'
    estado.casamentos = [{ id: 'c1', ...casamentoVazio('casamentos'), noiva: { ...noivoVazio(), nome: 'Ana Fictícia' }, noivo: { ...noivoVazio(), nome: 'Bruno Fictício' } }]
    estado.evento = eventoBase({ category: 'wedding', churchId: 'igreja-a', casamentoId: 'c1', papelNoCasamento: 'cerimonia', title: 'Casamento de Ana Fictícia e Bruno Fictício' })
    abrir()
    expect(await screen.findByRole('link', { name: 'Abrir acompanhamento do casamento' })).toHaveAttribute('href', '/app/casamentos/c1')
    expect(screen.queryByLabelText('Nome da noiva')).not.toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: 'Criar novo acompanhamento' })).not.toBeInTheDocument()
  })

  it('dedicação: criança em texto livre, um membro pela busca e um não membro digitado', async () => {
    const user = userEvent.setup()
    abrir(); await aguardarCarregar()
    await escolherCategoria(user, 'Dedicação de criança')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Igreja' }), 'Igreja Central Fictícia')
    await user.type(screen.getByLabelText('Nome da criança'), 'Criança Fictícia')
    await user.type(screen.getByRole('combobox', { name: 'Pais ou responsáveis' }), 'maria')
    await user.keyboard('{Enter}')
    await user.click(screen.getByRole('button', { name: 'Não é membro' }))
    await user.type(screen.getByLabelText('Nome de quem não é membro'), 'Pai Fictício{Enter}')
    const escolhidos = screen.getByRole('list', { name: 'Pais ou responsáveis: escolhidos' })
    expect(within(escolhidos).getByText('Membro')).toBeInTheDocument()
    expect(within(escolhidos).getByText('Não é membro')).toBeInTheDocument()
    await salvar(user)
    expect(estado.criados[0]).toMatchObject({
      title: 'Dedicação — Criança Fictícia',
      dedicacao: { crianca: 'Criança Fictícia', responsaveis: [{ personId: 'pessoa-1', nome: 'Maria Fictícia' }, { personId: null, nome: 'Pai Fictício' }] },
    })
  })
})

describe('pessoal', () => {
  it('categoria abre a subcategoria, e "Outro" abre o texto', async () => {
    const user = userEvent.setup()
    abrir(); await aguardarCarregar()
    await escolherCategoria(user, 'Pessoal')
    await user.selectOptions(screen.getByLabelText('Categoria pessoal'), 'Saúde')
    await user.selectOptions(screen.getByLabelText('Subcategoria'), 'Outro')
    await user.type(screen.getByLabelText('Qual?'), 'Fisioterapia fictícia')
    await user.selectOptions(screen.getByLabelText('Subcategoria'), 'Dentista')
    expect(screen.queryByLabelText('Qual?')).not.toBeInTheDocument()
    await user.type(screen.getByLabelText('O que precisa ser feito'), 'Limpeza fictícia')
    await user.click(screen.getByRole('radio', { name: 'Outra forma' }))
    await user.type(screen.getByLabelText('Como será?'), 'Por mensagem')
    await salvar(user)
    expect(estado.criados[0]).toMatchObject({ category: 'personal', title: 'Limpeza fictícia', pessoal: { categoria: 'saude', subcategoria: 'Dentista', outro: '', como: 'outra', comoOutro: 'Por mensagem' } })
  })
})

describe('finalidade da visita, instrutor e departamento', () => {
  it('visita grava a finalidade; "Outra" abre o texto', async () => {
    const user = userEvent.setup()
    abrir(); await aguardarCarregar()
    const finalidade = screen.getByLabelText('Finalidade da visita')
    expect(within(finalidade).getByRole('option', { name: 'Outra' })).toBeInTheDocument()
    await user.selectOptions(finalidade, 'Outra')
    await user.type(screen.getByLabelText('Qual finalidade?'), 'Oração fictícia')
    await user.selectOptions(finalidade, 'Enfermidade')
    expect(screen.queryByLabelText('Qual finalidade?')).not.toBeInTheDocument()
    await salvar(user)
    expect(estado.criados[0]).toMatchObject({ category: 'visit', finalidade: 'illness', finalidadeOutra: '' })
    expect(screen.queryByLabelText('Título')).not.toBeInTheDocument()
  })

  it('estudo bíblico: instrutor cadastrado pela busca ou nome escrito, sem título', async () => {
    const user = userEvent.setup()
    abrir(); await aguardarCarregar()
    await escolherCategoria(user, 'Estudo Bíblico')
    expect(screen.queryByLabelText('Título')).not.toBeInTheDocument()
    await user.type(screen.getByLabelText('Nome do instrutor'), 'Instrutor Escrito Fictício')
    await salvar(user)
    expect(estado.criados[0]).toMatchObject({ category: 'bible_study', instrutor: { personId: null, nome: 'Instrutor Escrito Fictício' } })

    cleanup(); estado.criados = []
    abrir(); await aguardarCarregar()
    await escolherCategoria(user, 'Estudo Bíblico')
    await user.type(screen.getByRole('combobox', { name: 'Instrutor' }), 'joão')
    await user.keyboard('{Enter}')
    expect(screen.queryByLabelText('Nome do instrutor')).not.toBeInTheDocument()
    await salvar(user)
    expect(estado.criados[0]?.instrutor).toEqual({ personId: 'pessoa-2', nome: 'João Diácono Fictício' })
  })

  it('reaproveita o instrutor de um estudo anterior com a mesma pessoa', async () => {
    estado.eventos = [eventoBase({ id: 'estudo-anterior', category: 'bible_study', pessoaId: 'pessoa-1', startAt: '2026-09-01T19:00', endAt: '2026-09-01T20:00', instrutor: { personId: null, nome: 'Instrutora Anterior Fictícia' } })]
    const user = userEvent.setup()
    abrir(); await aguardarCarregar()
    await escolherCategoria(user, 'Estudo Bíblico')
    await user.type(screen.getByRole('combobox', { name: 'Pessoa ou família' }), 'maria')
    await user.keyboard('{Enter}')
    expect(screen.getByLabelText('Nome do instrutor')).toHaveValue('Instrutora Anterior Fictícia')
  })

  it('departamento "Outro" abre o nome do departamento', async () => {
    const user = userEvent.setup()
    abrir(); await aguardarCarregar()
    await escolherCategoria(user, 'Evento')
    await user.click(screen.getByRole('radio', { name: 'Departamento' }))
    await user.type(screen.getByRole('combobox', { name: 'Departamento' }), 'outro')
    await user.keyboard('{Enter}')
    expect(screen.getByLabelText('Qual departamento?')).toBeRequired()
  })

  it('Nomeações sem processo: avisa e o botão salva antes de abrir Nomeações', async () => {
    const user = userEvent.setup()
    abrir(); await aguardarCarregar()
    await escolherCategoria(user, 'Comissão')
    await user.click(screen.getByRole('radio', { name: 'Nomeações' }))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Igreja' }), 'Igreja Central Fictícia')
    expect(screen.getByText(/Sem processo de nomeações aberto nesta igreja/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Abrir ou criar processo em Nomeações' }))
    expect(estado.criados[0]).toMatchObject({ category: 'committee', churchId: 'igreja-a', comissao: { tipo: 'nomeacoes' } })
    expect(estado.vinculados).toEqual(['criado'])
    expect(estado.navegou).toContain('/app/comissoes/nomeacoes?igreja=igreja-a&novo=1')
  })

  it('com processo aberto, o aviso não aparece', async () => {
    estado.processos = [{ id: 'processo', churchId: 'igreja-a', period: '2027', status: 'nominating', offices: [], candidates: [] }]
    const user = userEvent.setup()
    abrir(); await aguardarCarregar()
    await escolherCategoria(user, 'Comissão')
    await user.click(screen.getByRole('radio', { name: 'Nomeações' }))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Igreja' }), 'Igreja Central Fictícia')
    expect(screen.queryByText(/Sem processo de nomeações/)).not.toBeInTheDocument()
  })
})

describe('registros antigos continuam abrindo e editando', () => {
  it('viagem antiga abre com a sua categoria, e o título digitado permanece', async () => {
    estado.eventId = 'agenda-evento-ficticio'
    estado.evento = eventoBase({ category: 'travel', title: 'Viagem antiga fictícia', startAt: '2025-03-11T08:00', endAt: '2025-03-13T18:00', allDay: true })
    const user = userEvent.setup()
    abrir()
    expect(await screen.findByDisplayValue('Viagem antiga fictícia')).toBeInTheDocument()
    expect(screen.getByLabelText('Categoria')).toHaveValue('travel')
    expect(screen.getByLabelText('Data de término')).toHaveValue('2025-03-13')
    await salvar(user)
    expect(estado.atualizados[0]).toMatchObject({ category: 'travel', title: 'Viagem antiga fictícia', allDay: true, endAt: '2025-03-13T18:00' })
  })

  it('PGP antigo abre como Concílio do tipo PGP', async () => {
    estado.eventId = 'agenda-evento-ficticio'
    estado.evento = eventoBase({ category: 'council', title: 'PGP antigo fictício', encontro: { formato: null, alcance: null, publico: null, publicoOutro: '', departamento: '', tipoConcilio: 'pgp' } })
    abrir()
    expect(await screen.findByRole('radio', { name: 'PGP' })).toBeChecked()
    expect(screen.getByLabelText('Categoria')).toHaveValue('council')
  })

  it('visita antiga mantém o título escrito e mostra a anotação que tinha', async () => {
    estado.eventId = 'agenda-evento-ficticio'
    estado.evento = eventoBase({ category: 'visit', title: 'Visita ao irmão fictício', notes: 'Anotação histórica fictícia' })
    const user = userEvent.setup()
    abrir()
    expect(await screen.findByText('Anotação histórica fictícia')).toBeInTheDocument()
    await salvar(user)
    expect(estado.atualizados[0]).toMatchObject({ title: 'Visita ao irmão fictício', notes: 'Anotação histórica fictícia' })
  })

  it('dedicação antiga abre com a criança e os pais que eram membros', async () => {
    estado.eventId = 'agenda-evento-ficticio'
    estado.evento = eventoBase({ category: 'child_dedication', churchId: 'igreja-a', location: '', ceremonyDetails: { responsible: '', involvedPersonIds: [], childPersonId: 'pessoa-1', parentPersonIds: ['pessoa-2'], checklist: {} } })
    abrir()
    expect(await screen.findByDisplayValue('Maria Fictícia')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Remover João Diácono Fictício' })).toBeInTheDocument()
  })
})
