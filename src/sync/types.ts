import type { CipherEnvelope } from '../crypto/types'

export interface EncryptedOperation {
  id: string
  ownerId: string
  deviceId: string
  recordId: string
  operation: 'upsert' | 'delete'
  baseVersion: number
  recordVersion: number
  schemaVersion: number
  payload: CipherEnvelope
  createdAt: string
}

export interface PullResult {
  operations: EncryptedOperation[]
  cursor: string | null
}

export interface PushResult {
  acceptedIds: string[]
  conflicts: EncryptedOperation[]
}

export interface SyncTransport {
  readonly name: 'disabled' | 'local-development' | 'supabase'
  push(operations: EncryptedOperation[]): Promise<PushResult>
  pull(ownerId: string, cursor: string | null): Promise<PullResult>
}

export interface SyncSummary {
  status: 'synced' | 'offline' | 'empty'
  pushed: number
  pulled: number
  conflicts: number
}
