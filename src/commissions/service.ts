import { AgendaService } from '../agenda/service'
import { currentDeviceId } from '../auth/device'
import { decryptRecord, encryptPayload } from '../crypto/vault'
import { db, type ApoioDatabase } from '../db/database'
import { VaultRepository } from '../db/repository'
import type { EncryptedMutation } from '../db/repository'
import type { VaultRecord } from '../db/types'
import { DistrictService } from '../district/service'
import { freeList, freeText } from '../reports/redaction'
import { localDateKey } from '../shared/dates'
import { agendaText, canDeliberate, elderPresidencyAllowed, meetingPresidentName, minutesText, presidentMayBreakTie, tieBreakNote, voteNumber, voteResult } from './core'
import type { CommissionAgendaItem, CommissionConfigData, CommissionEntity, CommissionMeetingData, CommissionTaskData, TaskStatus, PresidentTieBreak } from './types'

const now = () => new Date().toISOString()

export class CommissionService {
  private readonly repository: VaultRepository
  private readonly agenda: AgendaService
  private readonly district: DistrictService

  constructor(private readonly database: ApoioDatabase = db) {
    this.repository = new VaultRepository(database)
    this.agenda = new AgendaService(database)
    this.district = new DistrictService(database)
  }

  private async decode<T extends object>(record: VaultRecord, masterKey: CryptoKey, type: string): Promise<CommissionEntity<T> | null> {
    const payload = await decryptRecord(masterKey, record)
    return payload?.type === type ? { id: record.id, ...(payload.data as T) } : null
  }

  private async list<T extends object>(accountId: string, masterKey: CryptoKey, type: VaultRecord['recordType']): Promise<CommissionEntity<T>[]> {
    const decoded = await Promise.all((await this.repository.list(accountId, type)).map((record) => this.decode<T>(record, masterKey, type)))
    return decoded.flatMap((item) => item ? [item as CommissionEntity<T>] : [])
  }

  async config(accountId: string, masterKey: CryptoKey, churchId: string): Promise<CommissionEntity<CommissionConfigData> | null> {
    return (await this.list<CommissionConfigData>(accountId, masterKey, 'commission_config')).find((item) => item.churchId === churchId) ?? null
  }

  async saveConfig(accountId: string, masterKey: CryptoKey, input: Omit<CommissionConfigData, 'updatedAt'>): Promise<CommissionEntity<CommissionConfigData>> {
    if (input.boardQuorum < 1 || input.administrativeQuorum < 1) throw new Error('Informe os quóruns definidos pela igreja.')
    if (!input.year || input.year < 2000) throw new Error('Informe o ano eclesiástico.')
    // O presidente padrão é o pastor. A escolha de um ancião é exceção de
    // igreja organizada e só vale para quem está registrado como ancião.
    if (input.presidentMode === 'elder') {
      const church = await this.district.getChurch(accountId, masterKey, input.churchId)
      if (!elderPresidencyAllowed(church?.type)) throw new Error('Somente igreja organizada pode ter um ancião presidindo a comissão.')
      if (!input.boardPresidentId || !(input.elderIds ?? []).includes(input.boardPresidentId)) throw new Error('Escolha um ancião registrado para presidir a comissão.')
    }
    const current = await this.config(accountId, masterKey, input.churchId)
    const id = current?.id ?? crypto.randomUUID()
    const sameYear = current?.year === input.year
    const data: CommissionConfigData = {
      ...input,
      nextBoardVote: sameYear ? current.nextBoardVote : input.nextBoardVote || 1,
      nextAdministrativeVote: sameYear ? current.nextAdministrativeVote : input.nextAdministrativeVote || 1,
      updatedAt: now(),
    }
    const envelope = await encryptPayload(masterKey, { schemaVersion: 1, type: 'commission_config', data }, id)
    await this.repository.saveEncrypted(accountId, currentDeviceId(accountId), id, envelope, 'commission_config')
    return { id, ...data }
  }

