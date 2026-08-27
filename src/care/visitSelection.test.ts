import { describe, expect, it } from 'vitest'
import { visitTargetsForChurch } from './visitSelection'

describe('seleção de visita por igreja', () => {
  const people = [{ id: 'p1', name: 'Álvaro Fictício', currentChurchId: 'church-a' }, { id: 'p2', name: 'Bruna Fictícia', currentChurchId: 'church-b' }]
  const families = [{ id: 'f1', name: 'Família Mista Fictícia', memberIds: ['p1', 'p2'] }, { id: 'f2', name: 'Família B Fictícia', memberIds: ['p2'] }]
  it('não expõe registros sem igreja selecionada e filtra pessoas por igreja e nome', () => {
    expect(visitTargetsForChurch(people as never, families as never, '')).toEqual({ people: [], families: [] })
    expect(visitTargetsForChurch(people as never, families as never, 'church-a', 'alvaro').people.map(({ id }) => id)).toEqual(['p1'])
  })
  it('mantém família mista disponível quando pelo menos um integrante pertence à igreja', () => {
    expect(visitTargetsForChurch(people as never, families as never, 'church-a').families.map(({ id }) => id)).toEqual(['f1'])
    expect(visitTargetsForChurch(people as never, families as never, 'church-b').families.map(({ id }) => id)).toEqual(['f1', 'f2'])
  })
})
