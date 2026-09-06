import { describe, expect, it } from 'vitest'
import { agruparVisitasPorIgreja } from './visitasPorIgreja'
import type { VisitEntity, VisitParticipant } from './types'

const presente = (personId: string): VisitParticipant => ({ id: `membro:${personId}`, kind: 'person', personId, present: true })

function visita(id: string, churchId: string, presentes: VisitParticipant[], startAt = '2026-09-01T10:00'): VisitEntity {
  return {
    id, targetType: 'person', targetId: presentes[0]?.personId ?? 'x', churchId, scheduledEventId: null,
    mode: 'full', status: 'completed', currentVersion: 1,
    versions: [{ version: 1, correctedAt: startAt, answers: [], participants: presentes, reason: 'routine', startAt, endAt: startAt, notes: '' }],
    createdAt: startAt, updatedAt: startAt,
  }
}

const igrejas = [{ id: 'igreja-a', name: 'Central Fictícia' }, { id: 'igreja-b', name: 'Monte Fictício' }]

describe('visitas separadas por igreja', () => {
  it('agrupa por igreja e ordena pelo nome', () => {
    // Uma lista corrida responde "o que aconteceu"; o pastor precisa de "onde
    // ainda não fui", e a igreja esquecida some no meio das outras.
    const agrupado = agruparVisitasPorIgreja([
      visita('v1', 'igreja-b', [presente('p1')]),
      visita('v2', 'igreja-a', [presente('p2')]),
    ], igrejas)

    expect(agrupado.igrejas.map(({ nome }) => nome)).toEqual(['Central Fictícia', 'Monte Fictício'])
  })

  it('conta pessoas distintas, e não visitas', () => {
    // Visitar a mesma pessoa três vezes é cuidado, não alcance: somar as três
    // daria a impressão de um distrito mais coberto do que ele está.
    const agrupado = agruparVisitasPorIgreja([
      visita('v1', 'igreja-a', [presente('p1')]),
      visita('v2', 'igreja-a', [presente('p1')]),
      visita('v3', 'igreja-a', [presente('p1'), presente('p2')]),
    ], igrejas)

    expect(agrupado.igrejas[0]?.visitas).toHaveLength(3)
    expect(agrupado.igrejas[0]?.pessoas).toBe(2)
    expect(agrupado.pessoasNoDistrito).toBe(2)
  })

  it('soma o distrito sem contar duas vezes quem foi visitado em duas igrejas', () => {
    const agrupado = agruparVisitasPorIgreja([
      visita('v1', 'igreja-a', [presente('p1')]),
      visita('v2', 'igreja-b', [presente('p1'), presente('p3')]),
    ], igrejas)

    expect(agrupado.pessoasNoDistrito).toBe(2)
  })

  it('a visita de igreja não cadastrada continua aparecendo, com nome próprio', () => {
    // Descartá-la faria o total do distrito ficar menor sem explicação.
    const agrupado = agruparVisitasPorIgreja([visita('v1', 'igreja-sumida', [presente('p1')])], igrejas)

    expect(agrupado.igrejas[0]?.nome).toBe('Sem igreja vinculada')
    expect(agrupado.pessoasNoDistrito).toBe(1)
  })

  it('dentro da igreja, a visita mais recente vem primeiro', () => {
    const agrupado = agruparVisitasPorIgreja([
      visita('antiga', 'igreja-a', [presente('p1')], '2026-01-10T10:00'),
      visita('recente', 'igreja-a', [presente('p2')], '2026-09-10T10:00'),
    ], igrejas)

    expect(agrupado.igrejas[0]?.visitas.map(({ id }) => id)).toEqual(['recente', 'antiga'])
  })
})
