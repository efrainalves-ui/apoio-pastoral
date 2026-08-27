export const CHURCH_TYPES = ['organized_church', 'group', 'preaching_point'] as const
export type ChurchType = (typeof CHURCH_TYPES)[number]

export const CHURCH_TYPE_LABELS: Record<ChurchType, string> = {
  organized_church: 'Igreja organizada',
  group: 'Grupo',
  preaching_point: 'Ponto de pregação',
}

export const CHURCH_STATUSES = ['active', 'archived'] as const
export type ChurchStatus = (typeof CHURCH_STATUSES)[number]

export const CHURCH_STATUS_LABELS: Record<ChurchStatus, string> = {
  active: 'Ativa',
  archived: 'Arquivada',
}

export const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const
export type Weekday = (typeof WEEKDAYS)[number]

export const WEEKDAY_LABELS: Record<Weekday, string> = {
  sunday: 'Domingo',
  monday: 'Segunda-feira',
  tuesday: 'Terça-feira',
  wednesday: 'Quarta-feira',
  thursday: 'Quinta-feira',
  friday: 'Sexta-feira',
  saturday: 'Sábado',
}

export interface WorshipSchedule {
  id: string
  day: Weekday
  time: string
}

export type ChurchHistoryEvent = 'created' | 'details_updated' | 'type_changed' | 'status_changed'

export interface ChurchHistoryEntry {
  id: string
  at: string
  event: ChurchHistoryEvent
  from?: string
  to?: string
  changedFields?: string[]
}

export interface DistrictData {
  name: string
  createdAt: string
  updatedAt: string
}

export interface DistrictEntity extends DistrictData {
  id: string
}

export interface ChurchData {
  districtId: string
  name: string
  type: ChurchType
  externalCode: string
  address: string
  worshipSchedules: WorshipSchedule[]
  administrativeNotes: string
  status: ChurchStatus
  history: ChurchHistoryEntry[]
  createdAt: string
  updatedAt: string
}

export interface ChurchEntity extends ChurchData {
  id: string
}

export interface ChurchInput {
  name: string
  type: ChurchType | ''
  externalCode: string
  address: string
  worshipSchedules: WorshipSchedule[]
  administrativeNotes: string
  status: ChurchStatus
}

export const emptyChurchInput = (): ChurchInput => ({
  name: '',
  type: '',
  externalCode: '',
  address: '',
  worshipSchedules: [],
  administrativeNotes: '',
  status: 'active',
})

export function allowedChurchTypes(current?: ChurchType): ChurchType[] {
  if (!current) return [...CHURCH_TYPES]
  if (current === 'preaching_point') return ['preaching_point', 'group']
  if (current === 'group') return ['group', 'organized_church']
  return ['organized_church']
}

export function historyEventLabel(entry: ChurchHistoryEntry): string {
  if (entry.event === 'created') return 'Igreja cadastrada'
  if (entry.event === 'type_changed') return `Tipo alterado de ${entry.from ?? '—'} para ${entry.to ?? '—'}`
  if (entry.event === 'status_changed') return `Situação alterada de ${entry.from ?? '—'} para ${entry.to ?? '—'}`
  return `Dados atualizados${entry.changedFields?.length ? `: ${entry.changedFields.join(', ')}` : ''}`
}
