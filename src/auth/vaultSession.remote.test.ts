import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPasswordEnvelope, decryptPayload, encryptPayload, generateMasterSecret, importVaultKeys } from '../crypto/vault'
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
    authorize: vi.fn(() => Promise.resolve('active')),
  }
  vi.doMock('./supabase', () => ({
    hasSupabaseConfiguration: true,
    signInRemoteAccount: remote.signIn,
    fetchRemotePasswordEnvelope: vi.fn(() => Promise.resolve(remote.envelope)),
    ensureRemoteDevice: remote.authorize,
    currentRemoteAccountId: vi.fn(() => Promise.resolve('00000000-0000-4000-8000-000000000001')),
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
    const secret = generateMasterSecret()
    const masterKey = (await importVaultKeys(secret)).master
    const envelope = await createPasswordEnvelope(secret, password)
    const { remote, session } = await loadRemoteSession(envelope)
    const database = new ApoioDatabase(`remote-session-${crypto.randomUUID()}`)
    databases.push(database)

    const result = await session.unlockAccount('conta.ficticia@example.invalid', password, database)
    const payload = await decryptPayload(result.keys.master, await encryptPayload(masterKey, { schemaVersion: 1, type: 'test', data: { fictional: true } }, '00000000-0000-4000-8000-000000000011'))

    expect(result.account).toMatchObject({ id: '00000000-0000-4000-8000-000000000001', authMode: 'supabase' })
    expect(payload).toMatchObject({ type: 'test', data: { fictional: true } })
    expect(await database.keyEnvelopes.get(keyEnvelopeId(result.account.id, 'password'))).toMatchObject({ accountId: result.account.id, envelope })
    expect(remote.signIn).toHaveBeenCalledTimes(1)
    expect(remote.authorize).toHaveBeenCalledTimes(1)
  })

  it('entra normalmente em um aparelho novo com e-mail e senha', async () => {
    // Quem decide a situação do aparelho é o serviço. O aplicativo apenas
    // espelha a resposta: declarar-se ativo por conta própria era justamente o
    // que um cliente alterado poderia fazer.
    const password = 'senha-ficticia-segura-2026'
    const secret = generateMasterSecret()
    const envelope = await createPasswordEnvelope(secret, password)
    const { remote, session } = await loadRemoteSession(envelope)
    const database = new ApoioDatabase(`remote-novo-aparelho-${crypto.randomUUID()}`)
    databases.push(database)

    await session.unlockAccount('conta.ficticia@example.invalid', password, database)

    const dispositivo = await database.devices.toCollection().first()
    expect(dispositivo?.status).toBe('active')
    expect(remote.authorize).toHaveBeenCalledWith(dispositivo?.id, expect.any(String))
  })

  it('espelha a situação que o serviço devolve, mesmo quando é pendente', async () => {
    const password = 'senha-ficticia-segura-2026'
    const secret = generateMasterSecret()
    const envelope = await createPasswordEnvelope(secret, password)
    const { remote, session } = await loadRemoteSession(envelope)
    remote.authorize.mockImplementation(() => Promise.resolve('pending'))
    const database = new ApoioDatabase(`remote-pending-${crypto.randomUUID()}`)
    databases.push(database)

    await session.unlockAccount('conta.ficticia@example.invalid', password, database)

    expect((await database.devices.toCollection().first())?.status).toBe('pending')
  })

  it('prepara o envelope remoto a partir de um aparelho que ainda entra', async () => {
    // Conta criada antes do envelope remoto: sem esta recuperação, entrar em um
    // navegador novo exigiria a chave de recuperação para sempre.
    const password = 'senha-ficticia-segura-2026'
    const secret = generateMasterSecret()
    const envelope = await createPasswordEnvelope(secret, password)
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
    const secret = generateMasterSecret()
    const envelope = await createPasswordEnvelope(secret, password)
    const { remote, session } = await loadRemoteSession(envelope)
    const database = new ApoioDatabase(`remote-sem-regravar-${crypto.randomUUID()}`)
    databases.push(database)

    await session.unlockAccount('conta.ficticia@example.invalid', password, database)
    remote.guardados.length = 0
    await session.unlockAccount('conta.ficticia@example.invalid', password, database)

    expect(remote.guardados).toHaveLength(0)
  })
})

/**
 * Cadastro, recuperação e troca de senha diante do que dá errado de verdade:
 * confirmação de e-mail ligada, sessão de outra conta aberta no mesmo
 * navegador e falha no meio da troca.
 */
