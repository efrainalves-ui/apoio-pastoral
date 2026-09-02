import { currentDeviceId } from '../auth/device'
import { decryptRecord, encryptPayload } from '../crypto/vault'
import { db, type ApoioDatabase } from '../db/database'
import { VaultRepository, type EncryptedMutation } from '../db/repository'
import type { VaultRecord } from '../db/types'
import { FamilyService } from '../families/service'
import { PeopleService } from '../people/service'
import type { PersonData } from '../people/types'
import type { FollowUpData, FollowUpEntity, PrayerRequestData, PrayerRequestEntity, PrayerRequestInput, TaskData, TaskEntity, VisitCompletionInput, VisitData, VisitEntity, VisitRoundData, VisitRoundEntity, VisitVersion } from './types'

type CareEntity = VisitEntity | PrayerRequestEntity | FollowUpEntity | TaskEntity | VisitRoundEntity

function assertCompletion(input: VisitCompletionInput): void {
  if (!input.targetId || !input.churchId) throw new Error('Selecione a pessoa ou família e a igreja da visita.')
  if (!input.participants.some(({ present }) => present)) throw new Error('Informe ao menos uma pessoa presente.')
  if (!input.startAt || !input.endAt || new Date(input.endAt) <= new Date(input.startAt)) throw new Error('Revise o horário da visita.')
  if (input.notes.length > 2_000 || input.prayerText.length > 1_000) throw new Error('Revise o tamanho dos textos da visita.')
  if (input.answers.some(({ question, value, skipped }) => !skipped && (question.responseType === 'number' ? !Number.isFinite(Number(value)) || Number(value) < 0 : Array.isArray(value) ? value.length === 0 : !String(value).trim()))) throw new Error('Responda ou pule explicitamente cada pergunta selecionada.')
}

function decodeData<T extends CareEntity>(record: VaultRecord, data: unknown): T | null { return record.deletedAt ? null : ({ id: record.id, ...(data as object) } as T) }

export class CareService {
  private readonly repository: VaultRepository; private readonly people: PeopleService; private readonly families: FamilyService
  constructor(private readonly database: ApoioDatabase = db) { this.repository = new VaultRepository(database); this.people = new PeopleService(database); this.families = new FamilyService(database) }

  private async list<T extends CareEntity>(accountId: string, masterKey: CryptoKey, recordType: VaultRecord['recordType'], payloadType: string): Promise<T[]> {
    const values: T[] = []
    for (const record of await this.repository.list(accountId, recordType)) { const payload = await decryptRecord(masterKey, record); if (payload?.type === payloadType) { const value = decodeData<T>(record, payload.data); if (value) values.push(value) } }
    return values
  }

