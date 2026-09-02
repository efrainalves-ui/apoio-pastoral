import { currentDeviceId } from '../auth/device'
import { fromBase64Url, fromUtf8, randomBytes, toBase64Url, utf8 } from '../crypto/encoding'
import { decryptPayload, encryptPayload } from '../crypto/vault'
import { db, type ApoioDatabase } from '../db/database'
import { VaultRepository, type EncryptedMutation } from '../db/repository'
import type { VaultRecord } from '../db/types'
import { readingDb, type ReadingDatabase } from '../reading/database'
import { familyBudgetDb, type FamilyBudgetDatabase } from '../family-budget/database'

export interface BackupSummary { createdAt: string; recordCount: number; personalCount: number; size: number }
export interface BackupFile { format: 'apoio-pastoral-backup'; version: 4; salt: string; iv: string; ciphertext: string }
type Portable = { id: string; recordType: VaultRecord['recordType']; type: string; data: unknown }
/** Registro pessoal viaja como está: já é envelope cifrado com a mesma chave. */
type PortablePersonal = { area: 'leitura' | 'orcamento'; id: string; recordType: string; createdAt: string; updatedAt: string; ciphertext: string; iv: string; aad: string; keyVersion: number; algorithm: 'AES-GCM-256' }
type BackupContents = { accountId: string; records: Portable[]; personal: PortablePersonal[] }

const BACKUP_AAD = 'apoio-pastoral:backup:v4'
/** Um arquivo bem maior que isto não é backup deste aplicativo. */
const MAX_BACKUP_BYTES = 64 * 1024 * 1024
const MAX_RECORDS = 200_000

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

function validPersonal(record: unknown): record is PortablePersonal {
  if (!record || typeof record !== 'object') return false
  const candidate = record as Partial<PortablePersonal>
  return (candidate.area === 'leitura' || candidate.area === 'orcamento')
    && typeof candidate.id === 'string' && candidate.id.length > 0
    && typeof candidate.recordType === 'string'
    && typeof candidate.ciphertext === 'string' && typeof candidate.iv === 'string'
    && typeof candidate.aad === 'string' && typeof candidate.keyVersion === 'number'
}

/**
 * Conferência do arquivo antes de qualquer tentativa de abrir.
 *
 * Um arquivo truncado, de outro aplicativo ou de uma versão futura precisa
 * parar aqui com uma explicação, e não virar erro técnico depois de meio
 * minuto derivando chave à toa.
 */
function validBackupFile(file: unknown): file is BackupFile {
  if (!file || typeof file !== 'object') return false
  const candidate = file as Partial<BackupFile> & { version?: unknown }
  if (candidate.format !== 'apoio-pastoral-backup') return false
  if (candidate.version !== 4) throw new Error('formato-antigo')
  return typeof candidate.salt === 'string' && candidate.salt.length > 0
    && typeof candidate.iv === 'string' && candidate.iv.length > 0
    && typeof candidate.ciphertext === 'string' && candidate.ciphertext.length > 0
}

export class BackupService {
  private readonly repo: VaultRepository
  constructor(
    database: ApoioDatabase = db,
    private readonly leitura: ReadingDatabase = readingDb,
    private readonly orcamento: FamilyBudgetDatabase = familyBudgetDb,
  ) { this.repo = new VaultRepository(database) }

  private async personalRecords(accountId: string): Promise<PortablePersonal[]> {
    const leitura = (await this.leitura.records.where('accountId').equals(accountId).toArray())
      .map((registro) => ({ area: 'leitura' as const, ...registro }))
    const orcamento = (await this.orcamento.records.where('accountId').equals(accountId).toArray())
      .map((registro) => ({ area: 'orcamento' as const, ...registro }))
    return [...leitura, ...orcamento] as PortablePersonal[]
  }

