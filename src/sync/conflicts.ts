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
  agenda_event: 'Compromisso', sermon: 'Sermão', goal: 'Meta', goal_entry: 'Registro de meta', goal_history: 'Resultado do ano anterior',
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

/** Um campo que mudou entre as duas versões, pronto para leitura. */
export interface ConflictDifference {
  field: string
  local: string | null
  remote: string | null
}

export interface ConflictPreview {
  id: string
  recordId: string
  kind: string
  createdAt: string
  remoteIsDeletion: boolean
  local: ConflictSide
  remote: ConflictSide
  differences: ConflictDifference[]
  /** Diferenças em campos que o pastor não edita diretamente. */
  hiddenDifferences: number
}

const FIELD_LABELS: Record<string, string> = {
  name: 'Nome', title: 'Título', text: 'Texto', subject: 'Assunto', description: 'Descrição',
  notes: 'Observações', administrativeNotes: 'Observações', address: 'Endereço', location: 'Local',
  whatsapp: 'WhatsApp', email: 'E-mail', phone: 'Telefone', birthDate: 'Data de nascimento',
  status: 'Situação', type: 'Tipo', category: 'Categoria', pastoralStatus: 'Situação pastoral',
  incomeStatus: 'Fidelidade', externalCode: 'Código externo', startAt: 'Início', endAt: 'Término',
  allDay: 'Dia inteiro', date: 'Data', deadline: 'Prazo', responsible: 'Responsável',
  amount: 'Valor', value: 'Valor', reason: 'Motivo', quorum: 'Quórum', author: 'Autor',
  pages: 'Páginas', theme: 'Tema', passage: 'Passagem', role: 'Cargo', label: 'Identificação',
}

/**
 * Campos cujo conteúdo é um código interno. O nome do campo é mostrado, o valor
 * não: exibi-lo colocaria vocabulário técnico na frente do pastor.
 */
const CODED_FIELDS = new Set(['status', 'type', 'category', 'pastoralStatus', 'incomeStatus', 'role', 'visitTarget', 'mode', 'kind', 'operation', 'importStatus'])

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?$/u

/** Deixa um valor pronto para leitura, ou devolve null quando não deve aparecer. */
function readableValue(field: string, value: unknown): string | null {
  if (value === null || value === undefined || value === '') return 'não informado'
  if (CODED_FIELDS.has(field)) return null
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não'
  if (typeof value === 'number') return String(value)
  if (typeof value !== 'string') return null
  if (ISO_DATE.test(value)) {
    const data = new Date(value)
    if (!Number.isNaN(data.getTime())) {
      return new Intl.DateTimeFormat('pt-BR', value.includes('T') ? { dateStyle: 'short', timeStyle: 'short' } : { dateStyle: 'short' }).format(data)
    }
  }
  return value.length > 80 ? `${value.slice(0, 80)}…` : value
}

function sameValue(left: unknown, right: unknown): boolean {
  if (left === right) return true
  if (left === null || left === undefined) return right === null || right === undefined || right === ''
  if (right === null || right === undefined) return left === ''
  if (typeof left === 'object' || typeof right === 'object') return JSON.stringify(left) === JSON.stringify(right)
  return false
}

/**
 * Aponta o que mudou entre as duas versões. Sem isto, as duas colunas podem
 * parecer idênticas quando a diferença está num campo que o resumo não mostra,
 * e a escolha vira adivinhação.
 */
