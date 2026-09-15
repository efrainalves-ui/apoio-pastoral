import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CATEGORIAS_VISUAIS } from '../agenda/identidade'
import { tituloDoMes } from '../agenda/listaDoMes'
import type { AgendaEventEntity } from '../agenda/types'
import { AgendaPage } from './AgendaPage'

const data = vi.hoisted(() => ({ events: [] as AgendaEventEntity[], apagar: vi.fn(() => Promise.resolve()) }))

vi.mock('../auth/AuthVaultContext', () => ({ useAuthVault: () => ({ accounts: [], account: { id: 'agenda-conta-ficticia' }, masterKey: {} as CryptoKey }) }))
vi.mock('../agenda/service', () => ({
  AgendaService: class { listEvents = vi.fn(() => Promise.resolve(data.events)); deleteEvent = data.apagar },
  mondayRestItems: vi.fn(() => []),
}))
vi.mock('../district/service', () => ({ DistrictService: class { getDistrict = vi.fn(() => Promise.resolve(null)); listChurches = vi.fn(() => Promise.resolve([])) } }))

function event(overrides: Partial<AgendaEventEntity> = {}): AgendaEventEntity {
  const now = new Date()
  now.setHours(10, 0, 0, 0)
  const end = new Date(now.getTime() + 60 * 60_000)
  return { id: 'agenda-evento-ficticio', title: 'Visita de teste fictícia', category: 'visit', churchId: null, location: 'Local fictício', address: 'Endereço fictício', visitTarget: 'family', sermonId: null, sermonSnapshot: null, startAt: now.toISOString(), endAt: end.toISOString(), allDay: false, reminderMinutes: 15, notes: '', includeInItinerary: true, mondayException: false, createdAt: now.toISOString(), updatedAt: now.toISOString(), ...overrides }
}

