import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApoioDatabase } from '../db/database'
import { assertRemoteDeviceStillActive, authorizeCurrentDevice, revokeDevice } from './device'

const servico = vi.hoisted(() => ({ revogados: [] as string[] }))

vi.mock('./supabase', async (importarOriginal) => ({
  ...await importarOriginal<Record<string, unknown>>(),
  ensureRemoteDevice: vi.fn(() => Promise.resolve()),
  revokeRemoteDevice: vi.fn((deviceId: string) => { servico.revogados.push(deviceId); return Promise.resolve() }),
}))

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

describe('autoridade do serviço sobre a revogação', () => {
  it('bloqueia e grava a revogação decidida em outro aparelho', async () => {
    const database = new ApoioDatabase(`device-remote-revoked-${crypto.randomUUID()}`); databases.push(database)
    const device = await authorizeCurrentDevice('conta-ficticia-a', database)

    await expect(assertRemoteDeviceStillActive('conta-ficticia-a', device.id, database, () => Promise.resolve('revoked')))
      .rejects.toThrow('removido')

    expect((await database.devices.get(device.id))?.status).toBe('revoked')
  })

  it('deixa passar o dispositivo que o serviço confirma ativo', async () => {
    const database = new ApoioDatabase(`device-remote-active-${crypto.randomUUID()}`); databases.push(database)
    const device = await authorizeCurrentDevice('conta-ficticia-a', database)

    await expect(assertRemoteDeviceStillActive('conta-ficticia-a', device.id, database, () => Promise.resolve('active')))
      .resolves.toBeUndefined()

    expect((await database.devices.get(device.id))?.status).toBe('active')
  })

  it('não interfere quando não há serviço remoto configurado', async () => {
    const database = new ApoioDatabase(`device-remote-local-${crypto.randomUUID()}`); databases.push(database)
    const device = await authorizeCurrentDevice('conta-ficticia-a', database)

    await expect(assertRemoteDeviceStillActive('conta-ficticia-a', device.id, database, () => Promise.resolve(null)))
      .resolves.toBeUndefined()

    expect((await database.devices.get(device.id))?.status).toBe('active')
  })
})

describe('revogação de outro aparelho', () => {
  it('revoga no serviço mesmo sem registro local do aparelho', async () => {
    // Quem revoga quase nunca tem o registro local do revogado: cada aparelho
    // guarda apenas a si mesmo. Exigir o registro local tornava a revogação
    // impossível justamente no caso que importa.
    const database = new ApoioDatabase(`device-revoke-remote-${crypto.randomUUID()}`); databases.push(database)
    servico.revogados.length = 0
    await authorizeCurrentDevice('conta-ficticia-a', database)

    await expect(revokeDevice('aparelho-de-outro-lugar', database)).resolves.toBeUndefined()

    expect(servico.revogados).toEqual(['aparelho-de-outro-lugar'])
  })

  it('marca também o registro local quando ele existe', async () => {
    const database = new ApoioDatabase(`device-revoke-local-${crypto.randomUUID()}`); databases.push(database)
    servico.revogados.length = 0
    const device = await authorizeCurrentDevice('conta-ficticia-a', database)

    await revokeDevice(device.id, database)

    expect((await database.devices.get(device.id))?.status).toBe('revoked')
    expect(servico.revogados).toEqual([device.id])
  })
})
