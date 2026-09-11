import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { encryptPayload, generateMasterKey, generateVaultKeys } from '../crypto/vault'
import { ApoioDatabase } from '../db/database'
import { VaultRepository } from '../db/repository'
import { CloseDistrictService } from '../district/closeDistrict'
import { PersonDataService } from '../people/personData'
import { SyncService } from '../sync/service'
import { LocalDevelopmentTransport, resetLocalDevelopmentTransport } from '../sync/transport'
import { AVISO_SESSAO_TROCADA, SessaoDeOutraContaError, SessaoIndisponivelError, clearAccountSessionLock, createAccountSessionGuard, lockedAccountId, onAccountSessionLost } from './accountGuard'

vi.mock('./supabase', async (importarOriginal) => ({
  ...await importarOriginal<Record<string, unknown>>(),
  hasSupabaseConfiguration: false,
  ensureRemoteDevice: vi.fn(() => Promise.resolve('active')),
  fetchRemoteDeviceStatus: vi.fn(() => Promise.resolve(null)),
  revokeRemoteDevice: vi.fn(() => Promise.resolve()),
}))

/**
 * Duas contas fictícias, cada uma em uma aba do mesmo navegador.
 *
 * O cliente do serviço guarda a sessão no armazenamento da origem, que é um só
 * para todas as abas. Entrar como B na aba 2 troca a sessão da aba 1 também: a
 * aba 1 continua desenhando a conta A e cada chamada remota que ela faz sai
 * autenticada como B. `navegador` abaixo é exatamente essa sessão única.
 */
const CONTA_A = 'conta-ficticia-alfa'
const CONTA_B = 'conta-ficticia-beta'

const navegador = { sessao: CONTA_A as string | null, consultas: 0 }
const guarda = createAccountSessionGuard({
  remoteEnabled: true,
  readRemoteAccountId: () => { navegador.consultas += 1; return Promise.resolve(navegador.sessao) },
})

const bancos: ApoioDatabase[] = []

beforeEach(() => {
  clearAccountSessionLock()
  navegador.sessao = CONTA_A
  navegador.consultas = 0
  localStorage.clear()
  resetLocalDevelopmentTransport()
})
afterEach(async () => {
  clearAccountSessionLock()
  await Promise.all(bancos.splice(0).map((banco) => banco.delete()))
})

function novoBanco() {
  const banco = new ApoioDatabase(`abas-${crypto.randomUUID()}`)
  bancos.push(banco)
  return banco
}

async function contaComAparelho(banco: ApoioDatabase, accountId: string, deviceId: string) {
  await banco.devices.put({ id: deviceId, accountId, label: 'Computador Fictício', status: 'active', createdAt: '', lastSeenAt: '' })
  await banco.syncState.put({ accountId, cursor: null, lastSyncedAt: null })
}

