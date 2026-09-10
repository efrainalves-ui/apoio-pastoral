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
  recordType: 'foundation_fixture' | 'district' | 'church' | 'person' | 'family' | 'import_batch' | 'agenda_event' | 'sermon' | 'goal' | 'goal_entry' | 'goal_history' | 'visit' | 'prayer_request' | 'follow_up' | 'task' | 'visit_round' | 'interest' | 'bible_study' | 'missionary_pair' | 'sabbath_class' | 'small_group' | 'uapg' | 'commission_config' | 'commission_meeting' | 'commission_task' | 'nomination_process' | 'annual_goal' | 'evangelism_campaign' | 'work_allowance' | 'work_expense' | 'mileage' | 'work_config' | 'work_dependent' | 'work_entry' | 'letra_budget' | 'letra_item' | 'letra_acquisition' | 'work_paycheck' | 'material' | 'material_distribution' | 'material_need' | 'acms_report' | 'encrypted'
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
  /**
   * Para qual tamanho de quarentena este aparelho já rebobinou o cursor.
   *
   * Operação que cai na quarentena continua existindo no serviço, mas o cursor
   * já passou por ela e ela nunca mais seria buscada — foi assim que um defeito
   * de assinatura, depois corrigido, deixaria 949 registros parados para sempre
   * naquele aparelho. Rebobinar resolve; rebobinar em toda sincronização faria
   * um download completo por rodada. Guardar o tamanho já tentado é o meio
   * termo: tenta de novo quando a quarentena muda, e para quando não muda.
   */
  quarantineRetryFor?: number
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

/**
 * Trabalho de várias etapas que já começou e precisa terminar, mesmo que o
 * navegador feche no meio.
 *
 * Encerrar um distrito revoga todos os aparelhos e só então dá uma autorização
 * nova a este. Entre uma coisa e outra o aparelho fica sem autorização
 * nenhuma: se o navegador fechasse ali, a conta abria e não entrava mais no
 * serviço, sem nada na tela explicando por quê. Esta marca é o que permite
 * retomar de onde parou.
 */
export type PendingActionKind = 'close_district' | 'purge_history' | 'restore_backup'

/**
 * Etapas do encerramento de distrito e da restauração de backup, na ordem em
 * que acontecem. A marca é gravada **antes** da primeira alteração local, e é
 * ela que diz por onde a retomada continua.
 */
export type PendingActionStage =
  | 'intent'
  | 'tombstones'
  | 'syncing'
  | 'purging'
  | 'revoking'
  | 'reauthorizing'
  | 'restoring_pastoral'
  | 'restoring_personal'

export interface PendingActionRecord {
  /** `${accountId}:${kind}` — uma pendência de cada tipo por conta. */
  id: string
  accountId: string
  kind: PendingActionKind
  createdAt: string
  /** Etapa concluída por último, para a retomada saber por onde continuar. */
  stage?: PendingActionStage
  /**
   * Registros cujo histórico cifrado ainda precisa ser apagado no serviço.
   * A lista vive aqui, e não em memória, porque o expurgo só pode acontecer
   * depois que a lápide subir — o que pode ser em outro dia, com outra rede.
   */
  recordIds?: string[]
  /**
   * Registros à espera de expurgo e a operação que este aparelho publicou para
   * cada um. O serviço só apaga o histórico quando aquela operação ainda é a
   * última do registro — do contrário houve alteração concorrente e a decisão
   * precisa ser tomada de novo.
   */
  purgeTargets?: Array<{ recordId: string; operationId: string }>
  /**
   * Identificador que este aparelho vai adotar ao concluir o encerramento.
   *
   * Fica gravado porque a retomada pode acontecer várias vezes: sortear um
   * novo a cada tentativa deixaria para trás uma fila de aparelhos ativos na
   * conta, um por interrupção.
   */
  newDeviceId?: string
  /**
   * Registros que o encerramento marcou para apagar, escolhidos antes da
   * primeira exclusão local.
   *
   * A intenção é gravada primeiro justamente para o caso de o navegador
   * fechar no meio: a retomada refaz as lápides que faltam em vez de deixar
   * metade do distrito apagada aqui e inteira no serviço.
   */
  districtRecordIds?: string[]
  /** Compromissos pessoais, de leitura e de orçamento que ficam de fora. */
  preservedRecordCount?: number
  /**
   * Restauração de backup começada e não concluída.
   *
   * O que fica guardado é o **arquivo como veio** — cifrado com o código que só
   * o pastor tem —, nunca o conteúdo aberto: gravar o backup decifrado no banco
   * local para poder retomar seria desfazer, por conveniência, a única coisa
   * que protege esses dados em repouso. A retomada pede o código de novo, o que
   * é honesto: quem retoma precisa provar que é quem restaurou.
   *
   * As listas de já aplicados são o que torna a retomada idempotente: um
   * registro gravado antes da interrupção não é gravado de novo, e não gera uma
   * segunda operação na fila de envio.
   */
  restore?: {
    file: unknown
    appliedRecordIds: string[]
    appliedPersonalIds: string[]
    totalRecords: number
    totalPersonal: number
    inProgressRecords?: { items: Array<{ id: string; baseVersion: number; envelope: CipherEnvelope }> } | undefined
    inProgressPersonal?: { area: 'leitura' | 'orcamento'; id: string } | undefined
  }
}

export function pendingActionId(accountId: string, kind: PendingActionKind): string {
  return `${accountId}:${kind}`
}

/**
 * Registro cifrado que não abriu neste aparelho.
 *
 * Antes isto vivia em um conjunto na memória: bastava recarregar a página para
 * a contagem sumir, e cada tela que decifrava em lote parava no primeiro
 * registro ruim — backup, exportação, encerramento e listagens caíam junto. A
 * quarentena passou a ser gravada: o registro ruim fica de lado, identificado,
 * e todo o resto continua acessível.
 */
export interface CorruptedRecordRecord {
  /** `${accountId}:${recordId}` — a mesma linha por conta e registro. */
  id: string
  accountId: string
  recordId: string
  recordType: string
  /** Versão do registro que não abriu, para reconhecer quando ela mudar. */
  version: number
  detectedAt: string
  reason: 'nao-abriu' | 'vinculo' | 'conteudo'
}

export function corruptedRecordId(accountId: string, recordId: string): string {
  return `${accountId}:${recordId}`
}
