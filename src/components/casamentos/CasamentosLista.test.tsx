import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { casamentoVazio, noivoVazio } from '../../casamentos/core'
import type { CasamentoEntity } from '../../casamentos/types'
import type { ChurchEntity } from '../../district/types'
import { CasamentosLista } from './CasamentosLista'

const estado = vi.hoisted(() => ({ casamentos: [] as CasamentoEntity[], eventos: [] as unknown[] }))
vi.mock('../../auth/AuthVaultContext', () => ({ useAuthVault: () => ({ accounts: [], account: { id: 'conta-ficticia' }, masterKey: {} as CryptoKey }) }))
vi.mock('../../agenda/service', () => ({ AgendaService: class { listEvents = vi.fn(() => Promise.resolve(estado.eventos)) } }))
vi.mock('../../casamentos/service', async (importarOriginal) => ({
  ...await importarOriginal<Record<string, unknown>>(),
  CasamentoService: class { listar = vi.fn(() => Promise.resolve(estado.casamentos)) },
}))

const IGREJAS = [{ id: 'igreja-a', name: 'Igreja Central Fictícia', status: 'active' }, { id: 'igreja-b', name: 'Igreja Norte Fictícia', status: 'active' }] as ChurchEntity[]
const casal = (id: string, noiva: string, noivo: string, mudancas: Partial<CasamentoEntity> = {}): CasamentoEntity =>
  ({ id, ...casamentoVazio('casamentos'), noiva: { ...noivoVazio(), nome: noiva }, noivo: { ...noivoVazio(), nome: noivo }, ...mudancas })

afterEach(() => cleanup())

describe('aba Casamentos', () => {
  it('lista os casais com igreja, datas, etapa, situação, pendências e próximo compromisso', async () => {
    estado.casamentos = [casal('c1', 'Ana Fictícia', 'Bruno Fictício', { igrejaPretendidaId: 'igreja-a', dataPretendida: '2027-03-01' })]
    estado.eventos = [{ id: 'e1', casamentoId: 'c1', papelNoCasamento: 'entrevista', category: 'other', title: 'Entrevista pastoral — casamento de Ana Fictícia e Bruno Fictício', startAt: '2099-01-10T19:00', endAt: '2099-01-10T20:00' }]
    render(<MemoryRouter><CasamentosLista churches={IGREJAS} /></MemoryRouter>)
    expect(await screen.findByRole('heading', { name: 'Ana Fictícia e Bruno Fictício' })).toBeInTheDocument()
    expect(screen.getByText('Igreja Central Fictícia', { selector: 'dd' })).toBeInTheDocument()
    expect(screen.getByText('01/03/2027')).toBeInTheDocument()
    expect(screen.getByText('Primeiro contato', { selector: 'dd' })).toBeInTheDocument()
    expect(screen.getByText('Com pendências', { selector: '.status-pill' })).toBeInTheDocument()
    expect(screen.getByText(/Entrevista pastoral — casamento de Ana Fictícia e Bruno Fictício · 10\/01\/2099 19:00/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Abrir acompanhamento de Ana Fictícia e Bruno Fictício' })).toHaveAttribute('href', '/app/casamentos/c1')
    expect(screen.getByRole('link', { name: 'Novo casamento' })).toHaveAttribute('href', '/app/casamentos/novo')
  })

  it('pesquisa por casal e filtra por igreja, etapa e situação', async () => {
    estado.eventos = []
    estado.casamentos = [
      casal('c1', 'Ana Fictícia', 'Bruno Fictício', { igrejaPretendidaId: 'igreja-a' }),
      casal('c2', 'Carla Fictícia', 'Davi Fictício', { igrejaPretendidaId: 'igreja-b', etapa: 'cancelado' }),
    ]
    const user = userEvent.setup()
    render(<MemoryRouter><CasamentosLista churches={IGREJAS} /></MemoryRouter>)
    await screen.findByRole('heading', { name: 'Ana Fictícia e Bruno Fictício' })

    await user.type(screen.getByRole('searchbox', { name: 'Buscar casal' }), 'davi')
    expect(screen.queryByRole('heading', { name: 'Ana Fictícia e Bruno Fictício' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Carla Fictícia e Davi Fictício' })).toBeInTheDocument()
    await user.clear(screen.getByRole('searchbox', { name: 'Buscar casal' }))

    await user.selectOptions(screen.getByLabelText('Igreja'), 'Igreja Central Fictícia')
    expect(screen.queryByRole('heading', { name: 'Carla Fictícia e Davi Fictício' })).not.toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Igreja'), 'Todas')

    await user.selectOptions(screen.getByLabelText('Etapa'), 'Cancelado')
    expect(screen.queryByRole('heading', { name: 'Ana Fictícia e Bruno Fictício' })).not.toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Etapa'), 'Todas')

    await user.selectOptions(screen.getByLabelText('Situação'), 'Cancelado')
    expect(screen.getByRole('heading', { name: 'Carla Fictícia e Davi Fictício' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Ana Fictícia e Bruno Fictício' })).not.toBeInTheDocument()
  })
})