function differences(local: unknown, remote: unknown): { visible: ConflictDifference[]; hidden: number } {
  if (!local || !remote || typeof local !== 'object' || typeof remote !== 'object') return { visible: [], hidden: 0 }
  const esquerda = local as Record<string, unknown>
  const direita = remote as Record<string, unknown>
  const visible: ConflictDifference[] = []
  let hidden = 0

  for (const chave of [...new Set([...Object.keys(esquerda), ...Object.keys(direita)])].sort()) {
    if (sameValue(esquerda[chave], direita[chave])) continue
    const rotulo = FIELD_LABELS[chave]
    if (!rotulo) { hidden += 1; continue }
    visible.push({ field: rotulo, local: readableValue(chave, esquerda[chave]), remote: readableValue(chave, direita[chave]) })
  }

  return { visible, hidden }
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
    let localData: unknown = null
    let remoteData: unknown = null

    if (localRecord && !localRecord.deletedAt) {
      try {
        const payload = await decryptPayload(masterKey, localRecord)
        kind = label(payload.type)
        localSummary = summarize(payload.data)
        localData = payload.data
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
        remoteData = payload.data
        remoteAvailable = true
      } catch { remoteSummary = 'Conteúdo não pôde ser aberto' }
    }

    const mudancas = localAvailable && remoteAvailable ? differences(localData, remoteData) : { visible: [], hidden: 0 }

    return {
      id: conflict.id,
      recordId: conflict.recordId,
      kind,
      createdAt: conflict.createdAt,
      remoteIsDeletion: conflict.remoteOperation === 'delete',
      local: { version: conflict.localVersion, summary: localSummary, available: localAvailable },
      remote: { version: conflict.remoteVersion, summary: remoteSummary, available: remoteAvailable },
      differences: mudancas.visible,
      hiddenDifferences: mudancas.hidden,
    }
  }

  /**
   * Aplica a escolha do pastor. Nada é descartado: a versão que não ficar
   * ativa continua guardada, cifrada, dentro do próprio conflito resolvido.
   *
   * Toda escolha é publicada em cima da versão do outro aparelho. Antes,
   * "ficar com a deste aparelho" só marcava a revisão como resolvida: o outro
   * aparelho nunca ficava sabendo, seguia com a versão dele, e os dois
   * discordavam para sempre sem nenhum aviso. E uma exclusão feita no outro
   * aparelho não tinha como ser aceita: o único caminho era manter a versão
   * daqui, então apagar um registro em um aparelho nunca chegava ao outro.
   */
  async resolve(accountId: string, masterKey: CryptoKey, conflictId: string, choice: ConflictChoice): Promise<void> {
    const conflict = await this.database.syncConflicts.get(conflictId)
    if (!conflict || conflict.accountId !== accountId) throw new Error('Esta revisão não foi encontrada.')
    if (conflict.status !== 'pending') throw new Error('Esta revisão já foi resolvida.')

    const localRecord = await this.database.vaultRecords.get(conflict.recordId)
    const localPayload: CipherEnvelope | undefined = localRecord
      ? { algorithm: localRecord.algorithm, ciphertext: localRecord.ciphertext, iv: localRecord.iv, aad: localRecord.aad, keyVersion: localRecord.keyVersion }
      : undefined
    const recordType: VaultRecord['recordType'] = localRecord?.recordType ?? 'encrypted'
    const deviceId = currentDeviceId(accountId)
    const remoteIsDeletion = conflict.remoteOperation === 'delete'

    if (choice === 'keep_both' && remoteIsDeletion) {
      throw new Error('O outro aparelho apagou este registro: não há duas versões para manter. Escolha manter a daqui ou aceitar a exclusão.')
    }

    let keptRecordId: string | undefined

    if (choice === 'keep_remote' && remoteIsDeletion) {
      // Aceitar a exclusão do outro aparelho. O registro sai daqui e a saída é
      // publicada por cima da versão remota, para não voltar como conflito.
      if (localRecord && !localRecord.deletedAt) {
        await this.repository.applyEncryptedMutations(accountId, deviceId, [{
          recordId: conflict.recordId,
          recordType,
          operation: 'delete',
          supersedes: conflict.remoteVersion,
          envelope: await encryptPayload(masterKey, { schemaVersion: 1, type: 'tombstone', data: { deletedAt: new Date().toISOString() } }, conflict.recordId),
        }])
      }
    } else if (choice === 'keep_remote' || choice === 'keep_both') {
      const payload = await decryptPayload(masterKey, conflict.remotePayload)

      if (choice === 'keep_remote') {
        const envelope = await encryptPayload(masterKey, payload, conflict.recordId)
        await this.repository.applyEncryptedMutations(accountId, deviceId, [{ recordId: conflict.recordId, recordType, envelope, supersedes: conflict.remoteVersion }])
        keptRecordId = conflict.recordId
      } else {
        // Guarda a versão do outro aparelho como um registro novo e separado,
        // para que as duas continuem existindo lado a lado.
        const novoId = crypto.randomUUID()
        const envelope = await encryptPayload(masterKey, payload, novoId)
        await this.repository.saveEncrypted(accountId, deviceId, novoId, envelope, recordType)
        keptRecordId = novoId
        await this.publicarVersaoLocal(accountId, deviceId, conflict.recordId, recordType, localPayload, localRecord?.deletedAt, conflict.remoteVersion)
      }
    } else {
      await this.publicarVersaoLocal(accountId, deviceId, conflict.recordId, recordType, localPayload, localRecord?.deletedAt, conflict.remoteVersion)
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

  /**
   * Reenvia a versão deste aparelho por cima da versão do outro. Um registro
   * que já foi apagado aqui não é reenviado: a exclusão local já está na fila
   * e é justamente ela que o outro aparelho precisa receber.
   */
  private async publicarVersaoLocal(
    accountId: string,
    deviceId: string,
    recordId: string,
    recordType: VaultRecord['recordType'],
    localPayload: CipherEnvelope | undefined,
    deletedAt: string | undefined,
    remoteVersion: number,
  ): Promise<void> {
    if (!localPayload || deletedAt) return
    await this.repository.applyEncryptedMutations(accountId, deviceId, [{ recordId, recordType, envelope: localPayload, supersedes: remoteVersion }])
  }
}
