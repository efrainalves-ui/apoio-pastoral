import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { generateMasterKey } from '../crypto/vault'
import { ApoioDatabase } from '../db/database'
import { MissionaryService } from './service'

const databases: ApoioDatabase[] = []
afterEach(async () => { await Promise.all(databases.map(database => database.delete())); databases.length = 0 })
describe('interessados e estudos cifrados', () => {
  it('inicia automaticamente em andamento, conclui e não grava conteúdo aberto', async () => {
    const database = new ApoioDatabase(`missionary-${crypto.randomUUID()}`); databases.push(database)
    const service = new MissionaryService(database); const key = await generateMasterKey()
    const interest = await service.saveInterest('account-fixture', key, { churchId: 'church-fixture', name: 'Pessoa Fictícia', contact: '', notes: 'Acompanhamento fictício', status: 'waiting_study' })
    const study = await service.startStudy('account-fixture', key, interest, '2026-08-20T10:00:00.000Z')
    expect(study.status).toBe('in_progress')
    await service.completeStudy('account-fixture', key, study, interest, 'continue_interested', '')
    expect((await service.listStudies('account-fixture', key))[0]?.status).toBe('completed')
    expect((await service.listInterests('account-fixture', key))[0]?.status).toBe('study_finished')
    expect(JSON.stringify(await database.vaultRecords.toArray())).not.toContain('Pessoa Fictícia')
  })
  it('guarda dupla somente cifrada e exige dois membros', async () => {
    const database = new ApoioDatabase(`pair-${crypto.randomUUID()}`); databases.push(database); const service = new MissionaryService(database); const key = await generateMasterKey()
    await expect(service.savePair('account-fixture', key, 'church-fixture', ['member-a'])).rejects.toThrow('dois integrantes')
    await service.savePair('account-fixture', key, 'church-fixture', ['member-a', 'member-b'])
    expect(await service.listPairs('account-fixture', key)).toHaveLength(1)
    expect(JSON.stringify(await database.vaultRecords.toArray())).not.toContain('member-a')
  })
  it('mantém classe, PG e UAPG separados e cifrados', async () => {
    const database = new ApoioDatabase(`groups-${crypto.randomUUID()}`); databases.push(database); const service = new MissionaryService(database); const key = await generateMasterKey(); const base = { churchId: 'church-fixture' }
    await service.saveClass('account-fixture', key, { ...base, teacherId: 'teacher-fixture', assistantId: null, ageGroup: 'adults', participantIds: ['member-fixture'] })
    const group = await service.saveSmallGroup('account-fixture', key, { ...base, name: 'PG Fictício', leaderId: 'leader-fixture', associateId: null, host: 'Anfitrião Fictício', address: '', day: 'terça', time: '19:00', participantIds: [], active: true })
    await service.saveUapg('account-fixture', key, { ...base, name: 'UAPG Fictícia', smallGroupId: group.id, notes: '', active: true })
    expect(await service.listClasses('account-fixture', key)).toHaveLength(1); expect(await service.listSmallGroups('account-fixture', key)).toHaveLength(1); expect(await service.listUapgs('account-fixture', key)).toHaveLength(1)
    expect(JSON.stringify(await database.vaultRecords.toArray())).not.toContain('PG Fictício')
  })
  it('edita e remove os três cadastros sem trocar o identificador', async () => {
    const database = new ApoioDatabase(`missionary-edit-${crypto.randomUUID()}`); databases.push(database); const service = new MissionaryService(database); const key = await generateMasterKey(); const base = { churchId: 'church-fixture' }
    const sabbathClass = await service.saveClass('account-fixture', key, { ...base, teacherId: 'teacher-fixture', assistantId: 'assistant-fixture', ageGroup: 'adults', participantIds: ['member-fixture'] })
    const smallGroup = await service.saveSmallGroup('account-fixture', key, { ...base, name: 'PG Fictício', leaderId: 'leader-fixture', associateId: 'associate-fixture', host: 'Casa Fictícia', address: 'Rua Fictícia', day: 'terça', time: '19:00', participantIds: ['member-fixture'], active: true })
    const uapg = await service.saveUapg('account-fixture', key, { ...base, name: 'UAPG Fictícia', smallGroupId: smallGroup.id, notes: 'Vínculo fictício', active: true })

    await service.updateClass('account-fixture', key, sabbathClass.id, { ...base, teacherId: sabbathClass.teacherId, assistantId: sabbathClass.assistantId, ageGroup: 'young', participantIds: sabbathClass.participantIds })
    await service.updateSmallGroup('account-fixture', key, smallGroup.id, { ...base, name: 'PG Fictício Editado', leaderId: smallGroup.leaderId, associateId: smallGroup.associateId, host: smallGroup.host, address: smallGroup.address, day: 'quinta', time: smallGroup.time, participantIds: smallGroup.participantIds, active: smallGroup.active })
    await service.updateUapg('account-fixture', key, uapg.id, { ...base, name: 'UAPG Fictícia Editada', smallGroupId: uapg.smallGroupId, notes: 'Observação editada', active: uapg.active })

    expect((await service.listClasses('account-fixture', key))[0]).toMatchObject({ id: sabbathClass.id, teacherId: 'teacher-fixture', ageGroup: 'young' })
    expect((await service.listSmallGroups('account-fixture', key))[0]).toMatchObject({ id: smallGroup.id, leaderId: 'leader-fixture', name: 'PG Fictício Editado', day: 'quinta' })
    expect((await service.listUapgs('account-fixture', key))[0]).toMatchObject({ id: uapg.id, smallGroupId: smallGroup.id, name: 'UAPG Fictícia Editada' })

    await service.remove('account-fixture', key, sabbathClass.id); await service.remove('account-fixture', key, uapg.id); await service.remove('account-fixture', key, smallGroup.id)
    expect(await service.listClasses('account-fixture', key)).toHaveLength(0); expect(await service.listSmallGroups('account-fixture', key)).toHaveLength(0); expect(await service.listUapgs('account-fixture', key)).toHaveLength(0)
  })
})