  async create(accountId: string, masterKey: CryptoKey, code: string) {
    const records: Portable[] = []
    for (const record of await this.repo.list(accountId)) {
      const payload = await decryptPayload(masterKey, record)
      records.push({ id: record.id, recordType: record.recordType, type: payload.type, data: payload.data })
    }
    // Leitura e Orçamento Familiar entram no mesmo arquivo: são dados do
    // pastor e ficavam de fora, então um aparelho perdido levava junto tudo o
    // que não estava no cofre do distrito.
    const personal = await this.personalRecords(accountId)
    const salt = randomBytes(16); const iv = randomBytes(12)
    const plaintext = utf8(JSON.stringify({ accountId, records, personal } satisfies BackupContents))
    const wrappingKey = await deriveBackupKey(code, salt)
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: utf8(BACKUP_AAD) }, wrappingKey, plaintext)
    plaintext.fill(0)
    const file: BackupFile = { format: 'apoio-pastoral-backup', version: 4, salt: toBase64Url(salt), iv: toBase64Url(iv), ciphertext: toBase64Url(ciphertext) }
    return { file, summary: { createdAt: new Date().toISOString(), recordCount: records.length, personalCount: personal.length, size: new Blob([JSON.stringify(file)]).size } }
  }

  async restore(accountId: string, masterKey: CryptoKey, code: string, file: unknown) {
    try {
      if (typeof file === 'string' || file instanceof ArrayBuffer) throw new Error('invalid-backup')
      if (!validBackupFile(file)) throw new Error('invalid-backup')
      if (JSON.stringify(file).length > MAX_BACKUP_BYTES) throw new Error('grande-demais')
      const wrappingKey = await deriveBackupKey(code, fromBase64Url(file.salt))
      const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64Url(file.iv), additionalData: utf8(BACKUP_AAD) }, wrappingKey, fromBase64Url(file.ciphertext))
      const contents = JSON.parse(fromUtf8(plaintext)) as Partial<BackupContents>
      if (contents.accountId !== accountId) throw new Error('account-mismatch')
      if (!Array.isArray(contents.records) || !contents.records.every(validPortable)) throw new Error('invalid-backup')
      if (contents.records.length > MAX_RECORDS) throw new Error('grande-demais')
      if (new Set(contents.records.map(({ id }) => id)).size !== contents.records.length) throw new Error('invalid-backup')
      const personal = contents.personal ?? []
      if (!Array.isArray(personal) || !personal.every(validPersonal)) throw new Error('invalid-backup')

      const mutations: EncryptedMutation[] = await Promise.all(contents.records.map(async (record) => ({ recordId: record.id, recordType: record.recordType, envelope: await encryptPayload(masterKey, { schemaVersion: 1, type: record.type, data: record.data }, record.id) })))
      await this.repo.applyEncryptedMutations(accountId, currentDeviceId(accountId), mutations)
      await this.restorePersonal(accountId, personal)
      return { recordCount: contents.records.length, personalCount: personal.length }
    } catch (reason) {
      if (reason instanceof Error && reason.message === 'account-mismatch') throw new Error('Este backup pertence a outra conta e não pode ser misturado com os dados atuais.', { cause: reason })
      if (reason instanceof Error && reason.message === 'formato-antigo') throw new Error('Este arquivo foi criado por outra versão do aplicativo e não pode ser restaurado aqui.', { cause: reason })
      if (reason instanceof Error && reason.message === 'grande-demais') throw new Error('Este arquivo é grande demais para ser um backup deste aplicativo.', { cause: reason })
      throw new Error('Não foi possível abrir o backup. Verifique o arquivo e o código.', { cause: reason })
    }
  }

  private async restorePersonal(accountId: string, personal: PortablePersonal[]): Promise<void> {
    for (const registro of personal) {
      const { area, ...linha } = registro
      const alvo = area === 'leitura' ? this.leitura : this.orcamento
      await alvo.records.put({ ...linha, accountId } as never)
    }
  }
}

export function downloadBackup(file: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(file)], { type: 'application/octet-stream' }))
  const link = document.createElement('a'); link.href = url; link.download = 'apoio-pastoral-backup.apb'; link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
}
