import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import type { AgendaEventEntity } from '../agenda/types'
import type { ChurchEntity } from '../district/types'
import type { SermonEntity } from '../sermons/types'
import { BibliotecaDeSermoes } from './BibliotecaDeSermoes'

const IGREJA: ChurchEntity = {
  id: 'igreja-ficticia', districtId: 'distrito-ficticio', name: 'Igreja Fictícia do Porto', type: 'organized_church',
  externalCode: '', address: '', worshipSchedules: [], administrativeNotes: '', status: 'active', history: [],
  createdAt: '2026-01-01T10:00:00.000Z', updatedAt: '2026-01-01T10:00:00.000Z',
}

function sermao(id: string, overrides: Partial<SermonEntity> = {}): SermonEntity {
  return {
    id, title: `Sermão fictício ${id}`, theme: 'Esperança', mainText: 'João 3:16', complementaryTexts: '',
    objective: '', introduction: '', content: '', conclusion: '', appeal: '', notes: '', tags: [],
    status: 'draft', createdAt: '2026-01-01T10:00:00.000Z', updatedAt: '2026-01-01T10:00:00.000Z', ...overrides,
  }
}

function pregacao(id: string, sermonId: string, startAt: string): AgendaEventEntity {
  return {
    id, title: 'Pregação fictícia', category: 'preaching', churchId: IGREJA.id, location: '', address: '',
    visitTarget: 'none', sermonId, sermonSnapshot: null, startAt, endAt: startAt, allDay: false,
    reminderMinutes: null, notes: '', includeInItinerary: false, mondayException: false,
    createdAt: startAt, updatedAt: startAt,
  }
}

function montar(sermons: SermonEntity[], events: AgendaEventEntity[] = []) {
  render(<MemoryRouter><BibliotecaDeSermoes sermons={sermons} events={events} churches={[IGREJA]} /></MemoryRouter>)
}

describe('biblioteca de sermões', () => {
  afterEach(cleanup)

  it('mostra a sigla do livro no lugar do mesmo ícone repetido', () => {
    montar([
      sermao('s1', { title: 'A cruz', mainText: 'Gálatas 6:13-16' }),
      sermao('s2', { title: 'O chamado', mainText: '2 Crônicas 7:14' }),
    ])
    expect(screen.getByText('GL')).toBeInTheDocument()
    expect(screen.getByText('2CR')).toBeInTheDocument()
  })

  it('diz quantas vezes foi pregado, e onde', () => {
    const pregado = sermao('s1', { title: 'Fé que move' })
    montar([pregado, sermao('s2', { title: 'Nunca usado' })], [
      pregacao('e1', 's1', '2026-02-01T19:00:00.000Z'),
      pregacao('e2', 's1', '2026-04-01T19:00:00.000Z'),
    ])
    expect(screen.getByText(/Pregado 2x/)).toBeInTheDocument()
    expect(screen.getByText(/Igreja Fictícia do Porto/)).toBeInTheDocument()
    expect(screen.getAllByText('Nunca pregado')).toHaveLength(1)
  })

  it('os contadores dos filtros vêm dos dados, e o filtro recorta a lista', async () => {
    const user = userEvent.setup()
    montar([
      sermao('s1', { title: 'Pronto fictício', status: 'ready' }),
      sermao('s2', { title: 'Rascunho fictício', status: 'draft' }),
    ])

    const todos = screen.getByRole('button', { name: /^Todos/ })
    expect(within(todos).getByText('2')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^Prontos/ }))
    expect(screen.getByText('Pronto fictício')).toBeInTheDocument()
    expect(screen.queryByText('Rascunho fictício')).toBeNull()
  })

  it('busca por título, tema e texto bíblico sem tropeçar em acento', async () => {
    const user = userEvent.setup()
    montar([
      sermao('s1', { title: 'Esperança em tempos difíceis', theme: 'Sofrimento', mainText: 'Romanos 8:28' }),
      sermao('s2', { title: 'O maior mandamento', theme: 'Amor', mainText: 'Mateus 22:37' }),
    ])
    const busca = screen.getByLabelText('Buscar título, tema ou texto bíblico')

    await user.type(busca, 'esperanca')
    expect(await screen.findByText('Esperança em tempos difíceis')).toBeInTheDocument()
    expect(screen.queryByText('O maior mandamento')).toBeNull()

    await user.clear(busca)
    await user.type(busca, 'romanos')
    expect(await screen.findByText('Esperança em tempos difíceis')).toBeInTheDocument()

    await user.clear(busca)
    await user.type(busca, 'amor')
    expect(await screen.findByText('O maior mandamento')).toBeInTheDocument()
  })

  it('ordena por título quando o pastor pede', async () => {
    const user = userEvent.setup()
    montar([
      sermao('s1', { title: 'Zaqueu', updatedAt: '2026-05-01T10:00:00.000Z' }),
      sermao('s2', { title: 'Abraão', updatedAt: '2026-01-01T10:00:00.000Z' }),
    ])
    expect(screen.getAllByRole('link')[0]).toHaveTextContent('Zaqueu')
    await user.selectOptions(screen.getByLabelText('Ordenar por'), 'titulo')
    expect(screen.getAllByRole('link')[0]).toHaveTextContent('Abraão')
  })

  /*
    O acervo cresce a vida inteira do ministério. A lista desenha trinta por
    vez para que quinhentos sermões nunca virem quinhentas linhas no documento.
  */
  it('desenha trinta por vez e cresce sob demanda', async () => {
    const user = userEvent.setup()
    montar(Array.from({ length: 70 }, (_, indice) => sermao(`s${indice}`, {
      title: `Sermão fictício ${String(indice).padStart(2, '0')}`,
      updatedAt: `2026-01-${String((indice % 28) + 1).padStart(2, '0')}T10:00:00.000Z`,
    })))

    expect(screen.getAllByRole('link')).toHaveLength(30)
    await user.click(screen.getByRole('button', { name: /Mostrar mais 30 de 40/ }))
    expect(screen.getAllByRole('link')).toHaveLength(60)
    await user.click(screen.getByRole('button', { name: /Mostrar mais 10 de 10/ }))
    expect(screen.getAllByRole('link')).toHaveLength(70)
    expect(screen.queryByRole('button', { name: /Mostrar mais/ })).toBeNull()
  })

  it('recomeça do topo quando o recorte muda', async () => {
    const user = userEvent.setup()
    montar(Array.from({ length: 70 }, (_, indice) => sermao(`s${indice}`, { status: 'ready' })))

    await user.click(screen.getByRole('button', { name: /Mostrar mais/ }))
    expect(screen.getAllByRole('link')).toHaveLength(60)
    await user.click(screen.getByRole('button', { name: /^Prontos/ }))
    expect(screen.getAllByRole('link')).toHaveLength(30)
  })

  it('a biblioteca vazia convida a criar o primeiro', () => {
    montar([])
    expect(screen.getByText('Sua biblioteca ainda está vazia')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Criar primeiro sermão' })).toBeInTheDocument()
  })

  it('a busca sem resultado não parece biblioteca vazia', async () => {
    const user = userEvent.setup()
    montar([sermao('s1', { title: 'A cruz' })])
    await user.type(screen.getByLabelText('Buscar título, tema ou texto bíblico'), 'nada disso existe')
    expect(await screen.findByText('Nenhum sermão encontrado')).toBeInTheDocument()
  })
})
