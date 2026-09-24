/**
 * Quarentena dos registros cifrados que não abrem neste aparelho.
 *
 * Antes existia um conjunto na memória: a contagem sumia a cada recarregamento
 * e — pior — cada leitura em lote chamava `decryptPayload`, que levanta
 * exceção. Um único registro corrompido derrubava a criação do backup, a
 * exportação dos dados de uma pessoa, o encerramento do distrito e as
 * listagens inteiras. Para o pastor, isso é indistinguível de ter perdido tudo.
 *
 * Aqui o registro ruim é gravado de lado, com conta, tipo e versão, e a leitura
 * devolve `null`. Quem chama pula aquele registro e segue com os íntegros. Se
 * a versão mudar — uma sincronização trouxe outra, um backup foi restaurado —
 * a linha sai da quarentena sozinha na leitura seguinte.
 */

import { decryptPayload } from '../crypto/vault'
import type { CipherEnvelope, VaultPayload } from '../crypto/types'
import { db, type ApoioDatabase } from './database'
import { corruptedRecordId, type CorruptedRecordRecord, type VaultRecord } from './types'

/**
 * O que a quarentena precisa saber de um registro.
 *
 * `version` é opcional porque o Orçamento Familiar e a Leitura guardam em
 * bancos próprios, sem coluna de versão. Ali a saída da quarentena acontece
 * pela leitura seguinte dar certo, não pela versão ter mudado.
 */
export type RegistroParaQuarentena = Pick<VaultRecord, 'id' | 'accountId'> & { recordType: string; version?: number }

/** Um registro cifrado que a quarentena sabe identificar e abrir. */
export type RegistroCifrado = RegistroParaQuarentena & CipherEnvelope

export async function quarantineCorruptedRecord(
  record: RegistroParaQuarentena,
  reason: CorruptedRecordRecord['reason'],
  database: ApoioDatabase = db,
): Promise<void> {
  await database.corruptedRecords.put({
    id: corruptedRecordId(record.accountId, record.id),
    accountId: record.accountId,
    recordId: record.id,
    recordType: record.recordType,
    version: record.version ?? 0,
    detectedAt: new Date().toISOString(),
    reason,
  })
}

/** Tira da quarentena um registro que voltou a abrir. */
export async function forgetCorruptedRecord(
  accountId: string,
  recordId: string,
  database: ApoioDatabase = db,
): Promise<void> {
  await database.corruptedRecords.delete(corruptedRecordId(accountId, recordId))
}

/** Registros em quarentena desta conta, para a tela avisar sem esconder nada. */
export async function listCorruptedRecords(accountId: string, database: ApoioDatabase = db): Promise<CorruptedRecordRecord[]> {
  return (await database.corruptedRecords.where('accountId').equals(accountId).toArray())
    .sort((esquerda, direita) => esquerda.detectedAt.localeCompare(direita.detectedAt))
}

export async function countCorruptedRecords(accountId: string, database: ApoioDatabase = db): Promise<number> {
  return database.corruptedRecords.where('accountId').equals(accountId).count()
}


/**
 * Abre um registro guardado ou devolve `null` depois de colocá-lo de lado.
 *
 * É a única forma de decifrar um `VaultRecord` em leitura de lista, backup,
 * exportação ou encerramento. `decryptPayload` continua existindo para quem
 * precisa da exceção — a gravação, por exemplo, em que abrir errado é motivo
 * para parar.
 */
export async function readPayload(
  key: CryptoKey,
  record: RegistroCifrado,
  database: ApoioDatabase = db,
): Promise<VaultPayload | null> {
  try {
    const payload = await decryptPayload(key, record)
    // Só apaga quando havia o que apagar: a leitura de lista passa por aqui
    // registro a registro, e uma gravação por linha íntegra custaria caro.
    if (await database.corruptedRecords.get(corruptedRecordId(record.accountId, record.id))) {
      await forgetCorruptedRecord(record.accountId, record.id, database)
    }
    return payload
  } catch (motivo) {
    const vinculo = motivo instanceof Error && motivo.message.startsWith('Registro não confere')
    await quarantineCorruptedRecord(record, vinculo ? 'vinculo' : 'nao-abriu', database)
    return null
  }
}

/**
 * Abre uma lista inteira, pulando o que não abriu. Devolve também quantos
 * ficaram de fora, para quem chama poder dizer isso na tela em vez de
 * apresentar uma lista curta sem explicação.
 */
export async function readPayloads<T extends RegistroCifrado>(
  key: CryptoKey,
  records: readonly T[],
  database: ApoioDatabase = db,
): Promise<{ opened: Array<{ record: T; payload: VaultPayload }>; skipped: T[] }> {
  const opened: Array<{ record: T; payload: VaultPayload }> = []
  const skipped: T[] = []
  for (const record of records) {
    const payload = await readPayload(key, record, database)
    if (payload) opened.push({ record, payload })
    else skipped.push(record)
  }
  return { opened, skipped }
}
