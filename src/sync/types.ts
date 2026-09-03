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
  /** Autenticação dos metadados desta operação, conferida ao receber. */
  mac?: string
  macVersion?: number
}

export interface PullResult {
  operations: EncryptedOperation[]
  cursor: string | null
  /** Verdadeiro quando o serviço ainda tem páginas depois desta. */
  hasMore?: boolean
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
  /** Operações recebidas que não passaram na conferência e ficaram de lado. */
  quarantined: number
  /**
   * Verdadeiro quando o serviço ainda tinha alterações e a sincronização parou
   * no teto de páginas. O cursor já está guardado: sincronizar de novo continua
   * de onde parou. Sem este aviso, o aparelho dizia "em dia" com dados faltando.
   */
  incomplete: boolean
  /**
   * Verdadeiro quando ainda há registros esperando o expurgo do histórico no
   * serviço.
   *
   * Uma exclusão de pessoa só está concluída quando o passado dela sai também
   * do serviço. Enquanto isso não acontece, a rodada não pode ser anunciada
   * como sucesso: o pastor leria "tudo sincronizado" com o histórico do que ele
   * mandou apagar ainda guardado do outro lado.
   */
  purgePending: boolean
  /** Verdadeiro quando a fila de envio não coube inteira nesta rodada. */
  pushPending: boolean
}
