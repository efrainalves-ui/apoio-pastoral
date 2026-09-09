import type { AgendaEventEntity } from './types'

export type AgendaView = 'day' | 'week' | 'month' | 'list'

export function dayStart(value: Date): Date {
  const date = new Date(value)
  date.setHours(0, 0, 0, 0)
  return date
}

export function dayEnd(value: Date): Date {
  const date = dayStart(value)
  date.setHours(23, 59, 59, 999)
  return date
}

export function sameDay(left: Date, right: Date): boolean {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate()
}

export function periodBounds(view: AgendaView, anchor: Date): [Date, Date] {
  const from = dayStart(anchor)
  if (view === 'day') return [from, dayEnd(from)]
  if (view === 'week' || view === 'list') {
    from.setDate(from.getDate() - from.getDay())
    const to = new Date(from)
    to.setDate(to.getDate() + 6)
    return [from, dayEnd(to)]
  }
  return [new Date(from.getFullYear(), from.getMonth(), 1), dayEnd(new Date(from.getFullYear(), from.getMonth() + 1, 0))]
}

export function moveAgendaAnchor(value: Date, view: AgendaView, direction: number): Date {
  const next = new Date(value)
  if (view === 'day') {
    next.setDate(next.getDate() + direction)
    return next
  }
  if (view === 'week' || view === 'list') {
    next.setDate(next.getDate() + direction * 7)
    return next
  }
  const targetDay = next.getDate()
  next.setDate(1)
  next.setMonth(next.getMonth() + direction)
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()
  next.setDate(Math.min(targetDay, lastDay))
  return next
}

export function eventOccursOnDay(event: AgendaEventEntity, date: Date): boolean {
  return new Date(event.startAt) <= dayEnd(date) && new Date(event.endAt) >= dayStart(date)
}

export function hoursForDay(events: readonly AgendaEventEntity[], date: Date): number[] {
  const hours = new Set(Array.from({ length: 14 }, (_, index) => index + 7))
  for (const event of events) {
    if (event.allDay || !eventOccursOnDay(event, date)) continue
    const start = new Date(event.startAt)
    hours.add(sameDay(start, date) ? start.getHours() : 0)
  }
  return [...hours].sort((left, right) => left - right)
}
