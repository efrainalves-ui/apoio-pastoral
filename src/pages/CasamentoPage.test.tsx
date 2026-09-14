import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgendaEventEntity } from '../agenda/types'
import { casamentoVazio, noivoVazio } from '../casamentos/core'
import type { CasamentoEntity } from '../casamentos/types'
import { CasamentoPage } from './CasamentoPage'

const estado = vi.hoisted(() => ({
  casamento: null as CasamentoEntity | null,
  eventos: [] as AgendaEventEntity[],
  salvos: [] as Array<{ casamento: CasamentoEntity; acao: string | undefined }>,
  navegou: [] as string[],
  pdf: [] as Array<{ titulo: string; linhas: string[] }>,
}))

vi.mock('react-router-dom', async (importarOriginal) => ({
  ...await importarOriginal<Record<string, unknown>>(),
  useParams: () => ({ casamentoId: 'c1' }),
  useNavigate: () => (destino: string) => { estado.navegou.push(destino); return Promise.resolve() },
}))
vi.mock('../auth/AuthVaultContext', () => ({ useAuthVault: () => ({ accounts: [], account: { id: 'conta-ficticia' }, masterKey: {} as CryptoKey }) }))
vi.mock('../casamentos/service', async (importarOriginal) => ({
  ...await importarOriginal<Record<string, unknown>>(),
  CasamentoService: class {
    obter = vi.fn(() => Promise.resolve(estado.casamento))
    compromissos = vi.fn(() => Promise.resolve(estado.eventos))
    visitas = vi.fn(() => Promise.resolve([]))
    salvar = vi.fn((_a: string, _k: CryptoKey, casamento: CasamentoEntity, acao?: string) => { estado.salvos.push({ casamento, acao }); estado.casamento = casamento; return Promise.resolve(casamento) })
    sincronizarParaAgenda = vi.fn(() => Promise.resolve(null))
    vincularComissao = vi.fn()
    agendarCompromisso = vi.fn()
  },
}))
vi.mock('../district/service', () => ({ DistrictService: class { getDistrict = vi.fn(() => Promise.resolve({ id: 'd' })); listChurches = vi.fn(() => Promise.resolve([{ id: 'igreja-a', name: 'Igreja Central Fictícia', status: 'active' }])) } }))
vi.mock('../people/service', () => ({ PeopleService: class { listPeople = vi.fn(() => Promise.resolve([])) } }))
vi.mock('../commissions/service', () => ({ CommissionService: class { meetings = vi.fn(() => Promise.resolve([])) } }))
vi.mock('../reports/localPdf', () => ({ previewLocalPdf: (titulo: string, linhas: string[]) => { estado.pdf.push({ titulo, linhas }) } }))

function casamento(mudancas: Partial<CasamentoEntity> = {}): CasamentoEntity {
  return { id: 'c1', ...casamentoVazio('casamentos'), noiva: { ...noivoVazio(), nome: 'Ana Fictícia' }, noivo: { ...noivoVazio(), nome: 'Bruno Fictício' }, pastorResponsavel: 'Pastor Fictício', ...mudancas }
}

const abrir = () => render(<MemoryRouter><CasamentoPage /></MemoryRouter>)

