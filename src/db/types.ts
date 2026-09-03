import type { CipherEnvelope, PasswordKeyEnvelope, RecoveryKeyEnvelope } from '../crypto/types'

export interface AccountRecord {
  id: string
  email: string
  createdAt: string
  authMode: 'local-development' | 'supabase'
}

export type KeyEnvelopeKind = 'password' | 'recovery'

export interface KeyEnvelopeRecord {
  /** `${accountId}:${kind}` — mais de uma conta pode viver no mesmo aparelho. */
  id: string
  kind: KeyEnvelopeKind
  accountId: string
  envelope: PasswordKeyEnvelope | RecoveryKeyEnvelope
  updatedAt: string
  /**
   * Este envelope ainda precisa subir para o serviço.
   *
   * A troca de senha muda a senha do serviço e o envelope que a acompanha. Se
   * o segundo passo falha e o primeiro não volta atrás, a conta fica com a
   * senha nova e o envelope antigo: um aparelho novo entraria e não abriria o
   * cofre. A pendência marca isso e a próxima entrada com rede conclui.
   */
  pendingRemote?: boolean
}

export function keyEnvelopeId(accountId: string, kind: KeyEnvelopeKind): string {
  return `${accountId}:${kind}`
}

export interface DeviceRecord {
  id: string
  accountId: string
  label: string
  status: 'active' | 'revoked' | 'pending'
  createdAt: string
  lastSeenAt: string
  revokedAt?: string
}

export interface VaultRecord extends CipherEnvelope {
  id: string
  accountId: string
  recordType: 'foundation_fixture' | 'district' | 'church' | 'person' | 'family' | 'import_batch' | 'agenda_event' | 'sermon' | 'goal' | 'goal_entry' | 'goal_history' | 'visit' | 'prayer_request' | 'follow_up' | 'task' | 'visit_round' | 'interest' | 'bible_study' | 'missionary_pair' | 'sabbath_class' | 'small_group' | 'uapg' | 'commission_config' | 'commission_meeting' | 'commission_task' | 'nomination_process' | 'annual_goal' | 'evangelism_campaign' | 'encrypted'
  version: number
  createdAt: string
  updatedAt: string
  deletedAt?: string
}

export interface OutboxRecord {
  id: string
  accountId: string
  deviceId: string
  recordId: string
  operation: 'upsert' | 'delete'
  baseVersion: number
  recordVersion: number
  payload: CipherEnvelope
  schemaVersion: number
  status: 'pending' | 'sending' | 'failed'
  attemptCount: number
  createdAt: string
  lastAttemptAt?: string
}

export interface SyncStateRecord {
  accountId: string
  cursor: string | null
  lastSyncedAt: string | null
  /**
   * Quando a primeira sincronização completa terminou neste aparelho. Enquanto
   * for nulo, "nenhum dado" significa "ainda não recebemos", nunca "a conta
   * está vazia" — a diferença entre esperar e criar um distrito duplicado.
   */
  firstSyncAt?: string | null
}

/**
 * Operação recebida que não passou na conferência: assinatura inválida,
 * conteúdo que não abre ou linhagem que não bate. Fica guardada como veio, sem
 * ser aplicada, para poder ser examinada depois sem contaminar os dados.
 */
export interface QuarantinedOperationRecord {
  id: string
  accountId: string
  recordId: string
  reason: 'assinatura' | 'conteudo' | 'conta'
  operation: 'upsert' | 'delete'
  recordVersion: number
  baseVersion: number
  payload: CipherEnvelope
  createdAt: string
}

export interface SyncConflictRecord {
  id: string
  accountId: string
  recordId: string
  localVersion: number
  remoteVersion: number
  remoteOperation: 'upsert' | 'delete'
  remotePayload: CipherEnvelope
  createdAt: string
  status: 'pending' | 'resolved'
  /** Escolha do pastor ao resolver; a versão preterida continua guardada aqui. */
  choice?: 'keep_local' | 'keep_remote' | 'keep_both'
  resolvedAt?: string
  localPayload?: CipherEnvelope
  keptRecordId?: string
}

export interface MigrationRecord {
  id: string
  version: number
  appliedAt: string
  checksum: string
}
