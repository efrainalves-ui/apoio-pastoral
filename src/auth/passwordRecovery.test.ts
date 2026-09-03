import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPasswordEnvelope, createRecoveryEnvelope, generateMasterSecret, openPasswordEnvelope } from '../crypto/vault'
import { ApoioDatabase } from '../db/database'
import { keyEnvelopeId } from '../db/types'
import { isPasswordRecoveryUrl } from './passwordReset'

const databases: ApoioDatabase[] = []

afterEach(async () => {
  localStorage.clear()
  await Promise.all(databases.splice(0).map((database) => database.delete()))
  vi.doUnmock('./supabase')
  vi.resetModules()
})

const CONTA = '00000000-0000-4000-8000-000000000001'
const EMAIL = 'conta.ficticia@example.invalid'

interface ServicoFicticio {
  senhaDoServico: string
  envelopeGuardado: unknown
  sessaoAberta: boolean
  falharAoGuardarEnvelope: boolean
  falharAoVoltarSenha: boolean
}

async function carregar(estado: Partial<ServicoFicticio> = {}) {
  const servico: ServicoFicticio = {
    senhaDoServico: 'senha-ficticia-antiga-2026',
    envelopeGuardado: null,
    sessaoAberta: true,
    falharAoGuardarEnvelope: false,
    falharAoVoltarSenha: false,
    ...estado,
  }
  const chamadas = { atualizacoesDeSenha: [] as string[], envelopesGuardados: [] as unknown[] }

  vi.doMock('./supabase', () => ({
    hasSupabaseConfiguration: true,
    currentRemoteAccountId: vi.fn(() => Promise.resolve(servico.sessaoAberta ? CONTA : null)),
    signInRemoteAccount: vi.fn((_email: string, senha: string) => senha === servico.senhaDoServico
      ? Promise.resolve(CONTA)
      : Promise.reject(new Error('E-mail ou senha inválidos.'))),
    updateRemotePassword: vi.fn((senha: string) => {
      chamadas.atualizacoesDeSenha.push(senha)
      const voltando = senha !== servico.senhaDoServico && chamadas.atualizacoesDeSenha.length > 1
      if (voltando && servico.falharAoVoltarSenha) return Promise.reject(new Error('serviço fora do ar'))
      servico.senhaDoServico = senha
      return Promise.resolve()
    }),
    storeRemotePasswordEnvelope: vi.fn((envelope: unknown) => {
      if (servico.falharAoGuardarEnvelope) return Promise.reject(new Error('serviço fora do ar'))
      chamadas.envelopesGuardados.push(envelope)
      servico.envelopeGuardado = envelope
      return Promise.resolve()
    }),
    fetchRemotePasswordEnvelope: vi.fn(() => servico.envelopeGuardado
      ? Promise.resolve(servico.envelopeGuardado)
      : Promise.reject(new Error('sem envelope'))),
    hasRemotePasswordEnvelope: vi.fn(() => Promise.resolve(Boolean(servico.envelopeGuardado))),
    storeRemoteRecoveryEnvelope: vi.fn(),
    fetchRemoteRecoveryEnvelope: vi.fn(),
    ensureRemoteDevice: vi.fn(() => Promise.resolve('active')),
    registerRemoteAccount: vi.fn(),
    fetchRemoteDeviceStatus: vi.fn(),
    revokeRemoteDevice: vi.fn(),
    revokeAllRemoteDevices: vi.fn(),
  }))

  const database = new ApoioDatabase(`recuperacao-${crypto.randomUUID()}`)
  databases.push(database)
  return { servico, chamadas, database, session: await import('./vaultSession') }
}

/** Conta fictícia já instalada neste aparelho, com envelope de senha e de chave. */
async function contaInstalada(database: ApoioDatabase, senha: string) {
  const secret = generateMasterSecret()
  const passwordEnvelope = await createPasswordEnvelope(secret, senha)
  const recovery = await createRecoveryEnvelope(secret)
  secret.fill(0)
  const agora = new Date().toISOString()
  await database.accounts.put({ id: CONTA, email: EMAIL, createdAt: agora, authMode: 'supabase' })
  await database.keyEnvelopes.bulkPut([
    { id: keyEnvelopeId(CONTA, 'password'), kind: 'password', accountId: CONTA, envelope: passwordEnvelope, updatedAt: agora },
    { id: keyEnvelopeId(CONTA, 'recovery'), kind: 'recovery', accountId: CONTA, envelope: recovery.envelope, updatedAt: agora },
  ])
  await database.syncState.put({ accountId: CONTA, cursor: null, lastSyncedAt: null })
  return { passwordEnvelope, recoveryCode: recovery.recoveryCode }
}

