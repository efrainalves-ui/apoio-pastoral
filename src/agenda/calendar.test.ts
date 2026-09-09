import { describe, expect, it } from 'vitest'
import type { AgendaEventEntity } from './types'
import { eventOccursOnDay, hoursForDay, moveAgendaAnchor } from './calendar'

function event(startAt: string, endAt: string): AgendaEventEntity {
  return { id: 'evento-ficticio', title: 'Evento fictício', category: 'event', churchId: null, location: '', address: '', visitTarget: 'none', sermonId: null, sermonSnapshot: null, startAt, endAt, allDay: false, reminderMinutes: null, notes: '', includeInItinerary: false, mondayException: true, createdAt: startAt, updatedAt: startAt }
}

describe('calendário civil local', () => {
  it('mantém o mês de destino ao avançar a partir do último dia', () => {
    expect(moveAgendaAnchor(new Date(2026, 0, 31), 'month', 1)).toEqual(new Date(2026, 1, 28))
    expect(moveAgendaAnchor(new Date(2024, 1, 29), 'month', 1)).toEqual(new Date(2024, 2, 29))
    expect(moveAgendaAnchor(new Date(2026, 11, 31), 'month', 1)).toEqual(new Date(2027, 0, 31))
  })

  it('inclui eventos que atravessam o dia consultado', () => {
    const multiDay = event('2026-09-08T22:00', '2026-09-10T06:00')
    expect(eventOccursOnDay(multiDay, new Date(2026, 8, 9))).toBe(true)
    expect(eventOccursOnDay(multiDay, new Date(2026, 8, 11))).toBe(false)
  })

  it('mantém visíveis horários antes das 7h e depois das 20h', () => {
    const events = [event('2026-09-09T05:30', '2026-09-09T06:00'), event('2026-09-09T22:00', '2026-09-09T23:00')]
    expect(hoursForDay(events, new Date(2026, 8, 9))).toEqual(expect.arrayContaining([5, 22]))
  })
})
