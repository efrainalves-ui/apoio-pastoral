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
 * `macVersion` entra por completude: a versão já estava presa ao valor pela
 * constante, e assinar o campo declarado impede que ele seja reescrito no
 * caminho para forçar uma leitura diferente da mesma assinatura.
 *
 * `deviceId` fica de fora, e isto é uma limitação declarada, não um descuido:
 *
 * 1. Quem atribui o campo é o servidor, a partir da sessão autenticada — o
 *    valor que o aparelho envia no corpo é ignorado de propósito, porque
 *    acreditar nele foi um buraco que já se fechou. Assinar o valor enviado
 *    produziria assinaturas que não conferem sempre que o servidor decidisse
 *    diferente, e é justamente ele quem decide.
 * 2. Depois de encerrar um distrito, o aparelho recebe um identificador novo
 *    enquanto a fila ainda guarda operações assinadas com o antigo. Assinar o
 *    campo mandaria toda essa fila para a quarentena.
 * 3. O campo não decide nada em `aplicar`: a origem não altera conteúdo,
 *    linhagem, versão nem exclusão. Ele é informativo.
 *
 * A limitação real, então, é esta: quem controlasse o serviço poderia atribuir
 * uma operação ao aparelho errado. Isso não muda o que é aplicado nem abre o
 * conteúdo — muda apenas de qual aparelho o registro parece ter vindo. A conta,
 * o registro, a versão, a linhagem, o tipo de operação, o carimbo e o texto
 * cifrado continuam todos assinados.
 */
/**
 * O instante, não a grafia dele.
 *
 * Este aparelho assina `2026-09-04T03:29:51.621Z`; o banco guarda o mesmo
 * instante e devolve `2026-09-04T03:29:51.621+00:00`. São o mesmo momento no
 * tempo escrito de dois jeitos, e a assinatura comparava os textos — então
 * **toda** operação que voltava do serviço era recusada e ia para a quarentena.
 * Não havia ataque nem corrupção: a assinatura estava protegendo a formatação
 * em vez do significado, e por isso reprovava justamente o que era legítimo.
 *
 * Normalizar aqui não afrouxa nada. Dois instantes diferentes continuam
 * produzindo corpos diferentes; o que deixa de existir é a diferença que só
 * existia no papel. Valor que não é data reconhecível segue cru de propósito:
 * inventar uma normalização para lixo transformaria entradas distintas na
 * mesma assinatura.
 *
 * A versão da assinatura não muda com isto — o corpo calculado para um dado
 * bem-formado é idêntico ao que já era assinado na saída. Operações já enviadas
 * passam a conferir, em vez de precisarem ser reenviadas.
 */
function instante(valor: string): string {
  const data = new Date(valor)
  return Number.isNaN(data.getTime()) ? valor : data.toISOString()
}

function corpo(operation: EncryptedOperation): Uint8Array<ArrayBuffer> {
  return utf8(JSON.stringify([
    MAC_VERSION,
    operation.macVersion ?? MAC_VERSION,
    operation.id,
    operation.ownerId,
    operation.recordId,
    operation.operation,
    operation.baseVersion,
    operation.recordVersion,
    operation.schemaVersion,
    instante(operation.createdAt),
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