  async meetings(accountId: string, masterKey: CryptoKey, churchId?: string): Promise<CommissionEntity<CommissionMeetingData>[]> {
    return (await this.list<CommissionMeetingData>(accountId, masterKey, 'commission_meeting')).filter((item) => !churchId || item.churchId === churchId).sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`))
  }

  async meeting(accountId: string, masterKey: CryptoKey, meetingId: string): Promise<CommissionEntity<CommissionMeetingData> | null> {
    const record = await this.database.vaultRecords.get(meetingId)
    if (!record || record.accountId !== accountId || record.deletedAt) return null
    return this.decode<CommissionMeetingData>(record, masterKey, 'commission_meeting')
  }

  async saveMeeting(accountId: string, masterKey: CryptoKey, data: CommissionMeetingData, id: string = crypto.randomUUID()): Promise<CommissionEntity<CommissionMeetingData>> {
    const current = await this.meeting(accountId, masterKey, id)
    if (current?.finalizedAt) throw new Error('A ata finalizada está protegida e não pode ser alterada.')
    const normalized = { ...data, agenda: [...data.agenda].sort((a, b) => a.order - b.order).map((item, index) => ({ ...item, order: index + 1 })) }
    const envelope = await encryptPayload(masterKey, { schemaVersion: 1, type: 'commission_meeting', data: normalized }, id)
    await this.repository.saveEncrypted(accountId, currentDeviceId(accountId), id, envelope, 'commission_meeting')
    return { id, ...normalized }
  }

  async confirmVote(accountId: string, masterKey: CryptoKey, meetingId: string, itemId: string, favorable: number, against: number, abstentions: number, presidentVoted = false, presidentTieBreak: PresidentTieBreak = null): Promise<CommissionEntity<CommissionMeetingData>> {
    const meeting = await this.meeting(accountId, masterKey, meetingId)
    if (!meeting) throw new Error('Reunião não encontrada.')
    if (meeting.finalizedAt) throw new Error('A ata finalizada está protegida e não pode ser alterada.')
    if ([favorable, against, abstentions].some((value) => !Number.isInteger(value) || value < 0)) throw new Error('Informe quantidades válidas de votos.')
    const config = await this.config(accountId, masterKey, meeting.churchId)
    if (!config) throw new Error('Configure os quóruns desta igreja antes de votar.')
    const quorum = meeting.kind === 'board' ? config.boardQuorum : config.administrativeQuorum
    const present = meeting.participantIds.length + meeting.votingGuestNames.length
    const item = meeting.agenda.find((entry) => entry.id === itemId)
    if (!item) throw new Error('Assunto não encontrado.')
    if (item.vote?.confirmedAt) throw new Error('Esta votação já foi confirmada.')
    if (favorable + against + abstentions > present) throw new Error('O total de votos não pode superar as pessoas com direito a voto.')
    const hasQuorum = canDeliberate(present, quorum)
    if (!hasQuorum && item.decisionType !== 'record') throw new Error('Não há quórum para deliberar este assunto.')
    // RN-025: o voto de qualidade do presidente só entra em empate e só se ele
    // ainda não tiver votado na contagem comum.
    if (presidentTieBreak && !presidentMayBreakTie(favorable, against, presidentVoted)) {
      throw new Error(presidentVoted
        ? 'O presidente já votou nesta contagem e não pode votar de novo para desempatar.'
        : 'O voto de desempate do presidente só vale quando a votação termina empatada.')
    }
    const result = voteResult(favorable, against, abstentions, hasQuorum, item.decisionType === 'record', presidentTieBreak)
    const sequence = meeting.kind === 'board' ? config.nextBoardVote : config.nextAdministrativeVote
    const numbered = result === 'approved' || result === 'recorded'
    const number = numbered ? voteNumber(config.year, sequence) : undefined
    const timestamp = now()
    const agenda = meeting.agenda.map((entry) => entry.id === itemId ? {
      ...entry,
      vote: { favorable, against, abstentions, result, ...(number ? { voteNumber: number } : {}), finalText: entry.proposal, confirmedAt: timestamp, presidentVoted, presidentTieBreak },
    } : entry)
    const meetingData: CommissionMeetingData = { ...meeting, agenda, updatedAt: timestamp }
    const configData: CommissionConfigData = {
      ...config,
      ...(numbered && meeting.kind === 'board' ? { nextBoardVote: sequence + 1 } : {}),
      ...(numbered && meeting.kind === 'administrative' ? { nextAdministrativeVote: sequence + 1 } : {}),
      updatedAt: timestamp,
    }
    const meetingEnvelope = await encryptPayload(masterKey, { schemaVersion: 1, type: 'commission_meeting', data: meetingData }, meeting.id)
    const mutations: EncryptedMutation[] = [{ recordId: meeting.id, envelope: meetingEnvelope, recordType: 'commission_meeting' }]
    if (numbered) {
      const configEnvelope = await encryptPayload(masterKey, { schemaVersion: 1, type: 'commission_config', data: configData }, config.id)
      mutations.push({ recordId: config.id, envelope: configEnvelope, recordType: 'commission_config' })
    }
    await this.repository.applyEncryptedMutations(accountId, currentDeviceId(accountId), mutations)
    return { id: meeting.id, ...meetingData }
  }

  async finalizeMeeting(accountId: string, masterKey: CryptoKey, meetingId: string): Promise<CommissionEntity<CommissionMeetingData>> {
    const meeting = await this.meeting(accountId, masterKey, meetingId)
    if (!meeting) throw new Error('Reunião não encontrada.')
    if (meeting.finalizedAt) return meeting
    if (!(meeting.presidentId || meeting.presidentLabel?.trim()) || !meeting.secretaryId) throw new Error('Informe presidente e secretário(a) antes de finalizar a ata.')
    const finalizedAt = now()
    return this.saveMeeting(accountId, masterKey, { ...meeting, finalizedAt, updatedAt: finalizedAt }, meetingId)
  }

  async forwardToAdministrative(accountId: string, masterKey: CryptoKey, meetingId: string, itemId: string, targetMeetingId?: string): Promise<CommissionEntity<CommissionMeetingData>> {
    const source = await this.meeting(accountId, masterKey, meetingId)
    if (!source || source.kind !== 'board') throw new Error('O encaminhamento precisa partir da Comissão Diretiva.')
    const item = source.agenda.find((entry) => entry.id === itemId)
    if (!item?.vote?.voteNumber || item.vote.result !== 'approved') throw new Error('Somente um voto aprovado pode ser encaminhado.')
    const alreadyForwarded = (await this.meetings(accountId, masterKey, source.churchId)).find((candidate) => candidate.kind === 'administrative' && candidate.agenda.some((entry) => entry.sourceMeetingId === source.id && entry.sourceVoteNumber === item.vote?.voteNumber))
    if (!targetMeetingId && alreadyForwarded) return alreadyForwarded
    const target = targetMeetingId ? await this.meeting(accountId, masterKey, targetMeetingId) : null
    if (target && (target.kind !== 'administrative' || target.churchId !== source.churchId || target.finalizedAt)) throw new Error('Escolha uma Reunião Administrativa em aberto da mesma igreja.')
    const timestamp = now()
    const forwarded: CommissionAgendaItem = { ...item, id: crypto.randomUUID(), order: (target?.agenda.length ?? 0) + 1, decisionType: 'approve', destination: 'internal', sourceVoteNumber: item.vote.voteNumber, sourceMeetingId: source.id, privateNotes: '' }
    delete forwarded.vote
    if (!target) {
      const config = await this.config(accountId, masterKey, source.churchId)
      return this.saveMeeting(accountId, masterKey, {
        churchId: source.churchId, kind: 'administrative', date: source.date, time: '', location: source.location,
        presidentId: source.presidentId, ...(source.presidentLabel ? { presidentLabel: source.presidentLabel } : {}), secretaryId: config?.secretaryId ?? '', participantIds: [], guestNames: [], votingGuestNames: [],
        openingPrayer: '', reflection: '', notes: '', agenda: [forwarded], createdAt: timestamp, updatedAt: timestamp,
      })
    }
    return this.saveMeeting(accountId, masterKey, { ...target, agenda: [...target.agenda, forwarded], updatedAt: timestamp }, target.id)
  }

  async tasks(accountId: string, masterKey: CryptoKey, meetingId?: string): Promise<CommissionEntity<CommissionTaskData>[]> {
    return (await this.list<CommissionTaskData>(accountId, masterKey, 'commission_task')).filter((item) => !meetingId || item.meetingId === meetingId).sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  }

  async createTask(accountId: string, masterKey: CryptoKey, meeting: CommissionEntity<CommissionMeetingData>, item: CommissionAgendaItem): Promise<CommissionEntity<CommissionTaskData>> {
    if (item.vote?.result !== 'approved' && item.vote?.result !== 'recorded') throw new Error('Confirme a decisão antes de criar a pendência.')
    const existing = (await this.tasks(accountId, masterKey, meeting.id)).find((task) => task.agendaItemId === item.id)
    if (existing) return existing
    const id = crypto.randomUUID(); const timestamp = now()
    const data: CommissionTaskData = { churchId: meeting.churchId, meetingId: meeting.id, agendaItemId: item.id, kind: meeting.kind, title: item.title, responsibleId: item.responsibleId, dueDate: item.dueDate, status: 'pending', createdAt: timestamp, updatedAt: timestamp }
    const envelope = await encryptPayload(masterKey, { schemaVersion: 1, type: 'commission_task', data }, id)
    await this.repository.saveEncrypted(accountId, currentDeviceId(accountId), id, envelope, 'commission_task')
    return { id, ...data }
  }

  async updateTaskStatus(accountId: string, masterKey: CryptoKey, taskId: string, status: TaskStatus): Promise<CommissionEntity<CommissionTaskData>> {
    const task = (await this.tasks(accountId, masterKey)).find((item) => item.id === taskId)
    if (!task) throw new Error('Pendência não encontrada.')
    const data: CommissionTaskData = { ...task, status, updatedAt: now() }
    const envelope = await encryptPayload(masterKey, { schemaVersion: 1, type: 'commission_task', data }, taskId)
    await this.repository.saveEncrypted(accountId, currentDeviceId(accountId), taskId, envelope, 'commission_task')
    return { id: taskId, ...data }
  }

  async addTaskToAgenda(accountId: string, masterKey: CryptoKey, taskId: string): Promise<CommissionEntity<CommissionTaskData>> {
    const task = (await this.tasks(accountId, masterKey)).find((item) => item.id === taskId)
    if (!task) throw new Error('Pendência não encontrada.')
    if (task.agendaEventId) return task
    const date = task.dueDate || localDateKey()
    const event = await this.agenda.createEvent(accountId, masterKey, {
      title: task.title, category: 'committee', churchId: task.churchId, location: '', address: '', visitTarget: 'none', sermonId: null, sermonSnapshot: null,
      startAt: `${date}T08:00`, endAt: `${date}T09:30`, allDay: false, reminderMinutes: 60, notes: 'Pendência de reunião da igreja.', includeInItinerary: true, mondayException: true,
    })
    const data: CommissionTaskData = { ...task, agendaEventId: event.id, updatedAt: now() }
    const envelope = await encryptPayload(masterKey, { schemaVersion: 1, type: 'commission_task', data }, task.id)
    await this.repository.saveEncrypted(accountId, currentDeviceId(accountId), task.id, envelope, 'commission_task')
    return { id: task.id, ...data }
  }

  /**
   * Pauta para imprimir.
   *
   * `includeNames` deixou de valer só para os nomes. O local da reunião, a
   * oração inicial, a reflexão, o título de cada assunto e a proposta são todos
   * texto escrito pelo pastor e pelo secretário, e é ali que aparecem as
   * pessoas: "conversar com a irmã Fulana sobre o afastamento". Antes esses
   * campos saíam sempre, e a pauta dizia "sem nomes" trazendo todos eles. Sem a
   * confirmação, restam a igreja, a data, os cargos e a ordem dos assuntos, e
   * cada texto omitido aparece marcado como tal.
   */
  agendaDocument(meeting: CommissionEntity<CommissionMeetingData>, churchName: string, personName: (id: string) => string = (id) => id, includeNames = false): string {
    const convidados = freeList(includeNames, meeting.guestNames)
    return [
      churchName,
      meeting.kind === 'board' ? 'Agenda da Comissão Diretiva' : 'Agenda da Reunião Administrativa',
      `Data: ${meeting.date} · Horário: ${meeting.time || 'a confirmar'} · Local: ${freeText(includeNames, meeting.location) || 'a confirmar'}`,
      `Presidente: ${meetingPresidentName(meeting, personName, includeNames)} · Secretário(a): ${personName(meeting.secretaryId)}`,
      `Participantes: ${meeting.participantIds.map(personName).join(', ') || 'A confirmar'}`,
      convidados.length ? `Convidados: ${convidados.join(', ')}` : '',
      meeting.openingPrayer ? `Oração: ${freeText(includeNames, meeting.openingPrayer)}` : '',
      meeting.reflection ? `Reflexão: ${freeText(includeNames, meeting.reflection)}` : '',
      ...[...meeting.agenda].sort((a, b) => a.order - b.order).map((item) => `${item.order}. ${freeText(includeNames, item.title)}${item.sourceVoteNumber ? ` (Origem: voto ${item.sourceVoteNumber})` : ''}\n${includeNames ? agendaText(item) : 'PROPÕE-SE texto não incluído.'}`),
    ].filter(Boolean).join('\n\n')
  }

  /** Ata da reunião, com a mesma regra da pauta. */
  minutesDocument(meeting: CommissionEntity<CommissionMeetingData>, churchName: string, quorum: number, personName: (id: string) => string = (id) => id, includeNames = false): string {
    const present = meeting.participantIds.length + meeting.votingGuestNames.length
    const convidados = freeList(includeNames, [...meeting.guestNames, ...meeting.votingGuestNames])
    return [
      churchName,
      meeting.kind === 'board' ? 'Ata da Comissão Diretiva' : 'Ata da Reunião Administrativa',
      `Data: ${meeting.date} · Horário: ${meeting.time || 'a confirmar'} · Local: ${freeText(includeNames, meeting.location) || 'a confirmar'}`,
      `Presidente: ${meetingPresidentName(meeting, personName, includeNames)} · Secretário(a): ${personName(meeting.secretaryId)}`,
      `Participantes: ${meeting.participantIds.map(personName).join(', ') || 'Nenhum informado'}`,
      convidados.length ? `Convidados: ${convidados.join(', ')}` : '',
      `Quórum: ${present} presentes com voto; mínimo ${quorum}. ${canDeliberate(present, quorum) ? 'Quórum confirmado.' : 'Sem quórum.'}`,
      meeting.openingPrayer ? `Oração: ${freeText(includeNames, meeting.openingPrayer)}` : '',
      meeting.reflection ? `Reflexão: ${freeText(includeNames, meeting.reflection)}` : '',
      // A decisão continua legível sem nomes: número do voto, contagem e
      // resultado. O que sai é o texto do que foi votado, que é livre.
      ...meeting.agenda.filter((item) => item.vote).map((item) => `${item.vote?.voteNumber ?? 'Decisão sem número'} · ${includeNames ? minutesText(item) : 'VOTADO texto não incluído.'}\nFavoráveis: ${item.vote?.favorable}; contrários: ${item.vote?.against}; abstenções: ${item.vote?.abstentions}. Resultado: ${item.vote?.result}.${item.vote?.presidentTieBreak ? `\n${tieBreakNote(item.vote.presidentTieBreak)}` : ''}`),
      meeting.notes ? `Observações: ${freeText(includeNames, meeting.notes)}` : '',
      `Assinaturas:\n${meetingPresidentName(meeting, personName, includeNames)} — Presidente\n${personName(meeting.secretaryId)} — Secretário(a)`,
    ].filter(Boolean).join('\n\n')
  }
}
