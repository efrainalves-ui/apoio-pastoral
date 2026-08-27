import { currentDeviceId } from '../auth/device'
import { fromBase64Url, fromUtf8, randomBytes, toBase64Url, utf8 } from '../crypto/encoding'
import { decryptPayload, encryptPayload } from '../crypto/vault'
import { db, type ApoioDatabase } from '../db/database'
import { VaultRepository, type EncryptedMutation } from '../db/repository'
import type { VaultRecord } from '../db/types'

export interface BackupSummary { createdAt: string; recordCount: number; size: number }
export interface BackupFile { format: 'apoio-pastoral-backup'; version: 3; salt: string; iv: string; ciphertext: string }
type Portable = { id: string; recordType: VaultRecord['recordType']; type: string; data: unknown }
type BackupContents = { accountId: string; records: Portable[] }

const BACKUP_AAD = 'apoio-pastoral:backup:v3'

async function deriveBackupKey(code: string, salt: Uint8Array) {
  if (code.length < 12) throw new Error('Use um código de backup com pelo menos 12 caracteres.')
  const material = await crypto.subtle.importKey('raw', utf8(code), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: 300_000 }, material,
    { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  )
}

function validPortable(record: unknown): record is Portable {
  if (!record || typeof record !== 'object') return false
  const candidate = record as Partial<Portable>
  return typeof candidate.id === 'string' && candidate.id.length > 0
    && typeof candidate.recordType === 'string' && candidate.recordType.length > 0
    && typeof candidate.type === 'string' && candidate.type.length > 0
}

function validBackupFile(file: unknown): file is BackupFile {
  if (!file || typeof file !== 'object') return false
  const candidate = file as Partial<BackupFile>
  return candidate.format === 'apoio-pastoral-backup' && candidate.version === 3
    && typeof candidate.salt === 'string' && typeof candidate.iv === 'string' && typeof candidate.ciphertext === 'string'
}

export class BackupService {
  private readonly repo: VaultRepository
  constructor(database: ApoioDatabase = db) { this.repo = new VaultRepository(database) }

  async create(accountId: string, masterKey: CryptoKey, code: string) {
    const records: Portable[] = []
    for (const record of await this.repo.list(accountId)) {
      const payload = await decryptPayload(masterKey, record)
      records.push({ id: record.id, recordType: record.recordType, type: payload.type, data: payload.data })
    }
    const salt = randomBytes(16); const iv = randomBytes(12)
    const plaintext = utf8(JSON.stringify({ accountId, records } satisfies BackupContents))
    const wrappingKey = await deriveBackupKey(code, salt)
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: utf8(BACKUP_AAD) }, wrappingKey, plaintext)
    plaintext.fill(0)
    const file: BackupFile = { format: 'apoio-pastoral-backup', version: 3, salt: toBase64Url(salt), iv: toBase64Url(iv), ciphertext: toBase64Url(ciphertext) }
    return { file, summary: { createdAt: new Date().toISOString(), recordCount: records.length, size: new Blob([JSON.stringify(file)]).size } }
  }

  async restore(accountId: string, masterKey: CryptoKey, code: string, file: unknown) {
    try {
      if (!validBackupFile(file)) throw new Error('invalid-backup')
      const wrappingKey = await deriveBackupKey(code, fromBase64Url(file.salt))
      const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64Url(file.iv), additionalData: utf8(BACKUP_AAD) }, wrappingKey, fromBase64Url(file.ciphertext))
      const contents = JSON.parse(fromUtf8(plaintext)) as Partial<BackupContents>
      if (contents.accountId !== accountId) throw new Error('account-mismatch')
      if (!Array.isArray(contents.records) || !contents.records.every(validPortable)) throw new Error('invalid-backup')
      if (new Set(contents.records.map(({ id }) => id)).size !== contents.records.length) throw new Error('invalid-backup')
      const mutations: EncryptedMutation[] = await Promise.all(contents.records.map(async (record) => ({ recordId: record.id, recordType: record.recordType, envelope: await encryptPayload(masterKey, { schemaVersion: 1, type: record.type, data: record.data }, record.id) })))
      await this.repo.applyEncryptedMutations(accountId, currentDeviceId(), mutations)
      return { recordCount: contents.records.length }
    } catch (reason) {
      if (reason instanceof Error && reason.message === 'account-mismatch') throw new Error('Este backup pertence a outra conta e não pode ser misturado com os dados atuais.', { cause: reason })
      throw new Error('Não foi possível abrir o backup. Verifique o arquivo e o código.', { cause: reason })
    }
  }
}

export function downloadBackup(file: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(file)], { type: 'application/octet-stream' }))
  const link = document.createElement('a'); link.href = url; link.download = 'apoio-pastoral-backup.apb'; link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
}
