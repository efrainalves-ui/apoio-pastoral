import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { encryptPayload } from '../crypto/vault'
import { ApoioDatabase } from '../db/database'
import { VaultRepository } from '../db/repository'
import { keyEnvelopeId } from '../db/types'
import { currentDeviceId } from './device'
import { listLocalAccounts, registerAccount, unlockAccount } from './vaultSession'

vi.mock('./supabase', async (importarOriginal) => ({
  ...await importarOriginal<Record<string, unknown>>(),
  hasSupabaseConfiguration: false,
  ensureRemoteDevice: vi.fn(() => Promise.resolve()),
  storeRemotePasswordEnvelope: vi.fn(() => Promise.resolve()),
  storeRemoteRecoveryEnvelope: vi.fn(() => Promise.resolve()),
}))

const CONTA_A = { email: 'conta.a.ficticia@example.invalid', senha: 'senha-ficticia-conta-a-2026' }
const CONTA_B = { email: 'conta.b.ficticia@example.invalid', senha: 'senha-ficticia-conta-b-2026' }

const bancos: ApoioDatabase[] = []

beforeEach(() => localStorage.clear())
afterEach(async () => { localStorage.clear(); await Promise.all(bancos.splice(0).map((banco) => banco.delete())) })

function novoBanco() {
  const banco = new ApoioDatabase(`multi-conta-${crypto.randomUUID()}`)
  bancos.push(banco)
  return banco
}

async function guardarRegistro(banco: ApoioDatabase, accountId: string, chave: CryptoKey, nome: string) {
  const id = crypto.randomUUID()
  await new VaultRepository(banco).saveEncrypted(
    accountId, currentDeviceId(accountId), id,
    await encryptPayload(chave, { schemaVersion: 1, type: 'person', data: { name: nome } }, id),
    'person',
  )
  return id
}

describe('duas contas no mesmo aparelho', () => {
  it('permite criar a segunda conta sem apagar a primeira', async () => {
    const banco = novoBanco()

    const a = await registerAccount(CONTA_A.email, CONTA_A.senha, banco)
    const b = await registerAccount(CONTA_B.email, CONTA_B.senha, banco)

    expect(a.account.id).not.toBe(b.account.id)
    expect((await listLocalAccounts(banco)).map(({ email }) => email)).toEqual([CONTA_A.email, CONTA_B.email])
  })

  it('recusa repetir o mesmo e-mail neste aparelho', async () => {
    const banco = novoBanco()
    await registerAccount(CONTA_A.email, CONTA_A.senha, banco)

    await expect(registerAccount(CONTA_A.email, CONTA_A.senha, banco)).rejects.toThrow('já existe neste aparelho')
  })

  it('guarda um cofre por conta, sem uma sobrescrever a outra', async () => {
    const banco = novoBanco()
    const a = await registerAccount(CONTA_A.email, CONTA_A.senha, banco)
    const b = await registerAccount(CONTA_B.email, CONTA_B.senha, banco)

    expect(await banco.keyEnvelopes.get(keyEnvelopeId(a.account.id, 'password'))).toBeDefined()
    expect(await banco.keyEnvelopes.get(keyEnvelopeId(b.account.id, 'password'))).toBeDefined()
    expect(await banco.keyEnvelopes.where('accountId').equals(a.account.id).count()).toBe(2)
  })

  // Compartilhar um identificador ligaria as duas contas ao mesmo aparelho.
  it('dá a cada conta o próprio identificador de aparelho', async () => {
    const banco = novoBanco()
    const a = await registerAccount(CONTA_A.email, CONTA_A.senha, banco)
    const b = await registerAccount(CONTA_B.email, CONTA_B.senha, banco)

    expect(currentDeviceId(a.account.id)).not.toBe(currentDeviceId(b.account.id))
    expect(await banco.devices.where('accountId').equals(a.account.id).count()).toBe(1)
    expect(await banco.devices.where('accountId').equals(b.account.id).count()).toBe(1)
  })

  it('nunca mostra o registro de uma conta na outra', async () => {
    const banco = novoBanco()
    const a = await registerAccount(CONTA_A.email, CONTA_A.senha, banco)
    const b = await registerAccount(CONTA_B.email, CONTA_B.senha, banco)
    await guardarRegistro(banco, a.account.id, a.masterKey, 'Pessoa Fictícia da Conta A')
    await guardarRegistro(banco, b.account.id, b.masterKey, 'Pessoa Fictícia da Conta B')

    const repositorio = new VaultRepository(banco)
    const deA = await repositorio.list(a.account.id, 'person')
    const deB = await repositorio.list(b.account.id, 'person')

    expect(deA).toHaveLength(1)
    expect(deB).toHaveLength(1)
    expect(deA[0]?.id).not.toBe(deB[0]?.id)
  })

  it('vai e volta entre A, B e A pedindo a senha e mantendo os dados', async () => {
    const banco = novoBanco()
    const a = await registerAccount(CONTA_A.email, CONTA_A.senha, banco)
    const registroDeA = await guardarRegistro(banco, a.account.id, a.masterKey, 'Pessoa Fictícia da Conta A')
    const b = await registerAccount(CONTA_B.email, CONTA_B.senha, banco)
    await guardarRegistro(banco, b.account.id, b.masterKey, 'Pessoa Fictícia da Conta B')

    // volta para A informando a senha dela
    const voltaParaA = await unlockAccount(CONTA_A.email, CONTA_A.senha, banco)

    expect(voltaParaA.account.id).toBe(a.account.id)
    const registros = await new VaultRepository(banco).list(a.account.id, 'person')
    expect(registros.map(({ id }) => id)).toEqual([registroDeA])
  })

  it('não abre a conta A com a senha da conta B', async () => {
    const banco = novoBanco()
    await registerAccount(CONTA_A.email, CONTA_A.senha, banco)
    await registerAccount(CONTA_B.email, CONTA_B.senha, banco)

    await expect(unlockAccount(CONTA_A.email, CONTA_B.senha, banco)).rejects.toThrow()
  })
})
