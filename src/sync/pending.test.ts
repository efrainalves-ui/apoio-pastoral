import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { ApoioDatabase } from '../db/database'
import { countPendingChanges, pendingLabel } from './pending'

const bancos: ApoioDatabase[] = []
afterEach(async () => { await Promise.all(bancos.splice(0).map((banco) => banco.delete())) })

function novoBanco() {
  const banco = new ApoioDatabase(`pendentes-${crypto.randomUUID()}`)
  bancos.push(banco)
  return banco
}

const naFila = (accountId: string, status: 'pending' | 'sending' | 'failed') => ({
  id: crypto.randomUUID(), accountId, deviceId: 'aparelho-ficticio', recordId: crypto.randomUUID(),
  operation: 'upsert' as const, baseVersion: 0, recordVersion: 1, schemaVersion: 1,
  payload: { algorithm: 'AES-GCM-256' as const, ciphertext: 'x', iv: 'y', aad: 'z', keyVersion: 1 },
  status, attemptCount: 0, createdAt: new Date().toISOString(),
})

describe('alterações aguardando envio', () => {
  it('conta apenas as da própria conta', async () => {
    const banco = novoBanco()
    await banco.outbox.bulkPut([naFila('conta-a', 'pending'), naFila('conta-a', 'failed'), naFila('conta-b', 'pending')])

    expect(await countPendingChanges('conta-a', banco)).toBe(2)
    expect(await countPendingChanges('conta-b', banco)).toBe(1)
    expect(await countPendingChanges('conta-sem-fila', banco)).toBe(0)
  })

  // O que já está subindo não é uma pendência para o pastor resolver.
  it('não conta o que está em envio', async () => {
    const banco = novoBanco()
    await banco.outbox.bulkPut([naFila('conta-a', 'sending')])

    expect(await countPendingChanges('conta-a', banco)).toBe(0)
  })

  it('descreve a fila em uma frase curta', () => {
    expect(pendingLabel(0)).toBe('Tudo enviado')
    expect(pendingLabel(1)).toBe('1 alteração aguardando envio')
    expect(pendingLabel(4)).toBe('4 alterações aguardando envio')
  })
})