describe('link de redefinição de senha', () => {
  it('reconhece o retorno do e-mail e ignora um endereço comum', () => {
    expect(isPasswordRecoveryUrl('https://exemplo.invalid/acesso#access_token=abc&type=recovery')).toBe(true)
    expect(isPasswordRecoveryUrl('https://exemplo.invalid/acesso?type=recovery')).toBe(true)
    expect(isPasswordRecoveryUrl('https://exemplo.invalid/acesso#type=signup')).toBe(false)
    expect(isPasswordRecoveryUrl('https://exemplo.invalid/acesso')).toBe(false)
    expect(isPasswordRecoveryUrl('nem endereço é')).toBe(false)
  })
})

describe('conclusão da redefinição de senha pelo e-mail', () => {
  it('define a senha nova no serviço e reabre o cofre com a chave de recuperação', async () => {
    // O buraco: o link abria uma sessão e nada mais. A senha jamais era
    // trocada, e a tela mandava o pastor entrar com uma senha inexistente.
    const { servico, database, session } = await carregar()
    const { recoveryCode } = await contaInstalada(database, 'senha-ficticia-antiga-2026')

    const resultado = await session.completePasswordReset(EMAIL, recoveryCode, 'senha-ficticia-nova-2027', database)

    expect(servico.senhaDoServico).toBe('senha-ficticia-nova-2027')
    expect(resultado.account.id).toBe(CONTA)
    const guardado = await database.keyEnvelopes.get(keyEnvelopeId(CONTA, 'password'))
    expect(guardado?.envelope.kind).toBe('password')
    // O envelope novo abre com a senha nova, aqui e no serviço.
    await expect(openPasswordEnvelope(guardado!.envelope as never, 'senha-ficticia-nova-2027')).resolves.toBeDefined()
    expect(servico.envelopeGuardado).toBeTruthy()
  })

  it('recusa concluir quando o link já não vale', async () => {
    const { database, session } = await carregar({ sessaoAberta: false })
    const { recoveryCode } = await contaInstalada(database, 'senha-ficticia-antiga-2026')

    await expect(session.completePasswordReset(EMAIL, recoveryCode, 'senha-ficticia-nova-2027', database))
      .rejects.toThrow('não está mais valendo')
  })

  it('recusa a chave de recuperação errada sem trocar a senha do cofre', async () => {
    const { database, session } = await carregar()
    await contaInstalada(database, 'senha-ficticia-antiga-2026')
    const antes = await database.keyEnvelopes.get(keyEnvelopeId(CONTA, 'password'))

    await expect(session.completePasswordReset(EMAIL, 'CHAVE-FICTICIA-ERRADA', 'senha-ficticia-nova-2027', database)).rejects.toThrow()

    expect(await database.keyEnvelopes.get(keyEnvelopeId(CONTA, 'password'))).toMatchObject({ envelope: antes!.envelope })
  })
})

