import { currentDeviceId } from '../auth/device'
import type { CipherEnvelope } from '../crypto/types'
import { decryptPayload, encryptPayload } from '../crypto/vault'
import { db, type ApoioDatabase } from '../db/database'
import { VaultRepository } from '../db/repository'
import type { SyncConflictRecord, VaultRecord } from '../db/types'

/** O que o pastor escolheu fazer com as duas versões. */
export type ConflictChoice = 'keep_local' | 'keep_remote' | 'keep_both'

const RECORD_LABELS: Record<string, string> = {
  district: 'Distrito', church: 'Igreja', person: 'Pessoa', family: 'Família',
  agenda_event: 'Compromisso', sermon: 'Sermão', goal: 'Meta', goal_entry: 'Registro de meta',
  visit: 'Visita', prayer_request: 'Pedido de oração', follow_up: 'Acompanhamento',
  task: 'Tarefa', visit_round: 'Rodada de visitas', interest: 'Interessado',
  bible_study: 'Estudo bíblico', missionary_pair: 'Dupla missionária',
  sabbath_class: 'Classe da Escola Sabatina', small_group: 'Pequeno Grupo', uapg: 'UAPG',
  commission_config: 'Configuração de comissão', commission_meeting: 'Reunião de comissão',
  commission_task: 'Pendência de comissão', nomination_process: 'Processo de nomeações',
  annual_goal: 'Meta anual', evangelism_campaign: 'Campanha',
}

export interface ConflictSide {
  version: number
  summary: string
  available: boolean
}

export interface ConflictPreview {
  id: string
  recordId: string
  kind: string
  createdAt: string
  remoteIsDeletion: boolean
  local: ConflictSide
  remote: ConflictSide
}

function label(type: string): string {
  return RECORD_LABELS[type] ?? 'Registro'
}

/** Resumo curto e legível de um conteúdo, sem expor estrutura técnica. */
function summarize(data: unknown): string {
  if (!data || typeof data !== 'object') return 'Sem descrição'
  const campos = data as Record<string, unknown>
  for (const chave of ['name', 'title', 'text', 'subject', 'description']) {
    const valor = campos[chave]
    if (typeof valor === 'string' && valor.trim()) return valor.trim().slice(0, 120)
  }
  return 'Sem descrição'
}

export class ConflictService {
  private readonly repository: VaultRepository

  constructor(private readonly database: ApoioDatabase = db) {
    this.repository = new VaultRepository(database)
  }

  async listPending(accountId: string): Promise<SyncConflictRecord[]> {
    return this.database.syncConflicts
      .where('accountId').equals(accountId)
      .filter(({ status }) => status === 'pending')
      .toArray()
  }

  async listResolved(accountId: string): Promise<SyncConflictRecord[]> {
    return this.database.syncConflicts
      .where('accountId').equals(accountId)
      .filter(({ status }) => status === 'resolved')
      .toArray()
  }

  /** Prepara as duas versões para leitura, sem alterar nada. */
  async preview(conflict: SyncConflictRecord, masterKey: CryptoKey): Promise<ConflictPreview> {
    const localRecord = await this.database.vaultRecords.get(conflict.recordId)
    let kind = 'Registro'
    let localSummary = 'Este registro não existe mais neste aparelho'
    let localAvailable = false
    let remoteSummary: string
    let remoteAvailable = false

    if (localRecord && !localRecord.deletedAt) {
      try {
        const payload = await decryptPayload(masterKey, localRecord)
        kind = label(payload.type)
        localSummary = summarize(payload.data)
        localAvailable = true
      } catch { localSummary = 'Conteúdo não pôde ser aberto' }
    }

    if (conflict.remoteOperation === 'delete') {
      remoteSummary = 'O outro aparelho apagou este registro'
    } else {
      try {
        const payload = await decryptPayload(masterKey, conflict.remotePayload)
        if (kind === 'Registro') kind = label(payload.type)
        remoteSummary = summarize(payload.data)
        remoteAvailable = true
      } catch { remoteSummary = 'Conteúdo não pôde ser aberto' }
    }

    return {
      id: conflict.id,
      recordId: conflict.recordId,
      kind,
      createdAt: conflict.createdAt,
      remoteIsDeletion: conflict.remoteOperation === 'delete',
      local: { version: conflict.localVersion, summary: localSummary, available: localAvailable },
      remote: { version: conflict.remoteVersion, summary: remoteSummary, available: remoteAvailable },
    }
  }

  /**
   * Aplica a escolha do pastor. Nada é descartado: a versão que não ficar
   * ativa continua guardada, cifrada, dentro do próprio conflito resolvido.
   */
  async resolve(accountId: string, masterKey: CryptoKey, conflictId: string, choice: ConflictChoice): Promise<void> {
    const conflict = await this.database.syncConflicts.get(conflictId)
    if (!conflict || conflict.accountId !== accountId) throw new Error('Esta revisão não foi encontrada.')
    if (conflict.status !== 'pending') throw new Error('Esta revisão já foi resolvida.')

    const localRecord = await this.database.vaultRecords.get(conflict.recordId)
    const localPayload: CipherEnvelope | undefined = localRecord
      ? { algorithm: localRecord.algorithm, ciphertext: localRecord.ciphertext, iv: localRecord.iv, aad: localRecord.aad, keyVersion: localRecord.keyVersion }
      : undefined

    let keptRecordId: string | undefined

    if (choice === 'keep_remote' || choice === 'keep_both') {
      if (conflict.remoteOperation === 'delete') throw new Error('A versão do outro aparelho é uma exclusão e não pode ser copiada.')
      const payload = await decryptPayload(masterKey, conflict.remotePayload)
      const recordType: VaultRecord['recordType'] = localRecord?.recordType ?? 'encrypted'

      if (choice === 'keep_remote') {
        const envelope = await encryptPayload(masterKey, payload, conflict.recordId)
        await this.repository.saveEncrypted(accountId, currentDeviceId(), conflict.recordId, envelope, recordType)
        keptRecordId = conflict.recordId
      } else {
        // Guarda a versão do outro aparelho como um registro novo e separado,
        // para que as duas continuem existindo lado a lado.
        const novoId = crypto.randomUUID()
        const envelope = await encryptPayload(masterKey, payload, novoId)
        await this.repository.saveEncrypted(accountId, currentDeviceId(), novoId, envelope, recordType)
        keptRecordId = novoId
      }
    }

    await this.database.syncConflicts.put({
      ...conflict,
      status: 'resolved',
      choice,
      resolvedAt: new Date().toISOString(),
      ...(localPayload ? { localPayload } : {}),
      ...(keptRecordId ? { keptRecordId } : {}),
    })
  }
}
