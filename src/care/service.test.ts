import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { generateMasterKey } from '../crypto/vault'
import { ApoioDatabase } from '../db/database'
import { PeopleService } from '../people/service'
import { peopleForPrayerChurch } from './prayer'
import { OFFICIAL_QUESTIONS, questionSnapshot } from './questionnaire'
import { CareService } from './service'
import type { VisitCompletionInput } from './types'

const databases: ApoioDatabase[] = []
afterEach(async () => { await Promise.all(databases.map((database) => database.delete())); databases.length = 0 })
function input(overrides: Partial<VisitCompletionInput> = {}): VisitCompletionInput { const question = questionSnapshot('COM-01')!; return { targetType: 'family', targetId: 'family-fixture', churchId: 'church-fixture', scheduledEventId: null, mode: 'full', participants: [{ id: 'participant-fixture', kind: 'person', personId: 'person-fixture', present: true }], reason: 'routine', startAt: '2026-08-18T14:00', endAt: '2026-08-18T15:00', notes: 'Resumo inteiramente fictício', answers: [{ id: 'answer-fixture', question, subjectId: 'person-fixture', value: 'Sim', skipped: false }], prayerText: 'Pedido inteiramente fictício', prayerReviewAt: '2027-02-14', followUp: { kind: 'call', dueAt: '2026-08-20', notes: 'Nota fictícia' }, task: { title: 'Tarefa fictícia', description: '', dueAt: '2026-08-21', priority: 'normal' }, incomeAnswers: [], roundId: null, ...overrides } }