/** Um horário local do mês de hoje, deslocado em meses. */
function quando(deslocamentoDeMes: number, dia: number, hora: number): { startAt: string; endAt: string } {
  const base = new Date(); const ano = base.getFullYear(); const mes = base.getMonth() + deslocamentoDeMes
  const inicio = new Date(ano, mes, dia, hora, 0); const fim = new Date(ano, mes, dia, hora + 1, 0)
  const texto = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:00`
  return { startAt: texto(inicio), endAt: texto(fim) }
}
const tituloDoDia = (deslocamentoDeMes: number, dia: number) => { const base = new Date(); return new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(base.getFullYear(), base.getMonth() + deslocamentoDeMes, dia, 12)) }
const mesDeslocado = (deslocamento: number) => { const base = new Date(); return new Date(base.getFullYear(), base.getMonth() + deslocamento, 1) }
const abrir = () => render(<MemoryRouter><AgendaPage /></MemoryRouter>)

describe('agenda visual', () => {
  afterEach(cleanup)
  beforeEach(() => { data.events = [event()]; data.apagar.mockClear() })

  it('alterna entre Dia, Semana, Mês e Lista com controles acessíveis', async () => {
    const user = userEvent.setup()
    abrir()

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
    abrir()

    await screen.findByRole('tab', { name: 'Semana' })
    await user.click(screen.getByRole('tab', { name: 'Dia' }))
    const quickCreate = screen.getByRole('link', { name: 'Criar compromisso às 10:00' })
    expect(quickCreate).toHaveAttribute('href', expect.stringContaining('/app/agenda/novo?inicio='))
    await user.click(screen.getByRole('button', { name: 'Próximo período' }))
    await user.click(screen.getByRole('button', { name: 'Hoje' }))
    expect(screen.getByRole('link', { name: 'Novo' })).toBeInTheDocument()
  })

  it('mostra categoria com nome e ícone, e as ações de visita, sermão e itinerário', async () => {
    const user = userEvent.setup()
    data.events = [event({ category: 'preaching', title: 'Pregação fictícia', sermonId: 'sermao-ficticio', sermonSnapshot: { id: 'sermao-ficticio', title: 'Sermão fictício', theme: 'Esperança', mainText: 'Texto fictício' } }), event({ id: 'visita-ficticia', category: 'visit' })]
    abrir()

    await screen.findByRole('tab', { name: 'Semana' })
    await user.click(screen.getByRole('tab', { name: 'Lista' }))
    const linha = document.querySelector('.linha-compromisso[data-categoria="preaching"]') as HTMLElement
    expect(within(linha).getByText('Pregação')).toBeInTheDocument()
    expect(linha.querySelector('svg.selo-categoria__icone')).toBeTruthy()
    expect(screen.getByRole('link', { name: /abrir sermão de pregação fictícia/i })).toHaveAttribute('href', '/app/sermoes/sermao-ficticio')
    expect(screen.getByRole('link', { name: /registrar visita visita de teste fictícia/i })).toHaveAttribute('href', '/app/visitas/nova?agenda=visita-ficticia')
    await user.click(screen.getByRole('button', { name: 'Itinerário' }))
    expect(screen.getByRole('button', { name: 'Baixar itinerário' })).toBeInTheDocument()
  })

  it('no mês, o dia escolhido em cima abre a lista embaixo, e o compromisso embaixo abre para edição', async () => {
    const user = userEvent.setup()
    abrir()

    await screen.findByRole('tab', { name: 'Semana' })
    await user.click(screen.getByRole('tab', { name: 'Mês' }))

    const hoje = new Date()
    const rotulo = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' }).format(hoje)
    const numero = screen.getByRole('button', { name: `${rotulo}, 1 compromisso(s)` })
    expect(numero.querySelector('.ponto-categoria--visit')).toBeTruthy()

    const abaixo = screen.getByRole('link', { name: /abrir visita de teste fictícia/i })
    expect(abaixo).toHaveAttribute('href', '/app/agenda/agenda-evento-ficticio/editar')
    expect(abaixo.classList.contains('compromisso')).toBe(true)

    await user.click(numero)
    expect(numero).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getAllByRole('link', { name: /abrir visita de teste fictícia/i })).toHaveLength(1)
    await user.click(numero)
    expect(numero).toHaveAttribute('aria-pressed', 'false')
  })

  it('a semana começa em hoje e vai até sábado', async () => {
    const user = userEvent.setup()
    abrir()

    await screen.findByRole('tab', { name: 'Semana' })
    await user.click(screen.getByRole('tab', { name: 'Semana' }))

    const restam = 7 - new Date().getDay()
    expect(document.querySelectorAll('.dias-abaixo > section')).toHaveLength(restam)
    expect(screen.queryAllByRole('link', { name: /^Criar compromisso em / })).toHaveLength(restam - 1)
  })
})

describe('identidade das categorias nas quatro visualizações', () => {
  afterEach(cleanup)

  it('a mesma categoria tem a mesma cor, o mesmo nome e o mesmo ícone em Dia, Semana, Mês e Lista', async () => {
    data.events = [event({ category: 'preaching', title: 'Pregação da identidade' })]
    const preaching = CATEGORIAS_VISUAIS.find(({ id }) => id === 'preaching')!
    const conferir = (elemento: Element | null, onde: string) => {
      const alvo = elemento?.closest('.categoria-visual') as HTMLElement | null
      expect(alvo, onde).toBeTruthy()
      expect(alvo!.dataset.categoria, onde).toBe('preaching')
      expect(alvo!.dataset.destaque, onde).toBe('forte')
      expect(alvo!.style.getPropertyValue('--cat-faixa'), onde).toBe(preaching.cor)
      expect(alvo!.style.getPropertyValue('--cat-fundo-escuro'), onde).toBe(preaching.tons.escuro.fundo)
    }
    const user = userEvent.setup()
    abrir()

    const semana = await screen.findByRole('link', { name: 'Abrir Pregação da identidade, Pregação, prioridade estratégica Identidade' })
    conferir(semana, 'Semana'); expect(within(semana).getByText('Pregação')).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Dia' }))
    conferir(screen.getByRole('link', { name: 'Abrir Pregação da identidade, Pregação, prioridade estratégica Identidade' }), 'Dia')

    await user.click(screen.getByRole('tab', { name: 'Mês' }))
    conferir(document.querySelector('.calendario .ponto-categoria'), 'Mês: ponto')
    conferir(screen.getByRole('link', { name: 'Abrir Pregação da identidade, Pregação, prioridade estratégica Identidade' }), 'Mês: lista abaixo')

    await user.click(screen.getByRole('tab', { name: 'Lista' }))
    conferir(screen.getByRole('link', { name: 'Abrir Pregação da identidade, Pregação, prioridade estratégica Identidade' }), 'Lista')
  })

  it('principal tem destaque forte, moderada tem destaque moderado', async () => {
    data.events = [event({ id: 'p', category: 'baptism', title: 'Batismo fictício' }), event({ id: 'm', category: 'meeting', title: 'Reunião fictícia', startAt: quando(0, new Date().getDate(), 14).startAt, endAt: quando(0, new Date().getDate(), 14).endAt })]
    const user = userEvent.setup()
    abrir()
    await user.click(await screen.findByRole('tab', { name: 'Lista' }))
    expect((screen.getByRole('link', { name: /Abrir Batismo fictício/ }).closest('.categoria-visual') as HTMLElement).dataset.destaque).toBe('forte')
    expect((screen.getByRole('link', { name: /Abrir Reunião fictícia/ }).closest('.categoria-visual') as HTMLElement).dataset.destaque).toBe('moderado')
  })

  it('compromissos antigos recebem a categoria certa: PGP como Concílio, Viagem com o próprio nome', async () => {
    data.events = [event({ id: 'pgp', category: 'pgp', title: 'PGP antigo fictício' }), event({ id: 'viagem', category: 'travel', title: 'Viagem antiga fictícia' })]
    const user = userEvent.setup()
    abrir()
    await user.click(await screen.findByRole('tab', { name: 'Lista' }))
    const pgp = screen.getByRole('link', { name: 'Abrir PGP antigo fictício, Concílio' }).closest('.categoria-visual') as HTMLElement
    expect(pgp.dataset.categoria).toBe('council')
    const viagem = screen.getByRole('link', { name: 'Abrir Viagem antiga fictícia, Viagem' }).closest('.categoria-visual') as HTMLElement
    expect(viagem.dataset.categoria).toBe('other')
    expect(within(viagem).getByText('Viagem')).toBeInTheDocument()
  })
})

describe('legenda', () => {
  afterEach(cleanup)

  it('mostra as 14 categorias com as mesmas cores, e o botão Legenda abre e fecha', async () => {
    data.events = []
    const user = userEvent.setup()
    abrir()
    const lista = await screen.findByRole('list', { name: 'Legenda das categorias' })
    const itens = within(lista).getAllByRole('listitem')
    expect(itens.map((item) => item.textContent)).toEqual(CATEGORIAS_VISUAIS.map(({ rotulo }) => rotulo))
    itens.forEach((item, indice) => expect(item.style.getPropertyValue('--cat-faixa')).toBe(CATEGORIAS_VISUAIS[indice]!.cor))

    const botao = screen.getByRole('button', { name: 'Legenda' })
    expect(botao).toHaveAttribute('aria-expanded', 'false')
    expect(botao).toHaveAttribute('aria-controls', lista.id)
    await user.click(botao)
    expect(botao).toHaveAttribute('aria-expanded', 'true')
    expect(lista.closest('.legenda-agenda')).toHaveClass('legenda-agenda--aberta')
    await user.click(botao)
    expect(botao).toHaveAttribute('aria-expanded', 'false')
  })
})

describe('lista do mês', () => {
  afterEach(cleanup)

  it('mostra o mês inteiro, só dias com compromisso, em ordem, sem repetir e sem outros meses', async () => {
    const tarde = { id: 'tarde', title: 'Visita da tarde', category: 'visit' as const, ...quando(0, 20, 16) }
    data.events = [
      event({ id: 'noite', title: 'Pregação da noite', category: 'preaching', ...quando(0, 20, 19) }),
      event(tarde),
      event({ id: 'cedo', title: 'Comissão do começo do mês', category: 'committee', ...quando(0, 2, 8) }),
      event({ id: 'passado', title: 'Do mês passado', ...quando(-1, 27, 10) }),
      event({ id: 'seguinte', title: 'Do mês seguinte', ...quando(1, 3, 10) }),
      event(tarde),
    ]
    const user = userEvent.setup()
    abrir()
    await user.click(await screen.findByRole('tab', { name: 'Lista' }))

    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(tituloDoMes(new Date()))
    const regiao = screen.getByRole('region', { name: `Compromissos de ${tituloDoMes(new Date())}` })
    expect(within(regiao).getByText('3 compromissos neste mês')).toBeInTheDocument()
    const datas = within(regiao).getAllByRole('heading', { level: 3 }).map((cabecalho) => cabecalho.firstChild?.textContent)
    expect(datas).toEqual([tituloDoDia(0, 2), tituloDoDia(0, 20)])
    expect(within(regiao).getAllByRole('link', { name: /^Abrir / }).map((link) => link.textContent)).toEqual(['Comissão do começo do mês', 'Visita da tarde', 'Pregação da noite'])
    expect(within(regiao).queryByText('Do mês passado')).not.toBeInTheDocument()
    expect(within(regiao).queryByText('Do mês seguinte')).not.toBeInTheDocument()
    const visitaDaTarde = within(regiao).getByRole('link', { name: 'Abrir Visita da tarde, Visita, prioridade estratégica Discipulado' }).closest('li')!
    expect(within(visitaDaTarde).getByText('16:00–17:00')).toBeInTheDocument()
  })

  it('as setas mudam o mês inteiro, e Hoje volta para o mês atual', async () => {
    data.events = [event({ id: 'passado', title: 'Do mês passado', ...quando(-1, 27, 10) }), event({ id: 'seguinte', title: 'Do mês seguinte', ...quando(1, 3, 10) })]
    const user = userEvent.setup()
    abrir()
    await user.click(await screen.findByRole('tab', { name: 'Lista' }))
    expect(screen.getByText('Nenhum compromisso neste mês')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Próximo período' }))
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(tituloDoMes(mesDeslocado(1)))
    expect(screen.getByText('Do mês seguinte')).toBeInTheDocument()
    expect(screen.queryByText('Do mês passado')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Período anterior' }))
    await user.click(screen.getByRole('button', { name: 'Período anterior' }))
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(tituloDoMes(mesDeslocado(-1)))
    expect(screen.getByText('Do mês passado')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Hoje' }))
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(tituloDoMes(new Date()))
  })

  it('mês vazio: mensagem simples e botão para criar', async () => {
    data.events = []
    const user = userEvent.setup()
    abrir()
    await user.click(await screen.findByRole('tab', { name: 'Lista' }))
    expect(screen.getByText('Nenhum compromisso neste mês')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Criar compromisso' })).toHaveAttribute('href', expect.stringContaining('/app/agenda/novo?inicio='))
  })

  it('abrir, editar e excluir continuam funcionando na lista', async () => {
    data.events = [event()]
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup()
    abrir()
    await user.click(await screen.findByRole('tab', { name: 'Lista' }))
    expect(screen.getByRole('link', { name: 'Abrir Visita de teste fictícia, Visita, prioridade estratégica Discipulado' })).toHaveAttribute('href', '/app/agenda/agenda-evento-ficticio/editar')
    expect(screen.getByRole('link', { name: 'Editar Visita de teste fictícia' })).toHaveAttribute('href', '/app/agenda/agenda-evento-ficticio/editar')
    await user.click(screen.getByRole('button', { name: 'Remover Visita de teste fictícia' }))
    expect(data.apagar).toHaveBeenCalledWith('agenda-conta-ficticia', expect.anything(), 'agenda-evento-ficticio')
    vi.restoreAllMocks()
  })
})