describe('duas contas em abas do mesmo navegador', () => {
  it('deixa passar enquanto a sessão é a da conta desta aba', async () => {
    await expect(guarda(CONTA_A)).resolves.toBeUndefined()
    expect(lockedAccountId()).toBeNull()
  })

  it('bloqueia a aba assim que outra conta entra em outra aba', async () => {
    navegador.sessao = CONTA_B

    await expect(guarda(CONTA_A)).rejects.toThrow(AVISO_SESSAO_TROCADA)
    expect(lockedAccountId()).toBe(CONTA_A)
  })

  /*
    Sem sessão, a operação não sai — mas a aba continua viva.

    Nenhuma chamada remota funcionaria sem sessão, então não há risco de agir
    como outra conta aqui. Derrubar o cofre por isso cobraria do pastor um novo
    acesso por um problema que não era dele.
  */
  it('sessão ausente recusa a operação sem matar a aba', async () => {
    navegador.sessao = null
    await expect(guarda(CONTA_A)).rejects.toBeInstanceOf(SessaoIndisponivelError)
    expect(lockedAccountId()).toBeNull()
  })

  /*
    Rede instável é indisponibilidade, não invasão.

    Enquanto os dois casos eram um só, uma oscilação de sinal derrubava o cofre
    e mandava o pastor de volta ao acesso dizendo que outra conta tinha entrado
    — o que não tinha acontecido. Num aplicativo feito para funcionar no meio do
    distrito, era perder a sessão a cada oscilação.
  */
  it('erro de rede recusa a operação, e a próxima tentativa funciona', async () => {
    let vezes = 0
    const instavel = createAccountSessionGuard({
      remoteEnabled: true,
      readRemoteAccountId: () => {
        vezes += 1
        return vezes === 1 ? Promise.reject(new Error('rede caiu')) : Promise.resolve(CONTA_A)
      },
    })
    await expect(instavel(CONTA_A)).rejects.toBeInstanceOf(SessaoIndisponivelError)
    expect(lockedAccountId()).toBeNull()
    await expect(instavel(CONTA_A)).resolves.toBeUndefined()
  })

  /*
    O que continua valendo sem exceção: conta confirmadamente diferente mata a
    aba. É a única situação em que agir teria consequência sem volta.
  */
  it('só a conta confirmadamente diferente bloqueia a aba', async () => {
    navegador.sessao = CONTA_B
    await expect(guarda(CONTA_A)).rejects.toBeInstanceOf(SessaoDeOutraContaError)
    expect(lockedAccountId()).toBe(CONTA_A)
  })

  it('uma vez bloqueada, a aba não volta sozinha nem pergunta de novo ao serviço', async () => {
    navegador.sessao = CONTA_B
    await expect(guarda(CONTA_A)).rejects.toThrow()
    const consultasAteAqui = navegador.consultas

    // Mesmo que a sessão volte a ser a de A — outra aba fez logout e login —,
    // esta aba continua bloqueada: quem prova de quem é a sessão é um acesso
    // novo, não uma coincidência.
    navegador.sessao = CONTA_A
    await expect(guarda(CONTA_A)).rejects.toThrow(AVISO_SESSAO_TROCADA)
    expect(navegador.consultas).toBe(consultasAteAqui)

    clearAccountSessionLock()
    await expect(guarda(CONTA_A)).resolves.toBeUndefined()
  })

  it('avisa a interface para fechar o cofre e pedir um acesso novo', async () => {
    const avisadas: string[] = []
    const parar = onAccountSessionLost((conta) => avisadas.push(conta))
    navegador.sessao = CONTA_B

    await expect(guarda(CONTA_A)).rejects.toThrow()

    expect(avisadas).toEqual([CONTA_A])
    parar()
  })

  it('a aba da conta A não sincroniza depois que a conta B entrou', async () => {
    const banco = novoBanco()
    await contaComAparelho(banco, CONTA_A, 'aparelho-ficticio-a')
    const chaves = await generateVaultKeys()
    const servico = new SyncService(new LocalDevelopmentTransport(), banco, () => true, () => Promise.resolve(null), () => Promise.resolve(null), guarda)

    // Enquanto a sessão é de A, a rodada acontece normalmente.
    await expect(servico.synchronize(CONTA_A, 'aparelho-ficticio-a', chaves.sync)).resolves.toBeTruthy()

    navegador.sessao = CONTA_B
    await expect(servico.synchronize(CONTA_A, 'aparelho-ficticio-a', chaves.sync)).rejects.toThrow(AVISO_SESSAO_TROCADA)
  })

  it('a aba da conta A não apaga uma pessoa depois que a conta B entrou', async () => {
    const banco = novoBanco()
    const chave = await generateMasterKey()
    const pessoa = crypto.randomUUID()
    await new VaultRepository(banco).saveEncrypted(
      CONTA_A, 'aparelho-ficticio-a', pessoa,
      await encryptPayload(chave, { schemaVersion: 1, type: 'person', data: { name: 'Pessoa Fictícia Alfa' } }, pessoa),
      'person',
    )
    navegador.sessao = CONTA_B

    const dados = new PersonDataService(banco, guarda)
    await expect(dados.remove(CONTA_A, chave, 'aparelho-ficticio-a', pessoa)).rejects.toThrow(AVISO_SESSAO_TROCADA)

    // Nada foi apagado: a lápide e o pedido de expurgo iriam para a conta B.
    expect((await banco.vaultRecords.get(pessoa))?.deletedAt).toBeUndefined()
    expect(await banco.pendingActions.count()).toBe(0)
  })

  it('a aba da conta A não encerra o distrito depois que a conta B entrou', async () => {
    const banco = novoBanco()
    const chave = await generateMasterKey()
    const registro = crypto.randomUUID()
    await new VaultRepository(banco).saveEncrypted(
      CONTA_A, 'aparelho-ficticio-a', registro,
      await encryptPayload(chave, { schemaVersion: 1, type: 'district', data: { name: 'Distrito Fictício Alfa' } }, registro),
      'district',
    )
    await contaComAparelho(banco, CONTA_A, 'aparelho-ficticio-a')
    navegador.sessao = CONTA_B

    const encerramento = new CloseDistrictService(banco, {
      listDevices: () => Promise.resolve(null),
      revokeAll: () => Promise.resolve(null),
      synchronize: () => Promise.resolve(null),
    }, guarda)

    await expect(encerramento.close(CONTA_A, chave)).rejects.toThrow(AVISO_SESSAO_TROCADA)
    await expect(encerramento.resume(CONTA_A, chave)).rejects.toThrow(AVISO_SESSAO_TROCADA)

    expect((await banco.vaultRecords.get(registro))?.deletedAt).toBeUndefined()
    expect((await banco.devices.get('aparelho-ficticio-a'))?.status).toBe('active')
  })

  it('cada conta segue trabalhando na própria aba enquanto a sessão for a dela', async () => {
    // O bloqueio não pode virar uma trava geral: com a sessão certa, as duas
    // contas fictícias continuam funcionando lado a lado no mesmo aparelho.
    const banco = novoBanco()
    await contaComAparelho(banco, CONTA_A, 'aparelho-ficticio-a')
    await contaComAparelho(banco, CONTA_B, 'aparelho-ficticio-b')
    const chavesA = await generateVaultKeys()
    const chavesB = await generateVaultKeys()
    const servico = new SyncService(new LocalDevelopmentTransport(), banco, () => true, () => Promise.resolve(null), () => Promise.resolve(null), guarda)

    navegador.sessao = CONTA_A
    await expect(servico.synchronize(CONTA_A, 'aparelho-ficticio-a', chavesA.sync)).resolves.toBeTruthy()

    clearAccountSessionLock()
    navegador.sessao = CONTA_B
    await expect(servico.synchronize(CONTA_B, 'aparelho-ficticio-b', chavesB.sync)).resolves.toBeTruthy()
  })

  it('sem serviço remoto configurado, a guarda não atrapalha o modo local', async () => {
    const local = createAccountSessionGuard({
      remoteEnabled: false,
      readRemoteAccountId: () => Promise.reject(new Error('nunca deveria ser chamada')),
    })
    await expect(local(CONTA_A)).resolves.toBeUndefined()
  })
})
