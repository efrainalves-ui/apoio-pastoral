import type { AgendaEventEntity } from '../agenda/types'
import { igrejasDoCompromisso } from '../agenda/detalhes'
import type { ChurchEntity } from '../district/types'
import { DATA_NAO_INFORMADA, type PregacaoAnteriorEntity } from './jaPregado'

export interface Preaching {
  /** Compromisso da Agenda ou, em `anterior`, o registro de já pregado. */
  eventId: string
  churchId: string | null
  /** Nome da igreja ou, quando foi fora do distrito, o lugar informado. */
  place: string
  /** Vazio quando a data não foi informada. */
  date: string
  scheduled: boolean
  origem: 'agenda' | 'anterior'
}

export const OUTRA_IGREJA = 'outra'

function diaLocal(iso: string): string {
  return iso.slice(0, 10)
}

/** Da mais recente para a mais antiga; as sem data vêm por último. */
export function compararDatasDePregacao(esquerda: string, direita: string): number {
  if (!esquerda || !direita) return Number(!esquerda) - Number(!direita)
  return direita.localeCompare(esquerda)
}

/** Pregações de um sermão, da mais recente para a mais antiga. */
export function listPreachings(
  events: AgendaEventEntity[],
  churches: ChurchEntity[],
  sermonId: string,
  agora: Date = new Date(),
  anteriores: readonly PregacaoAnteriorEntity[] = [],
): Preaching[] {
  const daAgenda: Preaching[] = events
    .filter((event) => event.category === 'preaching' && (event.sermonId === sermonId || event.sermonSnapshot?.id === sermonId))
    .map((event) => ({
      eventId: event.id,
      churchId: event.churchId,
      place: churches.find(({ id }) => id === event.churchId)?.name ?? event.location.trim() ?? '',
      date: diaLocal(event.startAt),
      scheduled: new Date(event.startAt).getTime() > agora.getTime(),
      origem: 'agenda',
    }))
  const registradas: Preaching[] = anteriores
    .filter((registro) => registro.sermonId === sermonId)
    .map((registro) => ({
      eventId: registro.id,
      churchId: registro.churchId,
      place: registro.churchId ? churches.find(({ id }) => id === registro.churchId)?.name ?? '' : registro.lugar,
      date: registro.data,
      scheduled: false,
      origem: 'anterior',
    }))
  return [...daAgenda, ...registradas].sort((esquerda, direita) => compararDatasDePregacao(esquerda.date, direita.date))
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
      ? igrejasDoCompromisso(event).includes(churchId)
      : !event.churchId && event.location.trim().toLowerCase() === place.trim().toLowerCase()),
  )
}

export function lastPreaching(preachings: Preaching[]): Preaching | undefined {
  return preachings.find(({ scheduled, date }) => !scheduled && date)
    ?? preachings.find(({ scheduled }) => !scheduled)
    ?? preachings.at(-1)
}

export function formatPreachingDate(date: string): string {
  if (!date) return DATA_NAO_INFORMADA
  const data = new Date(`${date}T12:00:00`)
  return Number.isNaN(data.getTime()) ? date : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(data)
}
