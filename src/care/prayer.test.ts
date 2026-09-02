import { describe, expect, it } from 'vitest'
import type { PersonEntity } from '../people/types'
import { anonymousPrayers, peopleForPrayerChurch, prayerChurchGroups, prayerCounters, prayerPeopleGroups, unregisteredPrayerGroups } from './prayer'
import type { PrayerRequestEntity } from './types'

const IGREJA_A = 'igreja-ficticia-a'
const IGREJA_B = 'igreja-ficticia-b'

const pessoa = (id: string, name: string, churchId: string) => ({ id, name, currentChurchId: churchId }) as PersonEntity

function pedido(partes: Partial<PrayerRequestEntity>): PrayerRequestEntity {
  return {
    id: crypto.randomUUID(), subjectType: 'person', subjectId: 'pessoa-1', subjectName: '', churchId: IGREJA_A, visitId: null,
    text: 'Motivo fictício', description: '', privateNotes: '', updates: [], status: 'active',
    requestedAt: '2026-08-20', reviewAt: '2026-08-27', testimony: '', revealed: false,
    createdAt: '2026-08-20T12:00:00.000Z', updatedAt: '2026-08-20T12:00:00.000Z',
    ...partes,
  }
}

describe('lista de membros do pedido', () => {
  it('mostra apenas quem é da igreja escolhida, em ordem', () => {
    const gente = [pessoa('p2', 'Beta Fictícia', IGREJA_A), pessoa('p1', 'Alfa Fictícia', IGREJA_A), pessoa('p3', 'Gama Fictícia', IGREJA_B)]

    expect(peopleForPrayerChurch(gente, IGREJA_A).map(({ name }) => name)).toEqual(['Alfa Fictícia', 'Beta Fictícia'])
    expect(peopleForPrayerChurch(gente, IGREJA_B).map(({ name }) => name)).toEqual(['Gama Fictícia'])
  })
})

describe('acompanhamento agrupado dos pedidos', () => {
  const pedidos = [
    pedido({ subjectId: 'p1', churchId: IGREJA_A }),
    pedido({ subjectId: 'p1', churchId: IGREJA_A, status: 'answered' }),
    pedido({ subjectId: 'p2', churchId: IGREJA_B }),
    pedido({ subjectType: 'unregistered', subjectId: null, subjectName: 'Visitante Fictício', churchId: IGREJA_A }),
    pedido({ subjectType: 'unregistered', subjectId: null, subjectName: 'visitante fictício', churchId: IGREJA_B }),
    pedido({ subjectType: 'anonymous', subjectId: null, churchId: IGREJA_A, status: 'closed' }),
  ]
  const gente = [pessoa('p1', 'Alfa Fictícia', IGREJA_A), pessoa('p2', 'Beta Fictícia', IGREJA_B)]
  const igrejas = [{ id: IGREJA_A, name: 'Igreja Fictícia A' }, { id: IGREJA_B, name: 'Igreja Fictícia B' }]

  it('lista somente igrejas que têm pedidos de membros', () => {
    expect(prayerChurchGroups(pedidos, igrejas)).toEqual([
      { id: IGREJA_A, name: 'Igreja Fictícia A', total: 2 },
      { id: IGREJA_B, name: 'Igreja Fictícia B', total: 1 },
    ])
    expect(prayerChurchGroups([], igrejas)).toEqual([])
  })

  it('lista os membros com pedidos dentro da igreja', () => {
    expect(prayerPeopleGroups(pedidos, IGREJA_A, gente)).toEqual([{ id: 'p1', name: 'Alfa Fictícia', total: 2 }])
    expect(prayerPeopleGroups(pedidos, IGREJA_B, gente)).toEqual([{ id: 'p2', name: 'Beta Fictícia', total: 1 }])
  })

  // Pessoa não cadastrada e pedido sem identificação são coisas diferentes.
  it('separa pessoas não cadastradas dos pedidos sem identificação', () => {
    const naoCadastrados = unregisteredPrayerGroups(pedidos)

    expect(naoCadastrados).toHaveLength(1)
    expect(naoCadastrados[0]).toMatchObject({ name: 'Visitante Fictício', total: 2 })
    expect(anonymousPrayers(pedidos)).toHaveLength(1)
    expect(anonymousPrayers(pedidos)[0]?.subjectName).toBe('')
  })

  it('conta em oração, respondidos e encerrados', () => {
    expect(prayerCounters(pedidos)).toEqual({ active: 4, answered: 1, closed: 1 })
    expect(prayerCounters([])).toEqual({ active: 0, answered: 0, closed: 0 })
  })
})