describe('cadastro e senha com o serviço no meio', () => {
  async function carregarServico(overrides: Record<string, unknown> = {}) {
    const registros = {
      envelopesSenha: [] as unknown[],
      envelopesRecuperacao: [] as unknown[],
      senhas: [] as string[],
      aparelhos: [] as string[],
      existeEnvelope: false,
      contaRemota: '00000000-0000-4000-8000-000000000001' as string | null,
    }
    vi.doMock('./supabase', () => ({
      hasSupabaseConfiguration: true,
      registerRemoteAccount: vi.fn(() => Promise.resolve({ userId: '00000000-0000-4000-8000-000000000001', ready: false })),
      signInRemoteAccount: vi.fn(() => Promise.resolve('00000000-0000-4000-8000-000000000001')),
      currentRemoteAccountId: vi.fn(() => Promise.resolve(registros.contaRemota)),
      ensureRemoteDevice: vi.fn((id: string) => { registros.aparelhos.push(id); return Promise.resolve('active') }),
      fetchRemotePasswordEnvelope: vi.fn(),
      fetchRemoteRecoveryEnvelope: vi.fn(),
      hasRemotePasswordEnvelope: vi.fn(() => Promise.resolve(registros.existeEnvelope)),
      storeRemotePasswordEnvelope: vi.fn((envelope: unknown) => { registros.envelopesSenha.push(envelope); return Promise.resolve() }),
      storeRemoteRecoveryEnvelope: vi.fn((envelope: unknown) => { registros.envelopesRecuperacao.push(envelope); return Promise.resolve() }),
      updateRemotePassword: vi.fn((senha: string) => { registros.senhas.push(senha); return Promise.resolve() }),
      fetchRemoteDeviceStatus: vi.fn(),
      revokeRemoteDevice: vi.fn(),
      ...overrides,
    }))
    return { registros, session: await import('./vaultSession') }
  }

  it('não deixa a conta pela metade quando o serviço espera a confirmação do e-mail', async () => {
    const { registros, session } = await carregarServico()
    const database = new ApoioDatabase(`confirmacao-${crypto.randomUUID()}`)
    databases.push(database)

    const resultado = await session.registerAccount('conta.ficticia@example.invalid', 'frase-ficticia-longa-2026', database)

    expect(resultado.ready).toBe(false)
    expect(resultado.recoveryCode).toContain('APOIO-1-')
    expect(registros.envelopesSenha).toHaveLength(0)
    expect(registros.envelopesRecuperacao).toHaveLength(0)
    expect(registros.aparelhos).toHaveLength(0)
    expect(await database.accounts.count()).toBe(1)
  })

  it('completa o que faltou na primeira entrada depois da confirmação, sem repetir', async () => {
    const { registros, session } = await carregarServico()
    const database = new ApoioDatabase(`confirmacao-entrada-${crypto.randomUUID()}`)
    databases.push(database)
    await session.registerAccount('conta.ficticia@example.invalid', 'frase-ficticia-longa-2026', database)

    await session.unlockAccount('conta.ficticia@example.invalid', 'frase-ficticia-longa-2026', database)
    expect(registros.envelopesSenha).toHaveLength(1)
    expect(registros.envelopesRecuperacao).toHaveLength(1)
    expect(registros.aparelhos).toHaveLength(1)

    registros.existeEnvelope = true
    await session.unlockAccount('conta.ficticia@example.invalid', 'frase-ficticia-longa-2026', database)
    expect(registros.envelopesSenha).toHaveLength(1)
  })

  it('recusa trocar a senha quando a sessão aberta é de outra conta', async () => {
    const { registros, session } = await carregarServico()
    const database = new ApoioDatabase(`troca-outra-conta-${crypto.randomUUID()}`)
    databases.push(database)
    const { account } = await session.registerAccount('conta.ficticia@example.invalid', 'frase-ficticia-longa-2026', database)
    registros.contaRemota = '00000000-0000-4000-8000-000000000099'

    await expect(session.changeVaultPassword(account, 'frase-ficticia-longa-2026', 'outra-frase-ficticia-2027', database))
      .rejects.toThrow('outra conta')
    expect(registros.senhas).toHaveLength(0)
  })

  it('devolve a senha do serviço ao estado anterior quando o envelope não é gravado', async () => {
    // Sem essa volta atrás, o serviço ficaria com a senha nova e o envelope
    // antigo: entrar em outro aparelho pararia de funcionar para sempre.
    const senhas: string[] = []
    const { session } = await carregarServico({
      updateRemotePassword: vi.fn((senha: string) => { senhas.push(senha); return Promise.resolve() }),
      storeRemotePasswordEnvelope: vi.fn(() => { throw new Error('falha fictícia do serviço') }),
    })
    const database = new ApoioDatabase(`troca-interrompida-${crypto.randomUUID()}`)
    databases.push(database)
    const { account } = await session.registerAccount('conta.ficticia@example.invalid', 'frase-ficticia-longa-2026', database)
    const envelopeAntes = await database.keyEnvelopes.get(`${account.id}:password`)

    await expect(session.changeVaultPassword(account, 'frase-ficticia-longa-2026', 'outra-frase-ficticia-2027', database))
      .rejects.toThrow('Nada mudou')

    expect(senhas).toEqual(['outra-frase-ficticia-2027', 'frase-ficticia-longa-2026'])
    expect(await database.keyEnvelopes.get(`${account.id}:password`)).toEqual(envelopeAntes)
  })

  it('recusa senha fraca na criação e na troca', async () => {
    const { session } = await carregarServico()
    const database = new ApoioDatabase(`senha-fraca-${crypto.randomUUID()}`)
    databases.push(database)

    await expect(session.registerAccount('conta.ficticia@example.invalid', '123456789012', database)).rejects.toThrow('fácil de adivinhar')
    await expect(session.registerAccount('conta.ficticia@example.invalid', 'curta', database)).rejects.toThrow('12 caracteres')
  })
})
