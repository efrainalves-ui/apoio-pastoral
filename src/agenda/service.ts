import { currentDeviceId } from '../auth/device'
import { decryptPayload, encryptPayload } from '../crypto/vault'
import { db, type ApoioDatabase } from '../db/database'
import { VaultRepository } from '../db/repository'
import type { VaultRecord } from '../db/types'
import type { AgendaConflict, AgendaEventData, AgendaEventEntity, AgendaEventInput, ItineraryItem } from './types'
import { isCeremonyCategory } from './types'

const FIVE_MINUTES = 5 * 60 * 1000

function validDate(value: string): boolean { return Boolean(value && Number.isFinite(new Date(value).getTime())) }
export function isMonday(value: string | Date): boolean { const date = value instanceof Date ? value : new Date(value); return date.getDay() === 1 }

export function validateAgendaEvent(input: AgendaEventInput): void {
  if (!input.title.trim()) throw new Error('Informe o título do compromisso.')
  if (input.title.trim().length > 160) throw new Error('Use no máximo 160 caracteres no título.')
  if (!validDate(input.startAt) || !validDate(input.endAt)) throw new Error('Informe data e horário válidos.')
  if (new Date(input.endAt).getTime() <= new Date(input.startAt).getTime()) throw new Error('O término deve acontecer depois do início.')
  if (input.notes.trim().length > 2_000) throw new Error('Use no máximo 2.000 caracteres nas observações.')
  if (input.location.trim().length > 160 || input.address.trim().length > 300) throw new Error('Local ou endereço excede o limite permitido.')
  if (isCeremonyCategory(input.category)) {
    if (!input.ceremonyDetails?.responsible.trim()) throw new Error('Informe o responsável pela cerimônia.')
    if (input.category !== 'wedding' && !input.churchId) throw new Error('Escolha a igreja da cerimônia.')
    if (input.category === 'wedding' && !input.churchId && !input.location.trim()) throw new Error('Informe a igreja ou o local do casamento.')
    if (input.category === 'child_dedication' && !input.ceremonyDetails.childPersonId) throw new Error('Escolha a criança da dedicação.')
  }
  if (isMonday(input.startAt) && !input.mondayException) throw new Error('A segunda-feira é folga. Marque a exceção explicitamente para salvar este compromisso.')
}

export function findAgendaConflicts(candidate: AgendaEventInput, events: AgendaEventEntity[], editingId?: string): AgendaConflict[] {
  const start = new Date(candidate.startAt).getTime(); const end = new Date(candidate.endAt).getTime(); const conflicts: AgendaConflict[] = []
  if (isMonday(candidate.startAt)) conflicts.push({ kind: 'monday_rest', message: 'Este compromisso é uma exceção à folga de segunda-feira.' })
  for (const event of events) {
    if (event.id === editingId) continue
    const otherStart = new Date(event.startAt).getTime(); const otherEnd = new Date(event.endAt).getTime()
    if (start < otherEnd && end > otherStart) conflicts.push({ kind: 'overlap', eventId: event.id, message: `Há sobreposição com “${event.title}”.` })
    else if (Math.min(Math.abs(start - otherEnd), Math.abs(otherStart - end)) < FIVE_MINUTES) conflicts.push({ kind: 'short_interval', eventId: event.id, message: `O intervalo para “${event.title}” é menor que 5 minutos.` })
  }
  return conflicts
}

export function mondayRestItems(from: Date, to: Date): ItineraryItem[] {
  const cursor = new Date(from); cursor.setHours(0, 0, 0, 0); const end = new Date(to); end.setHours(23, 59, 59, 999); const items: ItineraryItem[] = []
  while (cursor <= end) {
    if (cursor.getDay() === 1) { const iso = cursor.toISOString(); items.push({ id: `rest-${iso.slice(0, 10)}`, title: 'Folga', category: 'rest', startAt: iso, endAt: iso, allDay: true }) }
    cursor.setDate(cursor.getDate() + 1)
  }
  return items
}