beforeEach(() => { estado.casamento = casamento(); estado.eventos = []; estado.salvos = []; estado.navegou = []; estado.pdf = [] })
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('página do acompanhamento', () => {
  it('mostra as nove áreas e o resumo, sem campo de comentários nem marca de confidencial', async () => {
    abrir()
    expect(await screen.findByRole('heading', { name: 'Ana Fictícia e Bruno Fictício', level: 1 })).toBeInTheDocument()
    const areas = within(screen.getByRole('navigation', { name: 'Áreas do casamento' })).getAllByRole('link').map((link) => link.textContent)
    expect(areas).toEqual(['Resumo', 'Dados dos noivos', 'Visitas e entrevistas', 'Curso de noivos', 'Documentos e casamento civil', 'Comissão da igreja', 'Orientações ao casal', 'Preparação da cerimônia', 'Histórico e pendências'])
    expect(screen.queryByText(/Comentários/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/confidencial/i)).not.toBeInTheDocument()
  })

  it('a etapa é do pastor: a sugestão aparece, mas nada muda sozinho', async () => {
    estado.casamento = casamento({ cerimonia: { data: '2027-01-10', inicio: '16:00', fim: '17:00', igrejaId: 'igreja-a', local: '' } })
    const user = userEvent.setup()
    abrir()
    const etapa = await screen.findByLabelText('Etapa atual')
    expect(etapa).toHaveValue('primeiro_contato')
    await user.click(screen.getByRole('button', { name: 'Sugestão: Aguardando entrevista' }))
    expect(etapa).toHaveValue('aguardando_entrevista')
    expect(estado.salvos).toHaveLength(0)
  })

  it('entrevista: respostas começam pendentes; a quinta pergunta é o curso', async () => {
    const user = userEvent.setup()
    abrir()
    await screen.findByLabelText('Etapa atual')
    expect(screen.getAllByText('Pendente', { selector: '.pergunta-do-casamento .status-pill' })).toHaveLength(5)
    await user.click(within(screen.getByRole('group', { name: 'Vestuário e apresentação pessoal' })).getByRole('radio', { name: 'Sim' }))
    await user.click(within(screen.getByRole('group', { name: 'Ornamentação da igreja' })).getByRole('radio', { name: 'Não' }))
    await user.click(within(screen.getByRole('group', { name: 'Curso de noivos' })).getByRole('radio', { name: 'Sim' }))
    expect(screen.getByLabelText('Situação do curso')).toHaveValue('concluido')
    await user.click(screen.getByRole('button', { name: 'Registrar entrevista' }))
    const salvo = estado.salvos.at(-1)!
    expect(salvo.acao).toMatch(/^Entrevista pastoral registrada/)
    expect(salvo.casamento.entrevistas[0]).toMatchObject({ realizadaPor: 'Pastor Fictício', respostas: { vestuario: 'sim', principios: null, recepcao: null, ornamentacao: 'nao' }, cursoNaData: 'concluido' })
    expect(salvo.casamento.curso.situacao).toBe('concluido')
  })

  it('mudar o curso muda a resposta da quinta pergunta', async () => {
    const user = userEvent.setup()
    abrir()
    await user.selectOptions(await screen.findByLabelText('Situação do curso'), 'Em andamento')
    expect(within(screen.getByRole('group', { name: 'Curso de noivos' })).getByRole('radio', { name: 'Não' })).toBeChecked()
  })

  it('sem compromisso, "Agendar casamento" abre a Agenda ligada a este acompanhamento', async () => {
    const user = userEvent.setup()
    abrir()
    await user.click(await screen.findByRole('button', { name: 'Agendar casamento' }))
    expect(estado.navegou).toEqual(['/app/agenda/novo?casamento=c1'])
  })

  it('com compromisso, o botão vira "Abrir compromisso na Agenda"', async () => {
    estado.eventos = [{ id: 'cerimonia', title: 'Casamento de Ana Fictícia e Bruno Fictício', category: 'wedding', casamentoId: 'c1', papelNoCasamento: 'cerimonia', churchId: 'igreja-a', location: '', address: '', visitTarget: 'none', sermonId: null, sermonSnapshot: null, startAt: '2027-01-10T16:00', endAt: '2027-01-10T17:00', allDay: false, reminderMinutes: null, notes: '', includeInItinerary: true, mondayException: false, createdAt: '', updatedAt: '' }]
    abrir()
    expect(await screen.findByRole('link', { name: 'Abrir compromisso na Agenda' })).toHaveAttribute('href', '/app/agenda/cerimonia/editar')
    expect(screen.queryByRole('button', { name: 'Agendar casamento' })).not.toBeInTheDocument()
  })

  it('comissão: a frase de recomendação só com situação, igreja e data', async () => {
    const user = userEvent.setup()
    abrir()
    await user.selectOptions(await screen.findByLabelText('Igreja da comissão'), 'Igreja Central Fictícia')
    await user.selectOptions(screen.getByLabelText('Situação da comissão'), 'Recomendada')
    expect(screen.queryByText(/Recomendação feita pela Comissão/)).not.toBeInTheDocument()
    await user.type(screen.getByLabelText('Data da comissão'), '2026-10-05')
    expect(screen.getByText('Recomendação feita pela Comissão da Igreja de Igreja Central Fictícia, em 05/10/2026.')).toBeInTheDocument()
  })

  it('orientações: as catorze, e a versão para imprimir', async () => {
    const user = userEvent.setup()
    abrir()
    await screen.findByLabelText('Etapa atual')
    expect(within(document.querySelector('.orientacoes-casal') as HTMLElement).getAllByRole('listitem')).toHaveLength(14)
    await user.click(screen.getByRole('button', { name: 'Imprimir orientações' }))
    expect(estado.pdf[0]).toMatchObject({ titulo: 'Orientações aos noivos — Ana Fictícia e Bruno Fictício' })
    expect(estado.pdf[0]?.linhas).toHaveLength(14)
  })

  it('checklist: o que vem de outra área só é lido; o resto se marca, com data', async () => {
    const user = userEvent.setup()
    abrir()
    await screen.findByLabelText('Etapa atual')
    expect(screen.queryByLabelText('Situação: Entrevista pastoral realizada')).not.toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Situação: Local reservado'), 'Concluído')
    await user.type(screen.getByLabelText('Data: Local reservado'), '2026-10-20')
    await user.click(screen.getByRole('button', { name: 'Salvar acompanhamento' }))
    expect(estado.salvos.at(-1)?.casamento.checklist.local).toEqual({ situacao: 'concluido', data: '2026-10-20' })
  })

  it('pouca antecedência só avisa; cancelar mantém o histórico', async () => {
    estado.casamento = casamento({ dataSolicitacao: '2026-09-14', dataPretendida: '2026-10-10', historico: [{ id: 'h1', em: '2026-09-14T10:00:00.000Z', texto: 'Acompanhamento criado pela aba Casamentos' }] })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup()
    abrir()
    expect(await screen.findByText('Pedido com menos de três meses de antecedência.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancelar casamento' }))
    const salvo = estado.salvos.at(-1)!
    expect(salvo).toMatchObject({ acao: 'Casamento cancelado', casamento: { etapa: 'cancelado' } })
    expect(salvo.casamento.historico).toHaveLength(1)
  })
})
