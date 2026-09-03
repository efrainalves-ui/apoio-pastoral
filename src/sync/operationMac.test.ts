import { describe, expect, it } from 'vitest'
import { generateVaultKeys } from '../crypto/vault'
import { MAC_VERSION, operationMacIsValid, signOperation, withOperationMac } from './operationMac'
import type { EncryptedOperation } from './types'

/**
 * Nenhuma destas provas usa conteúdo pastoral: o texto cifrado é inventado e o
 * ponto é o metadado que viaja ao lado dele.
 */
function operacaoFicticia(): EncryptedOperation {
  return {
    id: '11111111-0000-4000-8000-000000000001',
    ownerId: '22222222-0000-4000-8000-000000000002',
    deviceId: '33333333-0000-4000-8000-000000000003',
    recordId: '44444444-0000-4000-8000-000000000004',
    operation: 'upsert',
    baseVersion: 1,
    recordVersion: 2,
    schemaVersion: 1,
    payload: { algorithm: 'AES-GCM-256', ciphertext: 'cifra-ficticia', iv: 'iv-ficticio', aad: 'aad-ficticio', keyVersion: 1 },
    createdAt: '2026-09-01T12:00:00.000Z',
  }
}

describe('assinatura dos metadados da sincronização', () => {
  it('aceita a operação que voltou inteira do serviço', async () => {
    const { sync } = await generateVaultKeys()
    const assinada = await withOperationMac(sync, operacaoFicticia())

    expect(assinada.macVersion).toBe(MAC_VERSION)
    expect(await operationMacIsValid(sync, assinada)).toBe(true)
  })

  it.each([
    ['o identificador da operação', { id: '99999999-0000-4000-8000-000000000009' }],
    ['o carimbo de tempo', { createdAt: '2020-01-01T00:00:00.000Z' }],
    ['a conta dona', { ownerId: '99999999-0000-4000-8000-000000000009' }],
    ['o registro', { recordId: '99999999-0000-4000-8000-000000000009' }],
    ['o tipo de operação', { operation: 'delete' as const }],
    ['a versão-base', { baseVersion: 0 }],
    ['a versão do registro', { recordVersion: 9 }],
    ['a versão do esquema', { schemaVersion: 2 }],
  ])('recusa a operação com %s trocado no caminho', async (_descricao, alteracao) => {
    const { sync } = await generateVaultKeys()
    const assinada = await withOperationMac(sync, operacaoFicticia())

    expect(await operationMacIsValid(sync, { ...assinada, ...alteracao })).toBe(false)
  })

  it('recusa o texto cifrado trocado por outro', async () => {
    const { sync } = await generateVaultKeys()
    const assinada = await withOperationMac(sync, operacaoFicticia())
    const trocada = { ...assinada, payload: { ...assinada.payload, ciphertext: 'outra-cifra-ficticia' } }

    expect(await operationMacIsValid(sync, trocada)).toBe(false)
  })

  it('recusa operação sem assinatura e assinatura de versão anterior', async () => {
    const { sync } = await generateVaultKeys()
    const assinada = await withOperationMac(sync, operacaoFicticia())

    expect(await operationMacIsValid(sync, { ...assinada, mac: undefined })).toBe(false)
    expect(await operationMacIsValid(sync, { ...assinada, macVersion: MAC_VERSION - 1 })).toBe(false)
  })

  it('recusa a assinatura feita com a chave de outra conta', async () => {
    const primeira = await generateVaultKeys()
    const segunda = await generateVaultKeys()
    const assinada = await withOperationMac(primeira.sync, operacaoFicticia())

    expect(await operationMacIsValid(segunda.sync, assinada)).toBe(false)
  })

  it('não reaproveita a assinatura de uma operação em outra', async () => {
    const { sync } = await generateVaultKeys()
    const primeira = operacaoFicticia()
    const segunda = { ...primeira, id: '55555555-0000-4000-8000-000000000005' }
    const mac = await signOperation(sync, primeira)

    expect(await operationMacIsValid(sync, { ...segunda, mac, macVersion: MAC_VERSION })).toBe(false)
  })
})