export class AgendaService {
  private readonly repository: VaultRepository
  constructor(private readonly database: ApoioDatabase = db) { this.repository = new VaultRepository(database) }

  private async decode(record: VaultRecord, masterKey: CryptoKey): Promise<AgendaEventEntity | null> {
    const payload = await decryptPayload(masterKey, record)
    if (payload.type !== 'agenda_event') return null
    const data = payload.data as Partial<AgendaEventData>
    return { id: record.id, ...data, location: data.location ?? '', address: data.address ?? '', visitTarget: data.visitTarget ?? 'none', sermonId: data.sermonId ?? null, sermonSnapshot: data.sermonSnapshot ?? null, ceremonyDetails: data.ceremonyDetails ?? null, linkedSource: data.linkedSource ?? null } as AgendaEventEntity
  }

  async listEvents(accountId: string, masterKey: CryptoKey): Promise<AgendaEventEntity[]> {
    const decoded = await Promise.all((await this.repository.list(accountId, 'agenda_event')).map((record) => this.decode(record, masterKey)))
    return decoded.filter((event): event is AgendaEventEntity => Boolean(event)).sort((a, b) => a.startAt.localeCompare(b.startAt))
  }

  async getEvent(accountId: string, masterKey: CryptoKey, eventId: string): Promise<AgendaEventEntity | null> {
    const record = await this.database.vaultRecords.get(eventId)
    return !record || record.accountId !== accountId || record.deletedAt ? null : this.decode(record, masterKey)
  }

  async createEvent(accountId: string, masterKey: CryptoKey, input: AgendaEventInput): Promise<AgendaEventEntity> {
    validateAgendaEvent(input)
    this.assertNoBlockingConflict(input, await this.listEvents(accountId, masterKey))
    const id = crypto.randomUUID(); const now = new Date().toISOString(); const data: AgendaEventData = { ...input, title: input.title.trim(), notes: input.notes.trim(), createdAt: now, updatedAt: now }
    const envelope = await encryptPayload(masterKey, { schemaVersion: 1, type: 'agenda_event', data }, id)
    await this.repository.saveEncrypted(accountId, currentDeviceId(accountId), id, envelope, 'agenda_event')
    return { id, ...data }
  }

  async updateEvent(accountId: string, masterKey: CryptoKey, eventId: string, input: AgendaEventInput): Promise<AgendaEventEntity> {
    validateAgendaEvent(input); const current = await this.getEvent(accountId, masterKey, eventId)
    if (!current) throw new Error('Compromisso não encontrado.')
    this.assertNoBlockingConflict(input, await this.listEvents(accountId, masterKey), eventId)
    const data: AgendaEventData = { ...input, title: input.title.trim(), notes: input.notes.trim(), createdAt: current.createdAt, updatedAt: new Date().toISOString() }
    const envelope = await encryptPayload(masterKey, { schemaVersion: 1, type: 'agenda_event', data }, eventId)
    await this.repository.saveEncrypted(accountId, currentDeviceId(accountId), eventId, envelope, 'agenda_event')
    return { id: eventId, ...data }
  }

  async deleteEvent(accountId: string, masterKey: CryptoKey, eventId: string): Promise<void> {
    if (!await this.getEvent(accountId, masterKey, eventId)) throw new Error('Compromisso não encontrado.')
    const deletedAt = new Date().toISOString(); const envelope = await encryptPayload(masterKey, { schemaVersion: 1, type: 'agenda_event_tombstone', data: { deletedAt } }, eventId)
    await this.repository.deleteEncrypted(accountId, currentDeviceId(accountId), eventId, envelope)
  }

  private assertNoBlockingConflict(input: AgendaEventInput, events: AgendaEventEntity[], editingId?: string): void {
    const blocking = findAgendaConflicts(input, events, editingId).find((conflict) => conflict.kind !== 'monday_rest')
    if (blocking) throw new Error(blocking.kind === 'overlap' ? 'Há sobreposição com outro compromisso.' : 'Mantenha ao menos 5 minutos entre compromissos.')
  }
}
