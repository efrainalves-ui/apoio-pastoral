import { fromBase64Url, toBase64Url, utf8 } from '../crypto/encoding'
import type { EncryptedOperation } from './types'

/**
 * Versão 2: os metadados da operação passaram a ser autenticados.
 *
 * O texto cifrado sempre esteve amarrado ao registro e ao formato pelo AAD, mas
 * o resto viajava solto — de qual conta a operação era, se era gravação ou
 * exclusão, em cima de qual versão ela foi feita. Quem controlasse o serviço
 * podia trocar um `upsert` por um `delete`, rebaixar a versão para provocar um
 * conflito ou pendurar a operação em outra conta, e o aparelho que recebia não
 * tinha como perceber. Esta assinatura fecha isso.
 */
export const MAC_VERSION = 2

/**
 * O que entra na assinatura. A ordem é fixa porque o valor precisa ser o mesmo
 * nos dois lados; o texto cifrado entra junto para que assinatura e conteúdo
 * não possam ser recombinados de operações diferentes.
 */
function corpo(operation: EncryptedOperation): Uint8Array<ArrayBuffer> {
  return utf8(JSON.stringify([
    MAC_VERSION,
    operation.ownerId,
    operation.recordId,
    operation.operation,
    operation.baseVersion,
    operation.recordVersion,
    operation.schemaVersion,
    operation.payload.keyVersion,
    operation.payload.ciphertext,
    operation.payload.iv,
    operation.payload.aad,
  ]))
}

export async function signOperation(syncKey: CryptoKey, operation: EncryptedOperation): Promise<string> {
  return toBase64Url(await crypto.subtle.sign('HMAC', syncKey, corpo(operation)))
}

/** Assina uma operação de saída, deixando-a pronta para o envio. */
export async function withOperationMac(syncKey: CryptoKey, operation: EncryptedOperation): Promise<EncryptedOperation> {
  return { ...operation, mac: await signOperation(syncKey, operation), macVersion: MAC_VERSION }
}

/**
 * Confere a assinatura de uma operação recebida. Operação sem assinatura é
 * recusada: aceitar "sem assinatura" como válido devolveria o problema inteiro
 * a quem controlasse o serviço.
 */
export async function operationMacIsValid(syncKey: CryptoKey, operation: EncryptedOperation): Promise<boolean> {
  if (!operation.mac || (operation.macVersion ?? 1) < MAC_VERSION) return false
  try {
    return await crypto.subtle.verify('HMAC', syncKey, fromBase64Url(operation.mac), corpo(operation))
  } catch {
    return false
  }
}