  async listVisits(accountId: string, masterKey: CryptoKey): Promise<VisitEntity[]> { return (await this.list<VisitEntity>(accountId, masterKey, 'visit', 'visit')).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) }
  async getVisit(accountId: string, masterKey: CryptoKey, visitId: string): Promise<VisitEntity | null> { return (await this.listVisits(accountId, masterKey)).find(({ id }) => id === visitId) ?? null }
  async listPrayerRequests(accountId: string, masterKey: CryptoKey): Promise<PrayerRequestEntity[]> {
    return (await this.list<PrayerRequestEntity>(accountId, masterKey, 'prayer_request', 'prayer_request')).map((prayer) => ({
      ...prayer,
      subjectId: prayer.subjectId ?? null,
      visitId: prayer.visitId ?? null,
      description: prayer.description ?? '',
      privateNotes: prayer.privateNotes ?? '',
      updates: prayer.updates ?? [],
      reviewAt: prayer.reviewAt || prayer.requestedAt.slice(0, 10),
    })).sort((a, b) => b.requestedAt.localeCompare(a.requestedAt))
  }
  async listFollowUps(accountId: string, masterKey: CryptoKey): Promise<FollowUpEntity[]> { return (await this.list<FollowUpEntity>(accountId, masterKey, 'follow_up', 'follow_up')).sort((a, b) => a.dueAt.localeCompare(b.dueAt)) }
  async listTasks(accountId: string, masterKey: CryptoKey): Promise<TaskEntity[]> { return (await this.list<TaskEntity>(accountId, masterKey, 'task', 'task')).sort((a, b) => a.dueAt.localeCompare(b.dueAt)) }
  async listRounds(accountId: string, masterKey: CryptoKey): Promise<VisitRoundEntity[]> { return (await this.list<VisitRoundEntity>(accountId, masterKey, 'visit_round', 'visit_round')).sort((a, b) => b.startedAt.localeCompare(a.startedAt)) }

  async completeVisit(accountId: string, masterKey: CryptoKey, input: VisitCompletionInput): Promise<VisitEntity> {
    assertCompletion(input); const now = new Date().toISOString(); const visitId = crypto.randomUUID()
    const version: VisitVersion = { version: 1, correctedAt: now, participants: input.participants.map((item) => ({ ...item })), answers: input.answers.map((answer) => ({ ...answer, question: { ...answer.question, options: [...answer.question.options] }, value: Array.isArray(answer.value) ? [...answer.value] : answer.value })), reason: input.reason, startAt: input.startAt, endAt: input.endAt, notes: input.notes.trim() }
    const visit: VisitData = { targetType: input.targetType, targetId: input.targetId, churchId: input.churchId, scheduledEventId: input.scheduledEventId, mode: input.mode, status: 'completed', currentVersion: 1, versions: [version], createdAt: now, updatedAt: now }
    const mutations: EncryptedMutation[] = [{ recordId: visitId, recordType: 'visit', envelope: await encryptPayload(masterKey, { schemaVersion: 1, type: 'visit', data: visit }, visitId) }]
    if (input.prayerText.trim()) { const id = crypto.randomUUID(); const prayer: PrayerRequestData = { subjectType: input.targetType, subjectId: input.targetId, churchId: input.churchId, visitId, text: input.prayerText.trim(), description: '', privateNotes: '', updates: [], status: 'active', requestedAt: input.startAt, reviewAt: input.prayerReviewAt, testimony: '', revealed: false, createdAt: now, updatedAt: now }; mutations.push({ recordId: id, recordType: 'prayer_request', envelope: await encryptPayload(masterKey, { schemaVersion: 1, type: 'prayer_request', data: prayer }, id) }) }
    if (input.followUp) { const id = crypto.randomUUID(); const followUp: FollowUpData = { visitId, subjectType: input.targetType, subjectId: input.targetId, churchId: input.churchId, kind: input.followUp.kind, dueAt: input.followUp.dueAt, status: 'pending', notes: input.followUp.notes.trim(), createdAt: now, updatedAt: now }; mutations.push({ recordId: id, recordType: 'follow_up', envelope: await encryptPayload(masterKey, { schemaVersion: 1, type: 'follow_up', data: followUp }, id) }) }
    if (input.task?.title.trim()) { const id = crypto.randomUUID(); const task: TaskData = { title: input.task.title.trim(), description: input.task.description.trim(), dueAt: input.task.dueAt, priority: input.task.priority, status: 'pending', churchId: input.churchId, relatedType: 'visit', relatedId: visitId, reminderMinutes: null, createdAt: now, updatedAt: now }; mutations.push({ recordId: id, recordType: 'task', envelope: await encryptPayload(masterKey, { schemaVersion: 1, type: 'task', data: task }, id) }) }
    for (const answer of input.incomeAnswers) {
      if (answer.status === 'unknown') continue
      const person = await this.people.getPerson(accountId, masterKey, answer.personId); if (!person || person.incomeStatus !== 'unknown') continue
      const { id: _id, ...stored } = person; void _id
      const data: PersonData = { ...stored, incomeStatus: answer.status, history: [...stored.history, { id: crypto.randomUUID(), at: now, event: 'income_status_updated', source: 'Entrevista pastoral' }], updatedAt: now }
      mutations.push({ recordId: person.id, recordType: 'person', envelope: await encryptPayload(masterKey, { schemaVersion: 1, type: 'person', data }, person.id) })
    }
    if (input.roundId) {
      // A visita passou a ser registrada por membro. A rodada continua sendo de
      // famílias, então a família vem de quem foi visitado.
      const familyId = input.targetType === 'family'
        ? input.targetId
        : (await this.families.listFamilies(accountId, masterKey)).find((family) => family.memberIds.includes(input.targetId))?.id ?? ''
      const round = (await this.listRounds(accountId, masterKey)).find(({ id }) => id === input.roundId)
      if (round && round.status === 'active' && round.targetFamilyIds.includes(familyId)) { const input = { targetId: familyId }; const visitedFamilyIds = [...new Set([...round.visitedFamilyIds, input.targetId])]; const completed = round.targetFamilyIds.length > 0 && visitedFamilyIds.length === round.targetFamilyIds.length; const { id: _id, ...existing } = round; void _id; const next: VisitRoundData = { ...existing, visitedFamilyIds, status: completed ? 'completed' : 'active', completedAt: completed ? now : null, updatedAt: now }; mutations.push({ recordId: round.id, recordType: 'visit_round', envelope: await encryptPayload(masterKey, { schemaVersion: 1, type: 'visit_round', data: next }, round.id) }) }
    }
    await this.repository.applyEncryptedMutations(accountId, currentDeviceId(accountId), mutations)
    return { id: visitId, ...visit }
  }

  async correctVisit(accountId: string, masterKey: CryptoKey, visitId: string, version: Omit<VisitVersion, 'version' | 'correctedAt'>): Promise<VisitEntity> {
    const current = await this.getVisit(accountId, masterKey, visitId); if (!current) throw new Error('Visita não encontrada.')
    const now = new Date().toISOString(); const nextVersion: VisitVersion = { ...version, version: current.currentVersion + 1, correctedAt: now, participants: version.participants.map((item) => ({ ...item })), answers: version.answers.map((answer) => ({ ...answer, question: { ...answer.question, options: [...answer.question.options] } })) }
    const { id: _id, ...stored } = current; void _id; const data: VisitData = { ...stored, currentVersion: nextVersion.version, versions: [...current.versions, nextVersion], updatedAt: now }
    const envelope = await encryptPayload(masterKey, { schemaVersion: 1, type: 'visit', data }, visitId); await this.repository.saveEncrypted(accountId, currentDeviceId(accountId), visitId, envelope, 'visit'); return { id: visitId, ...data }
  }

  async createRound(accountId: string, masterKey: CryptoKey, name: string, churchId: string | null, targetFamilyIds: string[]): Promise<VisitRoundEntity> {
    if (!name.trim() || !targetFamilyIds.length) throw new Error('Informe o nome e ao menos uma família para a rodada.')
    const id = crypto.randomUUID(); const now = new Date().toISOString(); const data: VisitRoundData = { name: name.trim(), churchId, targetFamilyIds: [...new Set(targetFamilyIds)], visitedFamilyIds: [], status: 'active', startedAt: now, completedAt: null, createdAt: now, updatedAt: now }
    const envelope = await encryptPayload(masterKey, { schemaVersion: 1, type: 'visit_round', data }, id); await this.repository.saveEncrypted(accountId, currentDeviceId(accountId), id, envelope, 'visit_round'); return { id, ...data }
  }

  async createTask(accountId: string, masterKey: CryptoKey, input: Omit<TaskData, 'status' | 'createdAt' | 'updatedAt'>): Promise<TaskEntity> {
    if (!input.title.trim() || !input.dueAt) throw new Error('Informe o título e o prazo da tarefa.')
    if (input.title.length > 160 || input.description.length > 2_000) throw new Error('Revise o tamanho dos textos da tarefa.')
    const id = crypto.randomUUID(); const now = new Date().toISOString(); const data: TaskData = { ...input, title: input.title.trim(), description: input.description.trim(), status: 'pending', createdAt: now, updatedAt: now }
    const envelope = await encryptPayload(masterKey, { schemaVersion: 1, type: 'task', data }, id); await this.repository.saveEncrypted(accountId, currentDeviceId(accountId), id, envelope, 'task'); return { id, ...data }
  }

  async savePrayerRequest(accountId: string, masterKey: CryptoKey, input: PrayerRequestInput, prayerId?: string): Promise<PrayerRequestEntity> {
    if (!input.churchId) throw new Error('Escolha a igreja do pedido.')
    if (input.kind === 'member' && !input.personId) throw new Error('Escolha o membro da igreja.')
    if (input.kind === 'unregistered' && !input.personName.trim()) throw new Error('Informe o nome da pessoa não cadastrada.')
    if (!input.subject.trim() || !input.requestedAt) throw new Error('Informe o assunto e a data do pedido.')
    if (input.personName.trim().length > 120) throw new Error('Revise o tamanho do nome informado.')
    if (input.subject.trim().length > 180 || input.description.trim().length > 1_000 || input.privateNotes.trim().length > 1_000) throw new Error('Revise o tamanho dos textos do pedido.')
    const current = prayerId ? (await this.listPrayerRequests(accountId, masterKey)).find(({ id }) => id === prayerId) : null
    if (prayerId && !current) throw new Error('Pedido não encontrado.')
    const id = prayerId ?? crypto.randomUUID(); const timestamp = new Date().toISOString()
    const data: PrayerRequestData = {
      subjectType: input.kind === 'member' ? 'person' : input.kind === 'unregistered' ? 'unregistered' : 'anonymous',
      subjectId: input.kind === 'member' ? input.personId : null,
      subjectName: input.kind === 'unregistered' ? input.personName.trim() : '',
      churchId: input.churchId, visitId: current?.visitId ?? null, text: input.subject.trim(), description: input.description.trim(), privateNotes: input.privateNotes.trim(),
      updates: current?.updates ?? [], status: current?.status ?? 'active', requestedAt: input.requestedAt, reviewAt: current?.reviewAt ?? input.requestedAt,
      testimony: current?.testimony ?? '', revealed: false, createdAt: current?.createdAt ?? timestamp, updatedAt: timestamp,
    }
    await this.repository.saveEncrypted(accountId, currentDeviceId(accountId), id, await encryptPayload(masterKey, { schemaVersion: 1, type: 'prayer_request', data }, id), 'prayer_request')
    return { id, ...data }
  }

  async addPrayerUpdate(accountId: string, masterKey: CryptoKey, prayer: PrayerRequestEntity, text: string): Promise<PrayerRequestEntity> {
    if (!text.trim()) throw new Error('Escreva uma atualização curta.')
    if (text.trim().length > 500) throw new Error('Use no máximo 500 caracteres na atualização.')
    const timestamp = new Date().toISOString(); const { id, ...stored } = prayer
    const data: PrayerRequestData = { ...stored, updates: [...stored.updates, { id: crypto.randomUUID(), at: timestamp, text: text.trim() }], updatedAt: timestamp }
    await this.repository.saveEncrypted(accountId, currentDeviceId(accountId), id, await encryptPayload(masterKey, { schemaVersion: 1, type: 'prayer_request', data }, id), 'prayer_request')
    return { id, ...data }
  }

  async deletePrayerRequest(accountId: string, masterKey: CryptoKey, prayerId: string): Promise<void> {
    const prayer = (await this.listPrayerRequests(accountId, masterKey)).find(({ id }) => id === prayerId)
    if (!prayer) throw new Error('Pedido não encontrado.')
    const deletedAt = new Date().toISOString(); const tombstone = await encryptPayload(masterKey, { schemaVersion: 1, type: 'prayer_request_tombstone', data: { deletedAt } }, prayerId)
    await this.repository.deleteEncrypted(accountId, currentDeviceId(accountId), prayerId, tombstone)
  }

  async updatePrayer(accountId: string, masterKey: CryptoKey, prayer: PrayerRequestEntity, status: PrayerRequestData['status'], testimony = ''): Promise<void> { const { id, ...stored } = prayer; const data: PrayerRequestData = { ...stored, status, testimony: testimony.trim(), updatedAt: new Date().toISOString() }; await this.repository.saveEncrypted(accountId, currentDeviceId(accountId), id, await encryptPayload(masterKey, { schemaVersion: 1, type: 'prayer_request', data }, id), 'prayer_request') }
  async updateFollowUp(accountId: string, masterKey: CryptoKey, followUp: FollowUpEntity, status: FollowUpData['status']): Promise<void> { const { id, ...stored } = followUp; const data: FollowUpData = { ...stored, status, updatedAt: new Date().toISOString() }; await this.repository.saveEncrypted(accountId, currentDeviceId(accountId), id, await encryptPayload(masterKey, { schemaVersion: 1, type: 'follow_up', data }, id), 'follow_up') }
  async updateTask(accountId: string, masterKey: CryptoKey, task: TaskEntity, status: TaskData['status']): Promise<void> { const { id, ...stored } = task; const data: TaskData = { ...stored, status, updatedAt: new Date().toISOString() }; await this.repository.saveEncrypted(accountId, currentDeviceId(accountId), id, await encryptPayload(masterKey, { schemaVersion: 1, type: 'task', data }, id), 'task') }
}
