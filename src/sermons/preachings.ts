import type { AgendaEventEntity } from '../agenda/types'
import type { ChurchEntity } from '../district/types'

export interface Preaching {
  eventId: string
  churchId: string | null
  /** Nome da igreja ou, quando foi fora do distrito, o lugar informado. */
  place: string
  date: string
  scheduled: boolean
}

export const OUTRA_IGREJA = 'outra'

function diaLocal(iso: string): string {
  return iso.slice(0, 10)
}

/** Pregações de um sermão, da mais recente para a mais antiga. */
export function listPreachings(
  events: AgendaEventEntity[],
  churches: ChurchEntity[],
  sermonId: string,
  agora: Date = new Date(),
): Preaching[] {
  return events
    .filter((event) => event.category === 'preaching' && (event.sermonId === sermonId || event.sermonSnapshot?.id === sermonId))
    .map((event) => ({
      eventId: event.id,
      churchId: event.churchId,
      place: churches.find(({ id }) => id === event.churchId)?.name ?? event.location.trim() ?? '',
      date: diaLocal(event.startAt),
      scheduled: new Date(event.startAt).getTime() > agora.getTime(),
    }))
    .sort((esquerda, direita) => direita.date.localeCompare(esquerda.date))
}

/**
 * Uma pregação já registrada para o mesmo sermão, no mesmo lugar e no mesmo dia.
 * Serve para atualizar em vez de criar um compromisso repetido.
 */
export function findExistingPreaching(
  events: AgendaEventEntity[],
  sermonId: string,
  churchId: string | null,
  place: string,
  date: string,
): AgendaEventEntity | undefined {
  return events.find((event) =>
    event.category === 'preaching'
    && (event.sermonId === sermonId || event.sermonSnapshot?.id === sermonId)
    && diaLocal(event.startAt) === date
    && (churchId
      ? event.churchId === churchId
      : !event.churchId && event.location.trim().toLowerCase() === place.trim().toLowerCase()),
  )
}

export function lastPreaching(preachings: Preaching[]): Preaching | undefined {
  return preachings.find(({ scheduled }) => !scheduled) ?? preachings.at(-1)
}

export function formatPreachingDate(date: string): string {
  const data = new Date(`${date}T12:00:00`)
  return Number.isNaN(data.getTime()) ? date : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(data)
}