describe('troca de senha sem deixar a conta pela metade', () => {
  it('guarda a senha nova nos dois lados quando tudo dá certo', async () => {
    const { servico, database, session } = await carregar()
    await contaInstalada(database, 'senha-ficticia-antiga-2026')
    const conta = (await database.accounts.get(CONTA))!

    await session.changeVaultPassword(conta, 'senha-ficticia-antiga-2026', 'senha-ficticia-nova-2027', database)

    expect(servico.senhaDoServico).toBe('senha-ficticia-nova-2027')
    const guardado = await database.keyEnvelopes.get(keyEnvelopeId(CONTA, 'password'))
    expect(guardado?.pendingRemote).toBe(false)
    await expect(openPasswordEnvelope(guardado!.envelope as never, 'senha-ficticia-nova-2027')).resolves.toBeDefined()
  })

  it('desfaz a senha do serviço quando o envelope não sobe, e aí nada mudou mesmo', async () => {
    const { servico, database, session } = await carregar({ falharAoGuardarEnvelope: true })
    await contaInstalada(database, 'senha-ficticia-antiga-2026')
    const conta = (await database.accounts.get(CONTA))!
    const antes = await database.keyEnvelopes.get(keyEnvelopeId(CONTA, 'password'))

    await expect(session.changeVaultPassword(conta, 'senha-ficticia-antiga-2026', 'senha-ficticia-nova-2027', database))
      .rejects.toThrow('Nada mudou')

    expect(servico.senhaDoServico).toBe('senha-ficticia-antiga-2026')
    expect(await database.keyEnvelopes.get(keyEnvelopeId(CONTA, 'password'))).toMatchObject({ envelope: antes!.envelope })
  })

  it('quando nem a volta atrás dá certo, avança junto com o serviço e diz a verdade', async () => {
    // Antes a mensagem afirmava "Nada mudou" com a senha do serviço já trocada:
    // o pastor ficava sem saber qual senha valia em aparelho nenhum.
    const { servico, database, session } = await carregar({ falharAoGuardarEnvelope: true, falharAoVoltarSenha: true })
    await contaInstalada(database, 'senha-ficticia-antiga-2026')
    const conta = (await database.accounts.get(CONTA))!

    await expect(session.changeVaultPassword(conta, 'senha-ficticia-antiga-2026', 'senha-ficticia-nova-2027', database))
      .rejects.toThrow('já vale neste aparelho e no serviço')

    expect(servico.senhaDoServico).toBe('senha-ficticia-nova-2027')
    const guardado = await database.keyEnvelopes.get(keyEnvelopeId(CONTA, 'password'))
    expect(guardado?.pendingRemote).toBe(true)
    await expect(openPasswordEnvelope(guardado!.envelope as never, 'senha-ficticia-nova-2027')).resolves.toBeDefined()
  })

  it('a próxima entrada com rede conclui a pendência sozinha', async () => {
    const { servico, database, session } = await carregar({ falharAoGuardarEnvelope: true, falharAoVoltarSenha: true })
    await contaInstalada(database, 'senha-ficticia-antiga-2026')
    const conta = (await database.accounts.get(CONTA))!
    await session.changeVaultPassword(conta, 'senha-ficticia-antiga-2026', 'senha-ficticia-nova-2027', database).catch(() => undefined)
    servico.falharAoGuardarEnvelope = false

    await session.unlockAccount(EMAIL, 'senha-ficticia-nova-2027', database)

    expect(servico.envelopeGuardado).toBeTruthy()
    expect((await database.keyEnvelopes.get(keyEnvelopeId(CONTA, 'password')))?.pendingRemote).toBe(false)
  })
})

describe('senha trocada em outro aparelho', () => {
  it('entra com a senha nova buscando o envelope que o serviço tem', async () => {
    // Este aparelho ficou com o envelope antigo. O serviço aceitou a senha, e
    // sem esta volta o pastor via "Senha incorreta" com a senha certa.
    const { servico, database, session } = await carregar()
    await contaInstalada(database, 'senha-ficticia-antiga-2026')
    const secret = generateMasterSecret()
    servico.envelopeGuardado = await createPasswordEnvelope(secret, 'senha-ficticia-nova-2027')
    secret.fill(0)
    servico.senhaDoServico = 'senha-ficticia-nova-2027'

    const resultado = await session.unlockAccount(EMAIL, 'senha-ficticia-nova-2027', database)

    expect(resultado.account.id).toBe(CONTA)
    expect(await database.keyEnvelopes.get(keyEnvelopeId(CONTA, 'password'))).toMatchObject({ envelope: servico.envelopeGuardado })
  })

  it('continua recusando a senha errada', async () => {
    const { database, session } = await carregar()
    await contaInstalada(database, 'senha-ficticia-antiga-2026')

    await expect(session.unlockAccount(EMAIL, 'senha-ficticia-que-nao-e-2029', database)).rejects.toThrow()
  })
})