describe('cuidado pastoral cifrado', () => {
  it('finaliza visita, pedido, acompanhamento e tarefa em ciphertext', async () => {
    const database = new ApoioDatabase(`care-${crypto.randomUUID()}`); databases.push(database); const key = await generateMasterKey(); const service = new CareService(database)
    const visit = await service.completeVisit('account-fixture', key, input())
    expect(visit.currentVersion).toBe(1); expect(await service.listPrayerRequests('account-fixture', key)).toHaveLength(1); expect(await service.listFollowUps('account-fixture', key)).toHaveLength(1); expect(await service.listTasks('account-fixture', key)).toHaveLength(1)
    const raw = await database.vaultRecords.toArray(); const outbox = await database.outbox.toArray(); expect(JSON.stringify({ raw, outbox })).not.toContain('Pedido inteiramente fictício'); expect(raw.every(({ ciphertext }) => Boolean(ciphertext))).toBe(true); expect(outbox.every(({ payload }) => Boolean(payload.ciphertext))).toBe(true)
  })

  it('preserva o vínculo de uma visita concluída com o compromisso agendado', async () => {
    const database = new ApoioDatabase(`care-agenda-${crypto.randomUUID()}`); databases.push(database); const key = await generateMasterKey(); const service = new CareService(database)
    const visit = await service.completeVisit('account-fixture', key, input({ scheduledEventId: 'agenda-visit-fixture', prayerText: '', followUp: null, task: null }))
    expect((await service.getVisit('account-fixture', key, visit.id))?.scheduledEventId).toBe('agenda-visit-fixture')
  })

  it('preserva pergunta e resposta antigas ao corrigir uma visita', async () => {
    const database = new ApoioDatabase(`care-version-${crypto.randomUUID()}`); databases.push(database); const key = await generateMasterKey(); const service = new CareService(database); const visit = await service.completeVisit('account-fixture', key, input({ prayerText: '', followUp: null, task: null })); const original = visit.versions[0]!
    const corrected = await service.correctVisit('account-fixture', key, visit.id, { correctionNote: 'Correção fictícia', participants: original.participants, reason: original.reason, startAt: original.startAt, endAt: original.endAt, notes: 'Versão corrigida fictícia', answers: original.answers.map((answer) => ({ ...answer, value: 'Não' })) })
    expect(corrected.versions).toHaveLength(2); expect(corrected.versions[0]!.answers[0]!.value).toBe('Sim'); expect(corrected.versions[1]!.answers[0]!.value).toBe('Não'); expect(corrected.versions[0]!.answers[0]!.question.text).toBe(original.answers[0]!.question.text)
  })

  it('atualiza renda somente por resposta explícita e conclui rodada ao visitar todas as famílias', async () => {
    const database = new ApoioDatabase(`care-round-${crypto.randomUUID()}`); databases.push(database); const key = await generateMasterKey(); const people = new PeopleService(database); const service = new CareService(database); const person = await people.createPerson('account-fixture', key, { name: 'Pessoa Fictícia', birthDate: '', whatsapp: '', notes: '', pastoralStatus: 'active', currentChurchId: 'church-fixture' }); const round = await service.createRound('account-fixture', key, 'Rodada fictícia', null, ['family-fixture'])
    await service.completeVisit('account-fixture', key, input({ participants: [{ id: 'participant-fixture', kind: 'person', personId: person.id, present: true }], incomeAnswers: [{ personId: person.id, status: 'no_income' }], roundId: round.id, prayerText: '', followUp: null, task: null }))
    expect((await people.getPerson('account-fixture', key, person.id))?.incomeStatus).toBe('no_income'); expect((await service.listRounds('account-fixture', key))[0]?.status).toBe('completed')
  })

  it('contém o instrumento oficial completo e não cria registro parcial em entrada inválida', async () => {
    expect(OFFICIAL_QUESTIONS).toHaveLength(38); expect(new Set(OFFICIAL_QUESTIONS.map(({ code }) => code)).size).toBe(38)
    const database = new ApoioDatabase(`care-invalid-${crypto.randomUUID()}`); databases.push(database); const key = await generateMasterKey(); const service = new CareService(database)
    await expect(service.completeVisit('account-fixture', key, input({ participants: [] }))).rejects.toThrow('presente'); expect(await database.vaultRecords.count()).toBe(0)
  })

  it('registra pedidos vinculados e sem identificação, com situação e histórico protegidos', async () => {
    const database = new ApoioDatabase(`care-prayer-${crypto.randomUUID()}`); databases.push(database); const key = await generateMasterKey(); const people = new PeopleService(database); const service = new CareService(database)
    const linkedPerson = await people.createPerson('account-fixture', key, { name: 'Pessoa Alfa Fictícia', birthDate: '', whatsapp: '', notes: '', pastoralStatus: 'active', currentChurchId: 'church-alpha' })
    const otherPerson = await people.createPerson('account-fixture', key, { name: 'Pessoa Beta Fictícia', birthDate: '', whatsapp: '', notes: '', pastoralStatus: 'active', currentChurchId: 'church-beta' })
    expect(peopleForPrayerChurch([linkedPerson, otherPerson], 'church-alpha', 'alfa')).toEqual([linkedPerson])
    expect(peopleForPrayerChurch([linkedPerson, otherPerson], 'church-alpha', 'beta')).toEqual([])

    const linked = await service.savePrayerRequest('account-fixture', key, { churchId: 'church-alpha', personId: linkedPerson.id, anonymous: false, subject: 'Motivo fictício reservado', description: 'Descrição fictícia', requestedAt: '2026-08-20', privateNotes: 'Nota fictícia privada' })
    const anonymous = await service.savePrayerRequest('account-fixture', key, { churchId: 'church-beta', personId: otherPerson.id, anonymous: true, subject: 'Pedido fictício sem identificação', description: '', requestedAt: '2026-08-21', privateNotes: '' })
    expect(linked.subjectId).toBe(linkedPerson.id)
    expect(anonymous.subjectType).toBe('anonymous'); expect(anonymous.subjectId).toBeNull()

    await service.updatePrayer('account-fixture', key, linked, 'answered')
    const answered = (await service.listPrayerRequests('account-fixture', key)).find(({ id }) => id === linked.id)!
    await service.addPrayerUpdate('account-fixture', key, answered, 'Atualização fictícia curta')
    const updated = (await service.listPrayerRequests('account-fixture', key)).find(({ id }) => id === linked.id)!
    expect(updated.status).toBe('answered'); expect(updated.updates.map(({ text }) => text)).toEqual(['Atualização fictícia curta'])
    expect(JSON.stringify(await database.vaultRecords.toArray())).not.toContain('Motivo fictício reservado')
  })
})
