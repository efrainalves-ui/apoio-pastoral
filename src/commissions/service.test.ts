import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { generateMasterKey } from '../crypto/vault'
import { DistrictService } from '../district/service'
import { emptyChurchInput } from '../district/types'
import { ApoioDatabase } from '../db/database'
import { canDeliberate, requiredMajority, voteResult } from './core'
import { CommissionService } from './service'
import type { CommissionAgendaItem, CommissionMeetingData } from './types'

const databases: ApoioDatabase[] = []
afterEach(async () => { await Promise.all(databases.splice(0).map((database) => database.delete())) })

const agendaItem = (id: string, proposal: string, destination: CommissionAgendaItem['destination'] = 'internal'): CommissionAgendaItem => ({
  id, order: Number(id.slice(-1)) || 1, title: `Assunto fictício ${id}`, department: 'Secretaria', description: 'Descrição inventada.', proposal,
  decisionType: 'approve', customDecisionType: '', destination, responsibleId: 'person-1', dueDate: '2026-09-10', privateNotes: '',
})

const meetingData = (churchId: string, kind: CommissionMeetingData['kind'], agenda: CommissionAgendaItem[]): CommissionMeetingData => ({
  churchId, kind, date: '2026-09-01', time: '19:00', location: 'Sala fictícia', presidentId: 'person-1', secretaryId: 'person-2',
  participantIds: ['person-1', 'person-2', 'person-3'], guestNames: ['Convidado Fictício'], votingGuestNames: [], openingPrayer: 'Pessoa Fictícia 1',
  reflection: 'Reflexão fictícia', notes: '', agenda, createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
})

describe('regras de votação das comissões', () => {
  it('calcula 50% + 1 somente sobre votos válidos e ignora abstenções', () => {
    expect(requiredMajority(2, 1)).toBe(2)
    expect(voteResult(2, 1, 8, true)).toBe('approved')
    expect(voteResult(1, 2, 0, true)).toBe('rejected')
    expect(voteResult(3, 0, 0, false)).toBe('deferred')
    expect(canDeliberate(3, 3)).toBe(true)
  })
})

describe('fluxo persistente de Comissão Diretiva e Reunião Administrativa', () => {
  it('numera, vota, encaminha, cria pendência, agenda e protege a ata finalizada', async () => {
    const database = new ApoioDatabase(`commissions-${crypto.randomUUID()}`); databases.push(database)
    const service = new CommissionService(database); const key = await generateMasterKey(); const accountId = 'account-fixture'; const churchId = 'church-fixture'
    await service.saveConfig(accountId, key, { churchId, year: 2026, boardMemberIds: ['person-1', 'person-2', 'person-3'], boardPresidentId: 'person-1', secretaryId: 'person-2', boardQuorum: 3, administrativeQuorum: 3, nextBoardVote: 1, nextAdministrativeVote: 1 })
    const board = await service.saveMeeting(accountId, key, meetingData(churchId, 'board', [agendaItem('item-1', 'aprovar ação fictícia', 'administrative'), agendaItem('item-2', 'rejeitar ação fictícia'), agendaItem('item-3', 'registrar acompanhamento')]))

    const approved = await service.confirmVote(accountId, key, board.id, 'item-1', 2, 1, 0)
    expect(approved.agenda[0]?.vote).toMatchObject({ result: 'approved', voteNumber: '2026-001' })
    const rejected = await service.confirmVote(accountId, key, board.id, 'item-2', 1, 2, 0)
    expect(rejected.agenda[1]?.vote).toMatchObject({ result: 'rejected' })
    expect(rejected.agenda[1]?.vote?.voteNumber).toBeUndefined()

    const administrative = await service.forwardToAdministrative(accountId, key, board.id, 'item-1')
    expect(administrative.kind).toBe('administrative')
    expect(administrative.agenda[0]).toMatchObject({ sourceMeetingId: board.id, sourceVoteNumber: '2026-001' })
    expect(administrative.agenda[0]?.vote).toBeUndefined()
    expect((await service.forwardToAdministrative(accountId, key, board.id, 'item-1')).id).toBe(administrative.id)
    administrative.participantIds = ['person-1', 'person-2', 'person-3']
    await service.saveMeeting(accountId, key, administrative, administrative.id)
    const adminVoted = await service.confirmVote(accountId, key, administrative.id, administrative.agenda[0]!.id, 2, 1, 0)
    expect(adminVoted.agenda[0]?.vote).toMatchObject({ result: 'approved', voteNumber: '2026-001' })

    const task = await service.createTask(accountId, key, approved, approved.agenda[0]!)
    expect((await service.tasks(accountId, key, board.id))[0]).toMatchObject({ id: task.id, status: 'pending' })
    await service.updateTaskStatus(accountId, key, task.id, 'completed')
    const scheduled = await service.addTaskToAgenda(accountId, key, task.id)
    expect(scheduled.agendaEventId).toBeTruthy()
    expect((await database.vaultRecords.where('recordType').equals('agenda_event').count())).toBe(1)

    const agenda = service.agendaDocument(adminVoted, 'Igreja Fictícia')
    const minutes = service.minutesDocument(adminVoted, 'Igreja Fictícia', 3)
    expect(agenda).toContain('PROPÕE-SE')
    expect(agenda).toContain('Origem: voto 2026-001')
    expect(minutes).toContain('VOTADO')
    expect(minutes).toContain('Quórum confirmado')

    const finalized = await service.finalizeMeeting(accountId, key, adminVoted.id)
    expect(finalized.finalizedAt).toBeTruthy()
    await expect(service.saveMeeting(accountId, key, { ...finalized, location: 'Outro local' }, finalized.id)).rejects.toThrow('protegida')
  })

  it('bloqueia decisão sem quórum e não consome a numeração', async () => {
    const database = new ApoioDatabase(`commissions-quorum-${crypto.randomUUID()}`); databases.push(database)
    const service = new CommissionService(database); const key = await generateMasterKey(); const accountId = 'account-fixture'; const churchId = 'church-fixture'
    await service.saveConfig(accountId, key, { churchId, year: 2026, boardMemberIds: [], boardPresidentId: 'person-1', secretaryId: 'person-2', boardQuorum: 4, administrativeQuorum: 4, nextBoardVote: 1, nextAdministrativeVote: 1 })
    const board = await service.saveMeeting(accountId, key, { ...meetingData(churchId, 'board', [agendaItem('item-1', 'aprovar ação fictícia')]), participantIds: ['person-1', 'person-2', 'person-3'] })
    await expect(service.confirmVote(accountId, key, board.id, 'item-1', 3, 0, 0)).rejects.toThrow('Não há quórum')
    expect((await service.config(accountId, key, churchId))?.nextBoardVote).toBe(1)
    expect((await service.meeting(accountId, key, board.id))?.agenda[0]?.vote).toBeUndefined()
  })
})

