import type { SermonSnapshot } from '../sermons/types'
export const AGENDA_CATEGORIES = ['visit', 'preaching', 'committee', 'meeting', 'bible_study', 'baptism', 'communion', 'wedding', 'child_dedication', 'training', 'event', 'travel', 'council', 'pgp', 'personal', 'other'] as const
export type AgendaCategory = (typeof AGENDA_CATEGORIES)[number]

export const AGENDA_CATEGORY_LABELS: Record<AgendaCategory, string> = {
  visit: 'Visita', preaching: 'Pregação', committee: 'Comissão', meeting: 'Reunião', bible_study: 'Estudo Bíblico', baptism: 'Batismo', communion: 'Santa Ceia', wedding: 'Casamento', child_dedication: 'Dedicação de criança', training: 'Treinamento', event: 'Evento', travel: 'Viagem', council: 'Concílio', pgp: 'PGP', personal: 'Pessoal', other: 'Outro',
}

export const CEREMONY_CATEGORIES = ['baptism', 'communion', 'wedding', 'child_dedication'] as const
export type CeremonyCategory = (typeof CEREMONY_CATEGORIES)[number]
export interface CeremonyDetails { responsible: string; involvedPersonIds: string[]; childPersonId: string | null; parentPersonIds: string[]; checklist: Record<string, boolean> }
export const CEREMONY_CHECKLISTS: Record<CeremonyCategory, Array<{ id: string; label: string }>> = {
  baptism: [{ id: 'study_completed', label: 'Estudo concluído' }, { id: 'date_confirmed', label: 'Data confirmada' }, { id: 'materials_ready', label: 'Materiais preparados' }, { id: 'post_record', label: 'Registro posterior' }],
  communion: [{ id: 'date_confirmed', label: 'Data confirmada' }, { id: 'materials_ready', label: 'Materiais preparados' }, { id: 'service_organized', label: 'Organização do serviço' }, { id: 'post_record', label: 'Registro posterior' }],
  wedding: [{ id: 'date_confirmed', label: 'Data confirmada' }, { id: 'documents_checked', label: 'Documentos conferidos' }, { id: 'pastoral_guidance', label: 'Orientação pastoral' }, { id: 'final_details', label: 'Detalhes finais' }],
  child_dedication: [{ id: 'date_confirmed', label: 'Data confirmada' }, { id: 'information_checked', label: 'Informações conferidas' }],
}
export const isCeremonyCategory = (category: AgendaCategory): category is CeremonyCategory => (CEREMONY_CATEGORIES as readonly string[]).includes(category)
export function emptyCeremonyDetails(category: CeremonyCategory): CeremonyDetails { return { responsible: '', involvedPersonIds: [], childPersonId: null, parentPersonIds: [], checklist: Object.fromEntries(CEREMONY_CHECKLISTS[category].map(({ id }) => [id, false])) } }

export interface AgendaEventData {
  title: string
  category: AgendaCategory
  churchId: string | null
  location: string
  address: string
  /** Referência futura, sem criar ou ler dados do módulo de visitas. */
  visitTarget: 'none' | 'person' | 'family'
  sermonId: string | null
  sermonSnapshot: SermonSnapshot | null
  ceremonyDetails?: CeremonyDetails | null
  linkedSource?: { type: 'evangelism_campaign' | 'evangelism_point' | 'evangelism_task'; id: string; campaignId: string } | null
  startAt: string
  endAt: string
  allDay: boolean
  reminderMinutes: number | null
  notes: string
  includeInItinerary: boolean
  mondayException: boolean
  createdAt: string
  updatedAt: string
}

export interface AgendaEventEntity extends AgendaEventData { id: string }
export type AgendaEventInput = Omit<AgendaEventData, 'createdAt' | 'updatedAt'>

export interface AgendaConflict {
  kind: 'overlap' | 'short_interval' | 'monday_rest'
  message: string
  eventId?: string
}

export interface ItineraryItem { id: string; title: string; category: AgendaCategory | 'rest'; startAt: string; endAt: string; allDay: boolean; churchName?: string | undefined; location?: string; address?: string }

export function categoryDefaults(category: AgendaCategory, date = new Date()): Pick<AgendaEventInput, 'startAt' | 'endAt' | 'allDay' | 'reminderMinutes' | 'includeInItinerary'> {
  const isoDate = date.toISOString().slice(0, 10)
  const duration = category === 'committee' ? 90 : 60
  const startHour = category === 'pgp' ? '09:00' : '08:00'
  const endHour = category === 'pgp' ? '12:00' : `${String(8 + Math.floor(duration / 60)).padStart(2, '0')}:${String(duration % 60).padStart(2, '0')}`
  return { startAt: `${isoDate}T${startHour}`, endAt: `${isoDate}T${endHour}`, allDay: category === 'council', reminderMinutes: category === 'visit' ? 15 : null, includeInItinerary: category !== 'personal' }
}
