import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BackupService } from '../backup/service'
import { decryptPayload, encryptPayload } from '../crypto/vault'
import { ApoioDatabase } from '../db/database'
import { VaultRepository } from '../db/repository'
import { SyncService } from '../sync/service'
import { LocalDevelopmentTransport } from '../sync/transport'
import type { EncryptedOperation, PullResult, PushResult, SyncTransport } from '../sync/types'
import { currentDeviceId } from './device'
import { registerAccount, unlockAccount } from './vaultSession'

vi.mock('./supabase', async (importarOriginal) => ({
  ...await importarOriginal<Record<string, unknown>>(),
  hasSupabaseConfiguration: false,
  ensureRemoteDevice: vi.fn(() => Promise.resolve()),
  storeRemotePasswordEnvelope: vi.fn(() => Promise.resolve()),
  storeRemoteRecoveryEnvelope: vi.fn(() => Promise.resolve()),
}))

const CONTA_A = { email: 'auditoria.a@example.invalid', senha: 'senha-ficticia-auditoria-a-2026' }
const CONTA_B = { email: 'auditoria.b@example.invalid', senha: 'senha-ficticia-auditoria-b-2026' }
const NOME_A = 'Pessoa Fictícia Alfa'
const NOME_B = 'Pessoa Fictícia Beta'

class TransporteCapturado implements SyncTransport {
  readonly name = 'local-development' as const
  enviadas: EncryptedOperation[] = []
  push(operations: EncryptedOperation[]): Promise<PushResult> {
    this.enviadas = [...this.enviadas, ...operations]
    return Promise.resolve({ acceptedIds: operations.map(({ id }) => id), conflicts: [] })
  }
  pull(_ownerId: string, cursor: string | null): Promise<PullResult> { return Promise.resolve({ operations: [], cursor }) }
}

const bancos: ApoioDatabase[] = []
beforeEach(() => localStorage.clear())
afterEach(async () => { localStorage.clear(); await Promise.all(bancos.splice(0).map((banco) => banco.delete())) })

function novoBanco(prefixo: string) {
  const banco = new ApoioDatabase(`${prefixo}-${crypto.randomUUID()}`)
  bancos.push(banco)
  return banco
}

async function gravarPessoa(banco: ApoioDatabase, accountId: string, chave: CryptoKey, nome: string) {
  const id = crypto.randomUUID()
  await new VaultRepository(banco).saveEncrypted(
    accountId, currentDeviceId(accountId), id,
    await encryptPayload(chave, { schemaVersion: 1, type: 'person', data: { name: nome } }, id),
    'person',
  )
  return id
}

/** Duas contas fictícias no mesmo aparelho, cada uma com um registro próprio. */
async function duasContas() {
  const banco = novoBanco('isolamento')
  const a = await registerAccount(CONTA_A.email, CONTA_A.senha, banco)
  const registroA = await gravarPessoa(banco, a.account.id, a.masterKey, NOME_A)
  const b = await registerAccount(CONTA_B.email, CONTA_B.senha, banco)
  const registroB = await gravarPessoa(banco, b.account.id, b.masterKey, NOME_B)
  return { banco, a, b, registroA, registroB }
}

// Cada cenário cria duas contas de verdade, e a derivação de senha é lenta de
// propósito (600 mil iterações). O tempo maior é do teste, não do aplicativo.
describe('auditoria de isolamento entre duas contas fictícias', { timeout: 30_000 }, () => {
  it('cada conta lê apenas os próprios registros', async () => {
    const { banco, a, b, registroA, registroB } = await duasContas()
    const repositorio = new VaultRepository(banco)

    expect((await repositorio.list(a.account.id, 'person')).map(({ id }) => id)).toEqual([registroA])
    expect((await repositorio.list(b.account.id, 'person')).map(({ id }) => id)).toEqual([registroB])
    expect((await repositorio.list(a.account.id)).map(({ id }) => id)).not.toContain(registroB)
    expect((await repositorio.list(b.account.id)).map(({ id }) => id)).not.toContain(registroA)
  })

  // Mesmo alcançando a linha, a chave da outra conta não abre o conteúdo.
  it('a chave de uma conta não abre o conteúdo da outra', async () => {
    const { banco, a, b, registroA } = await duasContas()
    const guardado = await banco.vaultRecords.get(registroA)

    expect(guardado).toBeDefined()
    await expect(decryptPayload(b.masterKey, guardado!)).rejects.toThrow()
    await expect(decryptPayload(a.masterKey, guardado!)).resolves.toMatchObject({ data: { name: NOME_A } })
    expect(JSON.stringify(await banco.vaultRecords.toArray())).not.toContain(NOME_A)
  })

  it('a fila de envio de uma conta nunca leva operações da outra', async () => {
    const { banco, a, b } = await duasContas()
    const transporte = new TransporteCapturado()

    await new SyncService(transporte, banco).synchronize(b.account.id, currentDeviceId(b.account.id))

    expect(transporte.enviadas.length).toBeGreaterThan(0)
    expect(transporte.enviadas.every((operacao) => operacao.ownerId === b.account.id)).toBe(true)
    expect(transporte.enviadas.some((operacao) => operacao.ownerId === a.account.id)).toBe(false)
    expect(JSON.stringify(transporte.enviadas)).not.toContain(NOME_A)
    expect(JSON.stringify(transporte.enviadas)).not.toContain(NOME_B)
  })

  it('não recebe operação que pertence a outra conta', async () => {
    const { banco, a, b } = await duasContas()
    const transporte = new LocalDevelopmentTransport()
    const [daContaA] = await banco.outbox.where('accountId').equals(a.account.id).toArray()
    const registro = await banco.vaultRecords.get(daContaA!.recordId)

    await transporte.push([{
      id: daContaA!.id, ownerId: a.account.id, deviceId: daContaA!.deviceId, recordId: daContaA!.recordId,
      operation: 'upsert', baseVersion: 0, recordVersion: 1, schemaVersion: 1,
      payload: { algorithm: registro!.algorithm, ciphertext: registro!.ciphertext, iv: registro!.iv, aad: registro!.aad, keyVersion: registro!.keyVersion },
      createdAt: new Date().toISOString(),
    }])

    const recebidas = await transporte.pull(b.account.id, null)
    expect(recebidas.operations).toEqual([])
  })

  it('o backup de uma conta não restaura na outra', async () => {
    const { banco, a, b } = await duasContas()
    const destino = novoBanco('isolamento-destino')
    const { file } = await new BackupService(banco).create(a.account.id, a.masterKey, 'codigo-ficticio-auditoria')

    await expect(new BackupService(destino).restore(b.account.id, b.masterKey, 'codigo-ficticio-auditoria', file)).rejects.toThrow('outra conta')
    expect(await destino.vaultRecords.count()).toBe(0)
  })

  it('a senha de uma conta não abre a outra, e cada conta tem seu aparelho', async () => {
    const { banco, a, b } = await duasContas()

    await expect(unlockAccount(CONTA_A.email, CONTA_B.senha, banco)).rejects.toThrow()
    expect(currentDeviceId(a.account.id)).not.toBe(currentDeviceId(b.account.id))

    const voltaParaA = await unlockAccount(CONTA_A.email, CONTA_A.senha, banco)
    expect(voltaParaA.account.id).toBe(a.account.id)
    expect((await new VaultRepository(banco).list(a.account.id, 'person')).length).toBe(1)
  })
})
