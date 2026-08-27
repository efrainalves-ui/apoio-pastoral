import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { ApoioDatabase } from '../db/database'
import { authorizeCurrentDevice } from './device'

const databases: ApoioDatabase[] = []
afterEach(async () => { localStorage.clear(); await Promise.all(databases.splice(0).map((database) => database.delete())) })

describe('autorização local de dispositivo', () => {
  it('não vincula o mesmo dispositivo a outra conta', async () => {
    const database = new ApoioDatabase(`device-owner-${crypto.randomUUID()}`); databases.push(database)
    await authorizeCurrentDevice('conta-ficticia-a', database)
    await expect(authorizeCurrentDevice('conta-ficticia-b', database)).rejects.toThrow('outra conta')
    expect((await database.devices.toCollection().first())?.accountId).toBe('conta-ficticia-a')
  })

  it('não reativa um dispositivo revogado durante novo acesso', async () => {
    const database = new ApoioDatabase(`device-revoked-${crypto.randomUUID()}`); databases.push(database)
    const device = await authorizeCurrentDevice('conta-ficticia-a', database)
    await database.devices.update(device.id, { status: 'revoked', revokedAt: '2026-08-01T00:00:00.000Z' })
    await expect(authorizeCurrentDevice('conta-ficticia-a', database)).rejects.toThrow('removido')
    expect((await database.devices.get(device.id))?.status).toBe('revoked')
  })
})
