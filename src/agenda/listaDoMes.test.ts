import { describe, expect, it } from 'vitest'
import { listaDoMes, resumoDoMes, tituloDoMes } from './listaDoMes'
import type { AgendaEventEntity } from './types'

const evento = (id: string, startAt: string, extra: Partial<AgendaEventEntity> = {}): AgendaEventEntity => ({
  id, title: `Compromisso ${id}`, category: 'visit', churchId: null, location: '', address: '', visitTarget: 'none', sermonId: null, sermonSnapshot: null,
  startAt, endAt: startAt.replace(/T(\d\d)/u, (_, hora: string) => `T${String(Math.min(23, Number(hora) + 1)).padStart(2, '0')}`),
  allDay: false, reminderMinutes: null, notes: '', includeInItinerary: true, mondayException: false, createdAt: '', updatedAt: '', ...extra,
})

describe('lista do mês', () => {
  const setembro = new Date(2026, 8, 14)
  const eventos = [
    evento('a', '2026-09-16T19:30'),
    evento('b', '2026-09-16T16:00'),
    evento('c', '2026-09-03T08:00'),
    evento('d', '2026-09-16T08:00', { allDay: true }),
    evento('fora-antes', '2026-08-31T20:00'),
    evento('fora-depois', '2026-10-01T09:00'),
    evento('b', '2026-09-16T16:00'),
  ]

  it('só o mês escolhido, só dias com compromisso, em ordem de data', () => {
    const dias = listaDoMes(eventos, setembro)
    expect(dias.map(({ chave }) => chave)).toEqual(['2026-09-03', '2026-09-16'])
  })

  it('dentro do dia: sem horário primeiro, depois do mais cedo ao mais tarde, sem repetir', () => {
    const dias = listaDoMes(eventos, setembro)
    expect(dias[1]!.eventos.map(({ id }) => id)).toEqual(['d', 'b', 'a'])
    expect(dias.flatMap((dia) => dia.eventos).map(({ id }) => id)).toEqual(['c', 'd', 'b', 'a'])
  })

  it('compromisso que começa no mês anterior não entra, mesmo terminando neste', () => {
    const longo = evento('viagem', '2026-08-30T08:00', { endAt: '2026-09-02T18:00' })
    expect(listaDoMes([longo], setembro)).toEqual([])
  })

  it('título e resumo do mês', () => {
    expect(tituloDoMes(setembro)).toBe('Setembro de 2026')
    expect(resumoDoMes(listaDoMes(eventos, setembro))).toBe('4 compromissos neste mês')
    expect(resumoDoMes(listaDoMes([evento('um', '2026-09-01T10:00')], setembro))).toBe('1 compromisso neste mês')
  })
})
