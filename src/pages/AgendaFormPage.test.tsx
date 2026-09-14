import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgendaEventEntity, AgendaEventInput } from '../agenda/types'
import { notificarDadosSincronizados } from '../sync/useReloadOnSync'
import { AgendaFormPage } from './AgendaFormPage'

const estado = vi.hoisted(() => ({
  eventId: undefined as string | undefined,
  evento: null as AgendaEventEntity | null,
  apagar: vi.fn(() => Promise.resolve()),
  criados: [] as AgendaEventInput[],
  atualizados: [] as AgendaEventInput[],
  vinculados: [] as string[],
  processos: [] as unknown[],
  navegou: [] as string[],
}))

vi.mock('react-router-dom', async (importarOriginal) => ({
  ...await importarOriginal<Record<string, unknown>>(),
  useParams: () => ({ eventId: estado.eventId }),
  useNavigate: () => (destino: string) => { estado.navegou.push(destino); return Promise.resolve() },
  // Uma terça-feira: a folga de segunda não trava o botão de salvar.
  useSearchParams: () => [new URLSearchParams('inicio=2026-10-06T10:00'), vi.fn()],
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
    listEvents = vi.fn(() => Promise.resolve([]))
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

function abrir() { return render(<MemoryRouter><AgendaFormPage /></MemoryRouter>) }
async function escolherCategoria(user: ReturnType<typeof userEvent.setup>, rotulo: string) {
  await user.selectOptions(await screen.findByLabelText('Categoria'), rotulo)
}
async function aguardarCarregar() { await screen.findByRole('option', { name: 'Igreja Central Fictícia' }) }
const salvar = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole('button', { name: 'Salvar compromisso' }))

beforeEach(() => {
  estado.eventId = undefined; estado.evento = null; estado.apagar.mockClear(); estado.navegou = []
  estado.criados = []; estado.atualizados = []; estado.vinculados = []; estado.processos = []
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

  it('Concílio pede o tipo: Concílio ou PGP', async () => {
    const user = userEvent.setup()
    abrir(); await aguardarCarregar()
    await escolherCategoria(user, 'Concílio')
    expect(screen.getByRole('group', { name: 'Tipo' })).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: 'PGP' }))
    await user.click(screen.getByRole('radio', { name: 'Online' }))
    await user.click(screen.getByRole('radio', { name: 'Igreja local' }))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Igreja' }), 'Igreja Norte Fictícia')
    await salvar(user)
    expect(estado.criados[0]).toMatchObject({ category: 'council', title: 'PGP', churchId: 'igreja-b', encontro: { tipoConcilio: 'pgp', alcance: 'igreja' } })
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
  it('casamento grava noivos, curso, comissão e datas', async () => {
    const user = userEvent.setup()
    abrir(); await aguardarCarregar()
    await escolherCategoria(user, 'Casamento')
    expect(screen.queryByLabelText('Responsável')).not.toBeInTheDocument()
    expect(screen.queryByText(/Pessoas envolvidas/)).not.toBeInTheDocument()
    await user.selectOptions(screen.getByRole('combobox', { name: 'Igreja' }), 'Igreja Central Fictícia')
    await user.type(screen.getByLabelText('Noivo'), 'Noivo Fictício')
    await user.type(screen.getByLabelText('Noiva'), 'Noiva Fictícia')
    await user.click(within(screen.getByRole('group', { name: 'Fez o curso de noivos?' })).getByRole('radio', { name: 'Sim' }))
    await user.click(within(screen.getByRole('group', { name: 'Passou pela comissão?' })).getByRole('radio', { name: 'Não' }))
    await user.type(screen.getByLabelText('Data civil'), '2026-10-01')
    await salvar(user)
    expect(estado.criados[0]).toMatchObject({
      title: 'Casamento — Noivo Fictício e Noiva Fictícia',
      casamento: { noivo: 'Noivo Fictício', noiva: 'Noiva Fictícia', cursoDeNoivos: true, passouPelaComissao: false, dataCivil: '2026-10-01', dataReligiosa: '2026-10-06' },
    })
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
