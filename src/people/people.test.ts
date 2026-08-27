import { afterEach, describe, expect, it } from 'vitest'
import { generateMasterKey } from '../crypto/vault'
import { ApoioDatabase } from '../db/database'
import { FamilyService } from '../families/service'
import { emptyFamilyInput } from '../families/types'
import { calculateAge, upcomingBirthdays } from './dates'
import { PeopleService } from './service'
import { emptyPersonInput } from './types'

describe('pessoas, vínculos, famílias e aniversários', () => {
  const databases: ApoioDatabase[] = []
  afterEach(async () => Promise.all(databases.map((database) => database.delete())))

  async function fixture() {
    const database = new ApoioDatabase(`people-test-${crypto.randomUUID()}`); databases.push(database)
    const masterKey = await generateMasterKey(); const accountId = crypto.randomUUID()
    return { database, masterKey, accountId, people: new PeopleService(database), families: new FamilyService(database) }
  }

  it('calcula idade e próximos aniversários sem persistir índice aberto', async () => {
    expect(calculateAge('2000-08-21', new Date('2026-08-20T12:00:00'))).toBe(25)
    const { people, masterKey, accountId } = await fixture()
    const person = await people.createPerson(accountId, masterKey, { ...emptyPersonInput(), name: 'Pessoa Aurora Fictícia', birthDate: '2000-08-21', currentChurchId: 'church-a' })
    expect(upcomingBirthdays([person], new Date('2026-08-20T12:00:00'), 2)[0]).toMatchObject({ daysUntil: 1, turningAge: 26 })
  })

  it('preserva histórico de mudança de igreja e não grava dados pessoais em plaintext', async () => {
    const { database, people, masterKey, accountId } = await fixture()
    const person = await people.createPerson(accountId, masterKey, { ...emptyPersonInput(), name: 'Pessoa Horizonte Fictícia', birthDate: '1990-05-10', whatsapp: '(61) 99999-0000', currentChurchId: 'church-a' })
    const changed = await people.updatePerson(accountId, masterKey, person.id, { ...person, birthDate: person.birthDate!, whatsapp: person.whatsapp, currentChurchId: 'church-b' })
    expect(changed.memberships).toHaveLength(2)
    expect(changed.history.some(({ event }) => event === 'church_changed')).toBe(true)
    const persisted = JSON.stringify({ records: await database.vaultRecords.toArray(), outbox: await database.outbox.toArray() })
    expect(persisted).not.toContain('Pessoa Horizonte')
    expect(persisted).not.toContain('61999990000')
  })

  it('forma família entre igrejas e evita integrante duplicado em outra família', async () => {
    const { families, people, masterKey, accountId } = await fixture()
    const first = await people.createPerson(accountId, masterKey, { ...emptyPersonInput(), name: 'Pessoa Um Fictícia', currentChurchId: 'church-a' })
    const second = await people.createPerson(accountId, masterKey, { ...emptyPersonInput(), name: 'Pessoa Dois Fictícia', currentChurchId: 'church-b' })
    const family = await families.createFamily(accountId, masterKey, { ...emptyFamilyInput(), name: 'Família Modelo Fictícia', primaryChurchId: 'church-a', memberIds: [first.id, second.id] })
    expect(family.memberIds).toEqual([first.id, second.id])
    await expect(families.createFamily(accountId, masterKey, { ...emptyFamilyInput(), name: 'Outra Família Fictícia', primaryChurchId: 'church-b', memberIds: [first.id] })).rejects.toThrow('já pertence')
    await expect(people.deletePerson(accountId, masterKey, first.id)).rejects.toThrow('Remova a pessoa da família')
  })
})
