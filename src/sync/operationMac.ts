import { fromBase64Url, toBase64Url, utf8 } from '../crypto/encoding'
import type { EncryptedOperation } from './types'

/**
 * Versão 3: a assinatura passou a cobrir todo metadado que muda o resultado.
 *
 * O texto cifrado sempre esteve amarrado ao registro e ao formato pelo AAD, mas
 * o resto viajava solto — de qual conta a operação era, se era gravação ou
 * exclusão, em cima de qual versão ela foi feita. A versão 2 fechou isso e
 * deixou duas frestas: o identificador da operação e o carimbo de tempo.
 *
 * Nenhum dos dois é decorativo. O carimbo vira `createdAt`, `updatedAt` e
 * `deletedAt` do registro guardado neste aparelho: quem controlasse o serviço
 * podia reescrever a data de uma visita ou de uma exclusão sem quebrar a
 * assinatura. O identificador é a chave de idempotência, de conflito e de
 * quarentena: repetir a mesma operação assinada com outro identificador
 * multiplicava conflitos que o pastor teria de revisar um por um.
 */
export const MAC_VERSION = 3

/**
 * O que entra na assinatura. A ordem é fixa porque o valor precisa ser o mesmo
 * nos dois lados; o texto cifrado entra junto para que assinatura e conteúdo
 * não possam ser recombinados de operações diferentes.
 *
 * `deviceId` fica de fora de propósito: ele é atribuído pelo servidor a partir
 * da sessão, não pelo aparelho que assina, então assiná-lo aqui só produziria
 * assinaturas que nunca conferem na volta.
 */
function corpo(operation: EncryptedOperation): Uint8Array<ArrayBuffer> {
  return utf8(JSON.stringify([
    MAC_VERSION,
    operation.id,
    operation.ownerId,
    operation.recordId,
    operation.operation,
    operation.baseVersion,
    operation.recordVersion,
    operation.schemaVersion,
    operation.createdAt,
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
