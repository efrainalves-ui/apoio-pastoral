import { getSupabaseClient, hasSupabaseConfiguration } from '../auth/supabase'
import { isSyncDisabled } from './config'
import type { EncryptedOperation, PullResult, PushResult, SyncTransport } from './types'

const developmentRemote = new Map<string, EncryptedOperation>()

function cursorParts(cursor: string | null): { createdAt: string; id: string } | null {
  if (!cursor) return null
  const separator = cursor.lastIndexOf('|')
  if (separator > 0) return { createdAt: cursor.slice(0, separator), id: cursor.slice(separator + 1) }
  const timestamp = Number(cursor)
  return { createdAt: Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : cursor, id: '' }
}

function operationCursor(operation: EncryptedOperation): string { return `${operation.createdAt}|${operation.id}` }

function afterCursor(operation: EncryptedOperation, cursor: string | null): boolean {
  const parts = cursorParts(cursor)
  if (!parts) return true
  return operation.createdAt > parts.createdAt || (operation.createdAt === parts.createdAt && operation.id > parts.id)
}

export class DisabledSyncTransport implements SyncTransport {
  readonly name = 'disabled' as const
  push(): Promise<PushResult> { return Promise.reject(new Error('A sincronização está desativada neste ambiente local.')) }
  pull(): Promise<PullResult> { return Promise.reject(new Error('A sincronização está desativada neste ambiente local.')) }
}

export class LocalDevelopmentTransport implements SyncTransport {
  readonly name = 'local-development' as const

  push(operations: EncryptedOperation[]): Promise<PushResult> {
    for (const operation of operations) developmentRemote.set(operation.id, structuredClone(operation))
    return Promise.resolve({ acceptedIds: operations.map(({ id }) => id), conflicts: [] })
  }

  pull(ownerId: string, cursor: string | null): Promise<PullResult> {
    const operations = [...developmentRemote.values()]
      .filter((operation) => operation.ownerId === ownerId && afterCursor(operation, cursor))
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id))
    const latest = operations.at(-1)
    return Promise.resolve({ operations, cursor: latest ? operationCursor(latest) : cursor })
  }
}

interface SupabaseOperationRow {
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
  created_at: string
}

function toRow(operation: EncryptedOperation): SupabaseOperationRow {
  return {
    id: operation.id,
    owner_id: operation.ownerId,
    device_id: operation.deviceId,
    record_id: operation.recordId,
    operation: operation.operation,
    base_version: operation.baseVersion,
    record_version: operation.recordVersion,
    schema_version: operation.schemaVersion,
    ciphertext: operation.payload.ciphertext,
    iv: operation.payload.iv,
    aad: operation.payload.aad,
    key_version: operation.payload.keyVersion,
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
  }
}

export class SupabaseSyncTransport implements SyncTransport {
  readonly name = 'supabase' as const

  async push(operations: EncryptedOperation[]): Promise<PushResult> {
    if (operations.length === 0) return { acceptedIds: [], conflicts: [] }
    const { error } = await getSupabaseClient().from('encrypted_operations').upsert(operations.map(toRow), { onConflict: 'id', ignoreDuplicates: true })
    if (error) throw new Error('Falha técnica ao enviar alterações cifradas.')
    return { acceptedIds: operations.map(({ id }) => id), conflicts: [] }
  }

  async pull(ownerId: string, cursor: string | null): Promise<PullResult> {
    let query = getSupabaseClient()
      .from('encrypted_operations')
      .select('*')
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(500)
    const parts = cursorParts(cursor)
    if (parts?.id) query = query.or(`created_at.gt.${parts.createdAt},and(created_at.eq.${parts.createdAt},id.gt.${parts.id})`)
    else if (parts) query = query.gte('created_at', parts.createdAt)
    const { data, error } = await query
    if (error) throw new Error('Falha técnica ao receber alterações cifradas.')
    const operations = (data as SupabaseOperationRow[]).map(fromRow)
    return { operations, cursor: operations.at(-1) ? operationCursor(operations.at(-1)!) : cursor }
  }
}

export function createSyncTransport(): SyncTransport {
  if (isSyncDisabled) return new DisabledSyncTransport()
  return hasSupabaseConfiguration ? new SupabaseSyncTransport() : new LocalDevelopmentTransport()
}
