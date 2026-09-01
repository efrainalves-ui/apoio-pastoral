import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPasswordEnvelope, decryptPayload, encryptPayload, generateMasterKey } from '../crypto/vault'
import { ApoioDatabase } from '../db/database'
import { keyEnvelopeId } from '../db/types'

const databases: ApoioDatabase[] = []

afterEach(async () => {
  localStorage.clear()
  await Promise.all(databases.splice(0).map((database) => database.delete()))
  vi.doUnmock('./supabase')
  vi.resetModules()
})

async function loadRemoteSession(passwordEnvelope: Awaited<ReturnType<typeof createPasswordEnvelope>>) {
  const remote = {
    envelope: passwordEnvelope,
    existeEnvelope: true,
    guardados: [] as unknown[],
    signIn: vi.fn(() => Promise.resolve('00000000-0000-4000-8000-000000000001')),
    authorize: vi.fn(() => Promise.resolve()),
  }
  vi.doMock('./supabase', () => ({
    hasSupabaseConfiguration: true,
    signInRemoteAccount: remote.signIn,
    fetchRemotePasswordEnvelope: vi.fn(() => Promise.resolve(remote.envelope)),
    ensureRemoteDevice: remote.authorize,
    registerRemoteAccount: vi.fn(),
    hasRemotePasswordEnvelope: vi.fn(() => Promise.resolve(remote.existeEnvelope)),
    storeRemotePasswordEnvelope: vi.fn((envelope: unknown) => { remote.guardados.push(envelope); return Promise.resolve() }),
    storeRemoteRecoveryEnvelope: vi.fn(),
    fetchRemoteRecoveryEnvelope: vi.fn(),
    updateRemotePassword: vi.fn(),
    fetchRemoteDeviceStatus: vi.fn(),
    revokeRemoteDevice: vi.fn(),
  }))
  return { remote, session: await import('./vaultSession') }
}

describe('entrada remota em novo dispositivo', () => {
  it('abre o cofre com e-mail e senha e registra uma instalação nova', async () => {
    const password = 'senha-ficticia-segura-2026'
    const masterKey = await generateMasterKey()
    const envelope = await createPasswordEnvelope(masterKey, password)
    const { remote, session } = await loadRemoteSession(envelope)
    const database = new ApoioDatabase(`remote-session-${crypto.randomUUID()}`)
    databases.push(database)

    const result = await session.unlockAccount('conta.ficticia@example.invalid', password, database)
    const payload = await decryptPayload(result.masterKey, await encryptPayload(masterKey, { schemaVersion: 1, type: 'test', data: { fictional: true } }, '00000000-0000-4000-8000-000000000011'))

    expect(result.account).toMatchObject({ id: '00000000-0000-4000-8000-000000000001', authMode: 'supabase' })
    expect(payload).toMatchObject({ type: 'test', data: { fictional: true } })
    expect(await database.keyEnvelopes.get(keyEnvelopeId(result.account.id, 'password'))).toMatchObject({ accountId: result.account.id, envelope })
    expect(remote.signIn).toHaveBeenCalledTimes(1)
    expect(remote.authorize).toHaveBeenCalledTimes(1)
  })

  it('deixa a instalação nova aguardando confirmação antes de sincronizar', async () => {
    // A senha abre o cofre, mas liberar a sincronização ainda depende do aval
    // de um aparelho que já estava valendo.
    const password = 'senha-ficticia-segura-2026'
    const masterKey = await generateMasterKey()
    const envelope = await createPasswordEnvelope(masterKey, password)
    const { remote, session } = await loadRemoteSession(envelope)
    const database = new ApoioDatabase(`remote-pending-${crypto.randomUUID()}`)
    databases.push(database)

    await session.unlockAccount('conta.ficticia@example.invalid', password, database)

    const dispositivo = await database.devices.toCollection().first()
    expect(dispositivo?.status).toBe('pending')
    expect(remote.authorize).toHaveBeenCalledWith(dispositivo?.id, expect.any(String), 'pending')
  })

  it('prepara o envelope remoto a partir de um aparelho que ainda entra', async () => {
    // Conta criada antes do envelope remoto: sem esta recuperação, entrar em um
    // navegador novo exigiria a chave de recuperação para sempre.
    const password = 'senha-ficticia-segura-2026'
    const masterKey = await generateMasterKey()
    const envelope = await createPasswordEnvelope(masterKey, password)
    const { remote, session } = await loadRemoteSession(envelope)
    remote.existeEnvelope = false
    const database = new ApoioDatabase(`remote-backfill-${crypto.randomUUID()}`)
    databases.push(database)

    // primeiro acesso cria a conta local, como num aparelho já conectado
    await session.unlockAccount('conta.ficticia@example.invalid', password, database)
    remote.guardados.length = 0

    // segundo acesso, já com conta local: é aqui que o envelope é preenchido
    await session.unlockAccount('conta.ficticia@example.invalid', password, database)

    expect(remote.guardados).toHaveLength(1)
    expect(remote.guardados[0]).toMatchObject({ kind: 'password' })
  })

  it('não regrava o envelope quando o serviço já tem um', async () => {
    const password = 'senha-ficticia-segura-2026'
    const masterKey = await generateMasterKey()
    const envelope = await createPasswordEnvelope(masterKey, password)
    const { remote, session } = await loadRemoteSession(envelope)
    const database = new ApoioDatabase(`remote-sem-regravar-${crypto.randomUUID()}`)
    databases.push(database)

    await session.unlockAccount('conta.ficticia@example.invalid', password, database)
    remote.guardados.length = 0
    await session.unlockAccount('conta.ficticia@example.invalid', password, database)

    expect(remote.guardados).toHaveLength(0)
  })
})