describe('presidência da comissão', () => {
  async function comIgreja(tipo: 'organized_church' | 'group') {
    const database = new ApoioDatabase(`commissions-president-${crypto.randomUUID()}`); databases.push(database)
    const service = new CommissionService(database); const districts = new DistrictService(database)
    const key = await generateMasterKey(); const accountId = 'account-fixture'
    const district = await districts.createDistrict(accountId, key, 'Distrito Fictício')
    const church = await districts.createChurch(accountId, key, district.id, { ...emptyChurchInput(), name: 'Igreja Fictícia', type: tipo })
    return { service, key, accountId, churchId: church.id }
  }

  const base = (churchId: string) => ({ churchId, year: 2026, boardMemberIds: ['person-1'], boardPresidentId: '', secretaryId: 'person-2', boardQuorum: 2, administrativeQuorum: 2, nextBoardVote: 1, nextAdministrativeVote: 1 })

  it('guarda a configuração com o pastor presidindo, sem exigir nenhum membro', async () => {
    const { service, key, accountId, churchId } = await comIgreja('organized_church')
    const saved = await service.saveConfig(accountId, key, base(churchId))
    expect(saved.boardPresidentId).toBe('')
  })

  it('aceita um ancião registrado em igreja organizada', async () => {
    const { service, key, accountId, churchId } = await comIgreja('organized_church')
    const saved = await service.saveConfig(accountId, key, { ...base(churchId), presidentMode: 'elder', boardPresidentId: 'person-1', elderIds: ['person-1'] })
    expect(saved).toMatchObject({ presidentMode: 'elder', boardPresidentId: 'person-1' })
  })

  it('recusa ancião presidindo fora de igreja organizada', async () => {
    const { service, key, accountId, churchId } = await comIgreja('group')
    await expect(service.saveConfig(accountId, key, { ...base(churchId), presidentMode: 'elder', boardPresidentId: 'person-1', elderIds: ['person-1'] })).rejects.toThrow('igreja organizada')
  })

  // Não basta ser membro: quem preside precisa estar marcado como ancião.
  it('recusa um membro que não está registrado como ancião', async () => {
    const { service, key, accountId, churchId } = await comIgreja('organized_church')
    await expect(service.saveConfig(accountId, key, { ...base(churchId), presidentMode: 'elder', boardPresidentId: 'person-3', elderIds: ['person-1'] })).rejects.toThrow('ancião registrado')
  })

  it('assina a ata com o nome do pastor quando é ele quem preside', async () => {
    const { service, key, accountId, churchId } = await comIgreja('organized_church')
    await service.saveConfig(accountId, key, base(churchId))
    const meeting = await service.saveMeeting(accountId, key, { ...meetingData(churchId, 'board', [agendaItem('item-1', 'aprovar ação fictícia')]), presidentId: '', presidentLabel: 'Pastor Fictício' })
    const ata = service.minutesDocument(meeting, 'Igreja Fictícia', 2, (id) => `Pessoa ${id}`)

    expect(ata).toContain('Presidente: Pastor Fictício')
    expect(ata).toContain('Pastor Fictício — Presidente')
  })
})
