import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import type { FollowUpEntity, TaskEntity, VisitEntity } from '../care/types'
import type { ChurchEntity } from '../district/types'
import { VisitasPorIgreja } from './VisitasPorIgreja'

const IGREJA: ChurchEntity = {
  id: 'igreja-ficticia', districtId: 'distrito-ficticio', name: 'Igreja Fictícia do Porto', type: 'organized_church',
  externalCode: '', address: '', worshipSchedules: [], administrativeNotes: '', status: 'active', history: [],
  createdAt: '2026-09-01T10:00:00.000Z', updatedAt: '2026-09-01T10:00:00.000Z',
}

function visita(id: string, targetId: string, startAt = '2026-09-09T19:00:00.000Z'): VisitEntity {
  return {
    id, targetType: 'person', targetId, churchId: IGREJA.id, scheduledEventId: null, mode: 'full',
    status: 'completed', currentVersion: 1,
    versions: [{ version: 1, correctedAt: startAt, answers: [], participants: [], reason: 'routine', startAt, endAt: startAt, notes: '' }],
    createdAt: startAt, updatedAt: startAt,
  }
}

const NOMES: Record<string, string> = {
  p1: 'Ana Fictícia da Silva', p2: 'Bento Fictício Rocha', p3: 'Carla Fictícia Nunes',
  p4: 'Davi Fictício Lima', p5: 'Elza Fictícia Prado', p6: 'Fábio Fictício Sales',
}

function montar(visits: VisitEntity[], followUps: FollowUpEntity[] = [], tasks: TaskEntity[] = []) {
  render(<MemoryRouter><VisitasPorIgreja
    visits={visits} followUps={followUps} tasks={tasks} churches={[IGREJA]}
    nomeDoAlvo={(visit) => NOMES[visit.targetId] ?? null}
  /></MemoryRouter>)
}

describe('visitas por igreja', () => {
  afterEach(cleanup)

  it('mostra cinco linhas por igreja e guarda o resto atrás de um toque', async () => {
    const user = userEvent.setup()
    montar(Object.keys(NOMES).map((pessoa, indice) => visita(`v${indice}`, pessoa)))

    expect(screen.getAllByRole('link')).toHaveLength(5)
    await user.click(screen.getByRole('button', { name: 'Ver todas as 6 visitas' }))
    expect(screen.getAllByRole('link')).toHaveLength(6)
    await user.click(screen.getByRole('button', { name: 'Mostrar menos' }))
    expect(screen.getAllByRole('link')).toHaveLength(5)
  })

  it('recolhe a igreja sem tirá-la da tela', async () => {
    const user = userEvent.setup()
    montar([visita('v1', 'p1')])

    const grupo = screen.getByRole('button', { name: /Igreja Fictícia do Porto/ })
    await user.click(grupo)
    expect(grupo).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('link')).toBeNull()
    expect(grupo).toBeInTheDocument()
  })

  it('busca por pessoa e por igreja, sem tropeçar em acento', async () => {
    const user = userEvent.setup()
    montar([visita('v1', 'p1'), visita('v2', 'p6')])

    const busca = screen.getByLabelText('Buscar pessoa ou igreja')
    await user.type(busca, 'fabio')
    expect(await screen.findByText('Fábio Fictício Sales')).toBeInTheDocument()
    expect(screen.queryByText('Ana Fictícia da Silva')).toBeNull()

    await user.clear(busca)
    await user.type(busca, 'PORTO')
    expect(await screen.findByText('Ana Fictícia da Silva')).toBeInTheDocument()
  })

  /*
    A etiqueta sai do que ficou em aberto, não de um campo da visita: `status`
    é sempre `completed`. Por isso o filtro precisa achar a pessoa pela tarefa
    de prioridade alta ligada a ela, e não por um valor gravado na linha.
  */
  it('filtra pelo que ficou em aberto depois da visita', async () => {
    const user = userEvent.setup()
    const urgente: TaskEntity = {
      id: 't1', title: 'Tarefa fictícia', description: '', dueAt: '2026-09-20', priority: 'high',
      status: 'pending', churchId: IGREJA.id, relatedType: 'visit', relatedId: 'v1',
      reminderMinutes: null, createdAt: '2026-09-09T19:00:00.000Z', updatedAt: '2026-09-09T19:00:00.000Z',
    }
    montar([visita('v1', 'p1'), visita('v2', 'p2')], [], [urgente])

    expect(screen.getByText('Urgente')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Urgentes' }))
    expect(screen.getByText('Ana Fictícia da Silva')).toBeInTheDocument()
    expect(screen.queryByText('Bento Fictício Rocha')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Retorno' }))
    expect(screen.getByText('Nenhuma visita encontrada')).toBeInTheDocument()
  })

  it('diz que não há nada quando não há visita nenhuma', () => {
    montar([])
    expect(screen.getByText('Nenhuma visita registrada')).toBeInTheDocument()
  })
})
