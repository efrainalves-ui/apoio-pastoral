import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { decryptPayload, generateMasterKey } from '../crypto/vault'
import { ApoioDatabase } from '../db/database'
import { AgendaService, findAgendaConflicts, mondayRestItems, validateAgendaEvent } from './service'
import { buildItineraryPdf, itineraryItems } from './itineraryPdf'
import { AGENDA_CATEGORY_LABELS, CEREMONY_CATEGORIES, CEREMONY_CHECKLISTS, categoryDefaults, emptyCeremonyDetails, type AgendaEventInput } from './types'

const databases: ApoioDatabase[] = []
const input = (overrides: Partial<AgendaEventInput> = {}): AgendaEventInput => ({ title: 'Visita à família fictícia', category: 'visit', churchId: null, location: 'Local fictício', address: 'Endereço fictício', visitTarget: 'family', sermonId: null, sermonSnapshot: null, startAt: '2026-08-18T14:00', endAt: '2026-08-18T15:00', allDay: false, reminderMinutes: 15, notes: '', includeInItinerary: true, mondayException: false, ...overrides })
afterEach(async () => { await Promise.all(databases.map((database) => database.delete())); databases.length = 0 })

describe('agenda cifrada', () => {
  it('cria, edita e remove sem plaintext no banco', async () => {
    const database = new ApoioDatabase(`agenda-${crypto.randomUUID()}`); databases.push(database); const service = new AgendaService(database); const key = await generateMasterKey()
    const created = await service.createEvent('account-fixture', key, input())
    const raw = await database.vaultRecords.get(created.id)
    expect(JSON.stringify(raw)).not.toContain('família fictícia')
    expect((await decryptPayload(key, raw!)).type).toBe('agenda_event')
    await service.updateEvent('account-fixture', key, created.id, input({ title: 'Reunião fictícia', category: 'meeting' }))
    expect((await service.getEvent('account-fixture', key, created.id))?.title).toBe('Reunião fictícia')
    await service.deleteEvent('account-fixture', key, created.id)
    expect(await service.getEvent('account-fixture', key, created.id)).toBeNull()
  })

  it('preserva o retrato do sermão no compromisso de pregação', async () => {
    const database = new ApoioDatabase(`agenda-sermon-${crypto.randomUUID()}`); databases.push(database); const service = new AgendaService(database); const key = await generateMasterKey()
    const event = await service.createEvent('account-fixture', key, input({ category: 'preaching', sermonId: 'sermon-fixture', sermonSnapshot: { id: 'sermon-fixture', title: 'Sermão fictício', theme: 'Esperança', mainText: 'João 3:16' } }))
    expect((await service.getEvent('account-fixture', key, event.id))?.sermonSnapshot?.title).toBe('Sermão fictício')
  })

  it('bloqueia uma gravação que sobrepõe outro compromisso', async () => {
    const database = new ApoioDatabase(`agenda-${crypto.randomUUID()}`); databases.push(database); const service = new AgendaService(database); const key = await generateMasterKey()
    await service.createEvent('account-fixture', key, input())
    await expect(service.createEvent('account-fixture', key, input({ title: 'Outro compromisso fictício', startAt: '2026-08-18T14:30', endAt: '2026-08-18T15:30' }))).rejects.toThrow('sobreposição')
  })

  it('valida segunda-feira, sobreposição e intervalo menor que cinco minutos', () => {
    // A folga de segunda-feira avisa, mas não impede o registro.
    expect(() => validateAgendaEvent(input({ startAt: '2026-08-17T14:00', endAt: '2026-08-17T15:00' }))).not.toThrow()
    expect(findAgendaConflicts(input({ startAt: '2026-08-17T14:00', endAt: '2026-08-17T15:00' }), []).map(({ kind }) => kind)).toContain('monday_rest')
    const existing = [{ id: 'event-fixture', ...input(), createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-01T00:00:00Z' }]
    expect(findAgendaConflicts(input({ startAt: '2026-08-18T14:30', endAt: '2026-08-18T15:30' }), existing)[0]?.kind).toBe('overlap')
    expect(findAgendaConflicts(input({ startAt: '2026-08-18T15:03', endAt: '2026-08-18T16:00' }), existing)[0]?.kind).toBe('short_interval')
  })

  it('aplica padrões e inclui folgas no PDF sem selecionar pessoal por padrão', () => {
    expect(categoryDefaults('visit', new Date('2026-08-18T12:00:00Z')).reminderMinutes).toBe(15)
    expect(categoryDefaults('council', new Date('2026-08-18T12:00:00Z')).allDay).toBe(true)
    expect(mondayRestItems(new Date('2026-08-17T00:00:00'), new Date('2026-08-23T23:59:59'))).toHaveLength(1)
    const timestamps = { createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-01T00:00:00Z' }
    const events = [{ id: 'public-fixture', ...input(), ...timestamps }, { id: 'private-fixture', ...input({ title: 'Pessoal fictício', category: 'personal', includeInItinerary: false }), ...timestamps }]
    const items = itineraryItems(events, new Date('2026-08-17'), new Date('2026-08-23T23:59:59'), new Set(events.map(({ id }) => id)), () => 'Igreja fictícia')
    expect(items.some(({ id }) => id === 'public-fixture')).toBe(true); expect(items.some(({ id }) => id === 'private-fixture')).toBe(false)
    // Sem a confirmação de nomes, o itinerário sai com data, tipo e igreja. O
    // título, o local e o endereço são escritos pelo pastor — "casa da irmã
    // Fulana", a rua de uma família — e saíam sempre, mesmo com a caixa
    // desmarcada.
    const semNomes = new TextDecoder('latin1').decode(buildItineraryPdf(items, 'Semana fictícia'))
    expect(semNomes).toContain('%PDF-1.4')
    expect(semNomes).toContain('Igreja fictícia')
    expect(semNomes).not.toContain('Local fictício')
    expect(semNomes).not.toContain('Endereço fictício')
    expect(semNomes).not.toContain('Visita à família fictícia')

    const comNomes = new TextDecoder('latin1').decode(buildItineraryPdf(items, 'Semana fictícia', true))
    expect(comNomes).toContain('Local fictício')
    expect(comNomes).toContain('Endereço fictício')
    expect(comNomes).toContain('Visita à família fictícia')
  })

  it('cria os quatro tipos de cerimônia e preserva seus checklists', async () => {
    const database = new ApoioDatabase(`agenda-ceremonies-${crypto.randomUUID()}`); databases.push(database); const service = new AgendaService(database); const key = await generateMasterKey()
    for (const [index, category] of CEREMONY_CATEGORIES.entries()) {
      const details = emptyCeremonyDetails(category); details.responsible = 'Responsável Fictício'
      details.checklist[CEREMONY_CHECKLISTS[category][0]!.id] = true
      if (category === 'baptism' || category === 'wedding') details.involvedPersonIds = [`person-${category}`]
      if (category === 'child_dedication') { details.childPersonId = 'child-fixture'; details.parentPersonIds = ['parent-fixture'] }
      const hour = 8 + index * 2
      await service.createEvent('account-fixture', key, input({ title: `${AGENDA_CATEGORY_LABELS[category]} fictício`, category, churchId: 'church-fixture', startAt: `2026-08-19T${String(hour).padStart(2, '0')}:00`, endAt: `2026-08-19T${String(hour + 1).padStart(2, '0')}:00`, ceremonyDetails: details }))
    }
    const ceremonies = await service.listEvents('account-fixture', key)
    expect(ceremonies).toHaveLength(4)
    for (const category of CEREMONY_CATEGORIES) {
      const ceremony = ceremonies.find((event) => event.category === category)
      expect(ceremony?.ceremonyDetails?.responsible).toBe('Responsável Fictício')
      expect(ceremony?.ceremonyDetails?.checklist[CEREMONY_CHECKLISTS[category][0]!.id]).toBe(true)
    }
  })
})
