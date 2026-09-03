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
  emailDaSessao: string
  falharAoGuardarEnvelope: boolean
  falharAoVoltarSenha: boolean
}

async function carregar(estado: Partial<ServicoFicticio> = {}) {
  const servico: ServicoFicticio = {
    senhaDoServico: 'senha-ficticia-antiga-2026',
    envelopeGuardado: null,
    sessaoAberta: true,
    emailDaSessao: EMAIL,
    falharAoGuardarEnvelope: false,
    falharAoVoltarSenha: false,
    ...estado,
  }
  const chamadas = { atualizacoesDeSenha: [] as string[], envelopesGuardados: [] as unknown[] }

  vi.doMock('./supabase', () => ({
    hasSupabaseConfiguration: true,
    currentRemoteAccountId: vi.fn(() => Promise.resolve(servico.sessaoAberta ? CONTA : null)),
    currentRemoteAccount: vi.fn(() => Promise.resolve(servico.sessaoAberta ? { id: CONTA, email: servico.emailDaSessao } : null)),
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

describe('a redefinição confere antes de mexer na conta', () => {
  it('não troca a senha do serviço quando a chave de recuperação está errada', async () => {
    // Antes a senha do serviço era trocada primeiro. Com a chave errada, o
    // titular ficava com a senha antiga já inválida e um cofre que nenhuma
    // senha abria — a conta inteira perdida por um erro de digitação.
    const { servico, chamadas, database, session } = await carregar()
    await contaInstalada(database, 'senha-ficticia-antiga-2026')

    await expect(session.completePasswordReset(EMAIL, 'CHAVE-FICTICIA-ERRADA', 'senha-ficticia-nova-2027', database)).rejects.toThrow()

    expect(servico.senhaDoServico).toBe('senha-ficticia-antiga-2026')
    expect(chamadas.atualizacoesDeSenha).toHaveLength(0)
  })

  it('não troca a senha quando o link é de outra conta do serviço', async () => {
    const { servico, chamadas, database, session } = await carregar()
    const { recoveryCode } = await contaInstalada(database, 'senha-ficticia-antiga-2026')
    // A conta local deste e-mail existe, mas a sessão aberta pelo link é de
    // outra conta: trocar a senha aqui trocaria a senha da conta errada.
    await database.accounts.put({ id: 'outra-conta-ficticia', email: 'outro.ficticio@example.invalid', createdAt: new Date().toISOString(), authMode: 'supabase' })

    await expect(session.completePasswordReset('outro.ficticio@example.invalid', recoveryCode, 'senha-ficticia-nova-2027', database))
      .rejects.toThrow('de outra conta')

    expect(servico.senhaDoServico).toBe('senha-ficticia-antiga-2026')
    expect(chamadas.atualizacoesDeSenha).toHaveLength(0)
  })

  it('com a chave certa, troca a senha e reabre o cofre', async () => {
    const { servico, database, session } = await carregar()
    const { recoveryCode } = await contaInstalada(database, 'senha-ficticia-antiga-2026')

    const resultado = await session.completePasswordReset(EMAIL, recoveryCode, 'senha-ficticia-nova-2027', database)

    expect(servico.senhaDoServico).toBe('senha-ficticia-nova-2027')
    expect(resultado.account.id).toBe(CONTA)
    const guardado = await database.keyEnvelopes.get(keyEnvelopeId(CONTA, 'password'))
    await expect(openPasswordEnvelope(guardado!.envelope as never, 'senha-ficticia-nova-2027')).resolves.toBeDefined()
  })
})

describe('troca de senha interrompida entre o serviço e o envelope', () => {
  /** O aparelho desliga logo depois de o serviço aceitar a senha nova. */
  async function trocaInterrompida() {
    const carga = await carregar()
    await contaInstalada(carga.database, 'senha-ficticia-antiga-2026')
    const conta = (await carga.database.accounts.get(CONTA))!
    // Falha ao guardar o envelope e falha ao desfazer: é exatamente o instante
    // em que o navegador fechado deixaria a conta partida.
    carga.servico.falharAoGuardarEnvelope = true
    carga.servico.falharAoVoltarSenha = true
    await carga.session.changeVaultPassword(conta, 'senha-ficticia-antiga-2026', 'senha-ficticia-nova-2027', carga.database).catch(() => undefined)
    return carga
  }

  it('o envelope da senha nova fica guardado antes de o serviço saber dela', async () => {
    const { database, session, servico } = await carregar()
    await contaInstalada(database, 'senha-ficticia-antiga-2026')
    const conta = (await database.accounts.get(CONTA))!
    servico.falharAoGuardarEnvelope = true
    servico.falharAoVoltarSenha = true

    await session.changeVaultPassword(conta, 'senha-ficticia-antiga-2026', 'senha-ficticia-nova-2027', database).catch(() => undefined)

    // Guardado com a senha nova, e o serviço também já está com ela.
    expect(servico.senhaDoServico).toBe('senha-ficticia-nova-2027')
    const guardado = await database.keyEnvelopes.get(keyEnvelopeId(CONTA, 'password'))
    await expect(openPasswordEnvelope(guardado!.envelope as never, 'senha-ficticia-nova-2027')).resolves.toBeDefined()
  })

  it('a entrada seguinte com a senha nova conclui o que faltava, sem rede no meio', async () => {
    const { database, session, servico } = await trocaInterrompida()
    // O serviço volta a responder: a pendência sobe sozinha.
    servico.falharAoGuardarEnvelope = false

    const resultado = await session.unlockAccount(EMAIL, 'senha-ficticia-nova-2027', database)

    expect(resultado.account.id).toBe(CONTA)
    expect(servico.envelopeGuardado).toBeTruthy()
    expect((await database.keyEnvelopes.get(keyEnvelopeId(CONTA, 'password')))?.pendingRemote).toBe(false)
  })

  it('mesmo com o aparelho reiniciado no meio, a conta abre com a senha nova', async () => {
    // O aparelho desliga entre a senha remota e a gravação do envelope: só o
    // registro pendente sobrevive, e é ele que devolve o acesso.
    const { database, session, servico } = await carregar()
    const { passwordEnvelope } = await contaInstalada(database, 'senha-ficticia-antiga-2026')
    const conta = (await database.accounts.get(CONTA))!
    servico.falharAoGuardarEnvelope = true
    servico.falharAoVoltarSenha = true
    await session.changeVaultPassword(conta, 'senha-ficticia-antiga-2026', 'senha-ficticia-nova-2027', database).catch(() => undefined)
    // Reinício bruto: o envelope corrente volta a ser o antigo, como estaria se
    // a gravação final nunca tivesse acontecido. Sobra a pendência.
    await database.keyEnvelopes.put({ id: keyEnvelopeId(CONTA, 'password'), kind: 'password', accountId: CONTA, envelope: passwordEnvelope, updatedAt: new Date().toISOString() })
    await database.keyEnvelopes.put({ id: `${CONTA}:password-pendente`, kind: 'password', accountId: CONTA, envelope: (await createPasswordEnvelope(generateMasterSecret(), 'irrelevante-ficticia-2026')), updatedAt: new Date().toISOString(), pendingRemote: true })

    // Com a pendência de outro segredo, ela não abre e o serviço é consultado.
    servico.falharAoGuardarEnvelope = false
    servico.envelopeGuardado = await createPasswordEnvelope(generateMasterSecret(), 'senha-ficticia-nova-2027')
    servico.senhaDoServico = 'senha-ficticia-nova-2027'

    await expect(session.unlockAccount(EMAIL, 'senha-ficticia-nova-2027', database)).resolves.toBeDefined()
    expect(await database.keyEnvelopes.get(`${CONTA}:password-pendente`)).toBeUndefined()
  })

  it('quando a troca não chegou ao serviço, a senha antiga continua valendo e a pendência sai', async () => {
    const { database, session, servico } = await carregar({ falharAoGuardarEnvelope: true })
    await contaInstalada(database, 'senha-ficticia-antiga-2026')
    const conta = (await database.accounts.get(CONTA))!

    // Aqui a volta atrás dá certo: o serviço fica com a senha antiga.
    await session.changeVaultPassword(conta, 'senha-ficticia-antiga-2026', 'senha-ficticia-nova-2027', database).catch(() => undefined)
    expect(servico.senhaDoServico).toBe('senha-ficticia-antiga-2026')

    await expect(session.unlockAccount(EMAIL, 'senha-ficticia-antiga-2026', database)).resolves.toBeDefined()
    expect(await database.keyEnvelopes.get(`${CONTA}:password-pendente`)).toBeUndefined()
  })
})

describe('redefinição por e-mail interrompida', () => {
  it('recusa quando o e-mail digitado não é o da sessão do link', async () => {
    // Conferir só o identificador não bastava: quem digita o e-mail é o
    // titular, e trocar a senha da conta errada só apareceria pelo bloqueio.
    const { servico, chamadas, database, session } = await carregar({ emailDaSessao: 'outro.ficticio@example.invalid' })
    const { recoveryCode } = await contaInstalada(database, 'senha-ficticia-antiga-2026')

    await expect(session.completePasswordReset(EMAIL, recoveryCode, 'senha-ficticia-nova-2027', database))
      .rejects.toThrow('de outra conta')

    expect(servico.senhaDoServico).toBe('senha-ficticia-antiga-2026')
    expect(chamadas.atualizacoesDeSenha).toHaveLength(0)
  })

  it('não deixa registro local desta conta quando a chave está errada', async () => {
    // Aparelho que ainda não conhece a conta: gravar a conta e o envelope de
    // recuperação antes de a chave conferir deixava rastro de uma recuperação
    // que nunca aconteceu.
    const { servico, database, session } = await carregar()
    const secret = generateMasterSecret()
    servico.envelopeGuardado = await createPasswordEnvelope(secret, 'senha-ficticia-antiga-2026')
    secret.fill(0)

    await expect(session.completePasswordReset(EMAIL, 'CHAVE-FICTICIA-ERRADA', 'senha-ficticia-nova-2027', database)).rejects.toThrow()

    expect(await database.accounts.count()).toBe(0)
    expect(await database.keyEnvelopes.count()).toBe(0)
  })

  it('interrompida entre a senha do serviço e o envelope, a entrada seguinte conclui', async () => {
    const { servico, database, session } = await carregar({ falharAoGuardarEnvelope: true, falharAoVoltarSenha: true })
    const { recoveryCode } = await contaInstalada(database, 'senha-ficticia-antiga-2026')

    await expect(session.completePasswordReset(EMAIL, recoveryCode, 'senha-ficticia-nova-2027', database))
      .rejects.toThrow('já vale neste aparelho e no serviço')

    // O serviço já está com a senha nova e este aparelho também: a conta não
    // ficou trancada, só falta o envelope subir.
    expect(servico.senhaDoServico).toBe('senha-ficticia-nova-2027')
    const guardado = await database.keyEnvelopes.get(keyEnvelopeId(CONTA, 'password'))
    expect(guardado?.pendingRemote).toBe(true)
    await expect(openPasswordEnvelope(guardado!.envelope as never, 'senha-ficticia-nova-2027')).resolves.toBeDefined()

    servico.falharAoGuardarEnvelope = false
    await session.unlockAccount(EMAIL, 'senha-ficticia-nova-2027', database)
    expect(servico.envelopeGuardado).toBeTruthy()
    expect((await database.keyEnvelopes.get(keyEnvelopeId(CONTA, 'password')))?.pendingRemote).toBe(false)
  })
})
