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

/*
  Qualquer tipo, sempre.

  A regra antiga só deixava avançar: ponto de pregação → grupo → igreja
  organizada, nunca o contrário. Ela descreve o que acontece de verdade na
  organização de uma igreja, e por isso parecia certa.

  Só que a importação da lista de membros cadastra toda unidade como igreja
  organizada — o PDF não diz o tipo, e o aplicativo assumiu um. O pastor
  terminava com grupos gravados como igrejas organizadas e a regra o proibia
  de corrigir o próprio distrito. Uma regra que trava a correção de um palpite
  do aplicativo protege menos do que atrapalha: quem sabe o que cada unidade é
  é o pastor, não o cadastro. A troca continua registrada no histórico da
  igreja, que é onde a evolução realmente importa.
*/
export function allowedChurchTypes(): ChurchType[] {
  return [...CHURCH_TYPES]
}

export function historyEventLabel(entry: ChurchHistoryEntry): string {
  if (entry.event === 'created') return 'Igreja cadastrada'
  if (entry.event === 'type_changed') return `Tipo alterado de ${entry.from ?? '—'} para ${entry.to ?? '—'}`
  if (entry.event === 'status_changed') return `Situação alterada de ${entry.from ?? '—'} para ${entry.to ?? '—'}`
  return `Dados atualizados${entry.changedFields?.length ? `: ${entry.changedFields.join(', ')}` : ''}`
}
