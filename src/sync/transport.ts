import { getSupabaseClient, hasSupabaseConfiguration } from '../auth/supabase'
import { falhaRemota } from '../auth/remoteErrors'
import { isSyncDisabled } from './config'
import type { EncryptedOperation, PullResult, PushResult, SyncTransport } from './types'

const developmentRemote = new Map<string, EncryptedOperation>()
let developmentSeq = 0
const developmentOrder = new Map<string, number>()

/** Página de download. O serviço ainda aplica o próprio teto. */
export const PAGE_SIZE = 200
/** Lote de envio. O serviço recusa lotes maiores. */
export const BATCH_SIZE = 200

/**
 * O cursor passou a ser a ordem de chegada atribuída pelo servidor.
 *
 * Antes era o carimbo de tempo escrito pelo próprio aparelho, e isso custava
 * dados: um relógio adiantado empurrava o cursor dos outros para o futuro, e um
 * aparelho que ficou offline mandava operações com carimbo antigo que ninguém
 * mais baixava. Cursor antigo (com `|` ou não numérico) é tratado como início:
 * rebaixar tudo de novo é idempotente e sempre melhor do que pular registro.
 */
export function cursorSeq(cursor: string | null): number {
  if (!cursor) return 0
  const valor = Number(cursor)
  if (!Number.isInteger(valor) || valor < 0) return 0
  return valor
}

export class DisabledSyncTransport implements SyncTransport {
  readonly name = 'disabled' as const
  push(): Promise<PushResult> { return Promise.reject(new Error('A sincronização está desativada neste ambiente local.')) }
  pull(): Promise<PullResult> { return Promise.reject(new Error('A sincronização está desativada neste ambiente local.')) }
}

export class LocalDevelopmentTransport implements SyncTransport {
  readonly name = 'local-development' as const

  push(operations: EncryptedOperation[]): Promise<PushResult> {
    const aceitos: string[] = []
    for (const operation of operations) {
      // Mesma regra do serviço: reenviar o mesmo identificador não reescreve.
      if (!developmentRemote.has(operation.id)) {
        developmentSeq += 1
        developmentRemote.set(operation.id, structuredClone(operation))
        developmentOrder.set(operation.id, developmentSeq)
      }
      aceitos.push(operation.id)
    }
    return Promise.resolve({ acceptedIds: aceitos, conflicts: [] })
  }

  pull(ownerId: string, cursor: string | null): Promise<PullResult> {
    const desde = cursorSeq(cursor)
    const todas = [...developmentRemote.values()]
      .filter((operation) => operation.ownerId === ownerId && (developmentOrder.get(operation.id) ?? 0) > desde)
      .sort((left, right) => (developmentOrder.get(left.id) ?? 0) - (developmentOrder.get(right.id) ?? 0))
    const operations = todas.slice(0, PAGE_SIZE)
    const ultima = operations.at(-1)
    return Promise.resolve({
      operations,
      cursor: ultima ? String(developmentOrder.get(ultima.id)) : cursor,
      hasMore: todas.length > operations.length,
    })
  }
}

interface SupabaseOperationRow {
  seq: number
  id: string
  owner_id: string
  device_id: string
  record_id: string
  operation: 'upsert' | 'delete'
  base_version: number
  record_version: number
  schema_version: number
  ciphertext: string
  iv: string
  aad: string
  key_version: number
  mac: string | null
  mac_version: number
  created_at: string
}

function toPayload(operation: EncryptedOperation) {
  return {
    id: operation.id,
    record_id: operation.recordId,
    operation: operation.operation,
    base_version: operation.baseVersion,
    record_version: operation.recordVersion,
    schema_version: operation.schemaVersion,
    ciphertext: operation.payload.ciphertext,
    iv: operation.payload.iv,
    aad: operation.payload.aad,
    key_version: operation.payload.keyVersion,
    mac: operation.mac ?? null,
    mac_version: operation.macVersion ?? 1,
    created_at: operation.createdAt,
  }
}

function fromRow(row: SupabaseOperationRow): EncryptedOperation {
  return {
    id: row.id,
    ownerId: row.owner_id,
    deviceId: row.device_id,
    recordId: row.record_id,
    operation: row.operation,
    baseVersion: row.base_version,
    recordVersion: row.record_version,
    schemaVersion: row.schema_version,
    payload: {
      algorithm: 'AES-GCM-256',
      ciphertext: row.ciphertext,
      iv: row.iv,
      aad: row.aad,
      keyVersion: row.key_version,
    },
    createdAt: row.created_at,
    ...(row.mac ? { mac: row.mac } : {}),
    macVersion: row.mac_version,
  }
}

/**
 * Envio e recebimento passam por funções do serviço, não pela tabela.
 *
 * É lá que o servidor decide de qual aparelho a operação veio, em que ordem
 * ela entrou e se aquele aparelho ainda está autorizado. Nada disso pode vir
 * do corpo da requisição, que é escrito pelo cliente.
 */
export class SupabaseSyncTransport implements SyncTransport {
  readonly name = 'supabase' as const

  async push(operations: EncryptedOperation[]): Promise<PushResult> {
    if (operations.length === 0) return { acceptedIds: [], conflicts: [] }
    const aceitos: string[] = []
    for (let inicio = 0; inicio < operations.length; inicio += BATCH_SIZE) {
      const lote = operations.slice(inicio, inicio + BATCH_SIZE)
      // O serviço devolve o que gravou agora; o que já estava lá não volta na
      // lista, e mesmo assim está entregue. Por isso o lote inteiro conta.
      const resposta = await getSupabaseClient().rpc('upload_operations', { p_ops: lote.map(toPayload) })
      if (resposta.error) throw falhaRemota(resposta.error, 'Falha técnica ao enviar alterações cifradas.')
      aceitos.push(...lote.map(({ id }) => id))
    }
    return { acceptedIds: aceitos, conflicts: [] }
  }

  async pull(ownerId: string, cursor: string | null): Promise<PullResult> {
    const resposta = await getSupabaseClient().rpc('download_operations', {
      p_after: cursorSeq(cursor),
      p_limit: PAGE_SIZE,
    })
    if (resposta.error) throw falhaRemota(resposta.error, 'Falha técnica ao receber alterações cifradas.')
    const linhas = (resposta.data ?? []) as SupabaseOperationRow[]
    const operations = linhas.map(fromRow)
    const ultima = linhas.at(-1)
    return {
      operations,
      cursor: ultima ? String(ultima.seq) : cursor,
      hasMore: linhas.length === PAGE_SIZE,
    }
  }
}

export function createSyncTransport(): SyncTransport {
  if (isSyncDisabled) return new DisabledSyncTransport()
  return hasSupabaseConfiguration ? new SupabaseSyncTransport() : new LocalDevelopmentTransport()
}

/** Limpa a memória do transporte local. Só usado em teste. */
export function resetLocalDevelopmentTransport(): void {
  developmentRemote.clear()
  developmentOrder.clear()
  developmentSeq = 0
}
