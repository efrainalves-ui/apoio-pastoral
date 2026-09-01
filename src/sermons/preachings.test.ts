import { describe, expect, it } from 'vitest'
import type { AgendaEventEntity } from '../agenda/types'
import type { ChurchEntity } from '../district/types'
import { findExistingPreaching, lastPreaching, listPreachings } from './preachings'

const SERMAO = 'sermao-ficticio'
const AGORA = new Date('2026-09-10T12:00:00.000Z')

const igrejas = [{ id: 'igreja-ficticia', name: 'Igreja Fictícia Central' }] as ChurchEntity[]

function evento(partes: Partial<AgendaEventEntity>): AgendaEventEntity {
  return {
    id: crypto.randomUUID(), title: 'Pregação', category: 'preaching', churchId: 'igreja-ficticia',
    location: '', address: '', visitTarget: 'none', sermonId: SERMAO, sermonSnapshot: null,
    startAt: '2026-09-01T09:00:00.000Z', endAt: '2026-09-01T10:30:00.000Z', allDay: false,
    reminderMinutes: null, notes: '', includeInItinerary: true, mondayException: false,
    createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
    ...partes,
  }
}

describe('pregações de um sermão', () => {
  it('lista igreja e data, da mais recente para a mais antiga', () => {
    const lista = listPreachings([
      evento({ startAt: '2026-09-01T09:00:00.000Z' }),
      evento({ startAt: '2026-08-10T09:00:00.000Z' }),
    ], igrejas, SERMAO, AGORA)

    expect(lista.map(({ date }) => date)).toEqual(['2026-09-01', '2026-08-10'])
    expect(lista[0]?.place).toBe('Igreja Fictícia Central')
  })

  // Uma pregação marcada para depois não é a mesma coisa que uma já feita.
  it('separa a pregação programada da já registrada', () => {
    const lista = listPreachings([
      evento({ startAt: '2026-09-20T09:00:00.000Z' }),
      evento({ startAt: '2026-09-01T09:00:00.000Z' }),
    ], igrejas, SERMAO, AGORA)

    expect(lista.map(({ scheduled }) => scheduled)).toEqual([true, false])
    expect(lastPreaching(lista)?.date).toBe('2026-09-01')
  })

  it('mostra o nome informado quando a pregação foi fora do distrito', () => {
    const lista = listPreachings([evento({ churchId: null, location: 'Capela Fictícia do Campo' })], igrejas, SERMAO, AGORA)

    expect(lista[0]?.place).toBe('Capela Fictícia do Campo')
    expect(lista[0]?.churchId).toBeNull()
  })

  it('ignora compromisso de outro sermão ou de outra categoria', () => {
    const lista = listPreachings([
      evento({ sermonId: 'outro-sermao-ficticio' }),
      evento({ category: 'meeting' }),
    ], igrejas, SERMAO, AGORA)

    expect(lista).toEqual([])
  })
})

describe('não repetir a mesma pregação', () => {
  it('encontra a pregação já registrada no mesmo lugar e dia', () => {
    const existente = evento({})

    expect(findExistingPreaching([existente], SERMAO, 'igreja-ficticia', '', '2026-09-01')?.id).toBe(existente.id)
  })

  it('não confunde dias diferentes nem igrejas diferentes', () => {
    const existente = evento({})

    expect(findExistingPreaching([existente], SERMAO, 'igreja-ficticia', '', '2026-09-02')).toBeUndefined()
    expect(findExistingPreaching([existente], SERMAO, 'outra-igreja-ficticia', '', '2026-09-01')).toBeUndefined()
  })

  it('reconhece o mesmo lugar de fora do distrito, sem diferenciar maiúsculas', () => {
    const existente = evento({ churchId: null, location: 'Capela Fictícia do Campo' })

    expect(findExistingPreaching([existente], SERMAO, null, 'capela fictícia do campo', '2026-09-01')?.id).toBe(existente.id)
  })
})
