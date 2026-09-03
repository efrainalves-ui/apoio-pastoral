import { currentDeviceId } from '../auth/device'
import { fromBase64Url, fromUtf8, randomBytes, toBase64Url, utf8 } from '../crypto/encoding'
import { encryptPayload } from '../crypto/vault'
import { readPayloads } from '../db/corrupted'
import { db, type ApoioDatabase } from '../db/database'
import { VaultRepository, type EncryptedMutation } from '../db/repository'
import { pendingActionId, type PendingActionRecord, type VaultRecord } from '../db/types'
import { readingDb, type ReadingDatabase } from '../reading/database'
import { familyBudgetDb, type FamilyBudgetDatabase } from '../family-budget/database'

export interface BackupSummary { createdAt: string; recordCount: number; personalCount: number; size: number; skippedCount: number }
export interface BackupFile { format: 'apoio-pastoral-backup'; version: 4; salt: string; iv: string; ciphertext: string }
type Portable = { id: string; recordType: VaultRecord['recordType']; type: string; data: unknown }
/** Registro pessoal viaja como está: já é envelope cifrado com a mesma chave. */
type PortablePersonal = { area: 'leitura' | 'orcamento'; id: string; recordType: string; createdAt: string; updatedAt: string; ciphertext: string; iv: string; aad: string; keyVersion: number; algorithm: 'AES-GCM-256' }
type BackupContents = { accountId: string; records: Portable[]; personal: PortablePersonal[] }

const BACKUP_AAD = 'apoio-pastoral:backup:v4'
/** Um arquivo bem maior que isto não é backup deste aplicativo. */
const MAX_BACKUP_BYTES = 64 * 1024 * 1024
const MAX_RECORDS = 200_000
/**
 * Tamanho do lote de gravação.
 *
 * A restauração inteira em uma transação só era tudo ou nada — o que parece
 * bom, mas em um distrito grande significava, na prática, uma transação que
 * nunca terminava e um pastor sem nenhum caminho de volta. Em lotes, cada um é
 * atômico e a marca de pendência registra o que já entrou: a interrupção custa
 * o lote em andamento, não a restauração.
 */
const RESTORE_BATCH = 200

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

export interface RestoreResult {
  recordCount: number
  personalCount: number
  /** Falso quando a restauração parou no meio e precisa ser retomada. */
  completed: boolean
}

export class BackupService {
  private readonly repo: VaultRepository
  constructor(
    private readonly database: ApoioDatabase = db,
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

  /**
   * Cria o backup. Um registro que não abre neste aparelho não derruba mais a
   * criação inteira: ele vai para a quarentena, é contado no resumo e o backup
   * sai com todo o resto — um arquivo com quase tudo vale infinitamente mais do
   * que nenhum arquivo.
   */
  async create(accountId: string, masterKey: CryptoKey, code: string) {
    const records: Portable[] = []
    const guardados = await this.repo.list(accountId)
    const { opened, skipped } = await readPayloads(masterKey, guardados, this.database)
    for (const { record, payload } of opened) {
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
    return { file, summary: { createdAt: new Date().toISOString(), recordCount: records.length, personalCount: personal.length, size: new Blob([JSON.stringify(file)]).size, skippedCount: skipped.length } }
  }

  /**
   * Abre e confere o arquivo por inteiro, sem gravar coisa nenhuma.
   *
   * Tudo que pode reprovar um backup — formato, tamanho, código errado,
   * conteúdo adulterado, conta diferente, identificador repetido, registro
   * malformado — reprova aqui, antes da primeira gravação. Antes, parte destas
   * conferências acontecia com a restauração já em andamento, e um arquivo
   * truncado deixava o cofre com metade de um distrito e metade de outro.
   */
  private async openContents(accountId: string, code: string, file: unknown): Promise<{ records: Portable[]; personal: PortablePersonal[] }> {
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
      if (new Set(personal.map(({ id }) => id)).size !== personal.length) throw new Error('invalid-backup')
      return { records: contents.records, personal }
    } catch (reason) {
      if (reason instanceof Error && reason.message === 'account-mismatch') throw new Error('Este backup pertence a outra conta e não pode ser misturado com os dados atuais.', { cause: reason })
      if (reason instanceof Error && reason.message === 'formato-antigo') throw new Error('Este arquivo foi criado por outra versão do aplicativo e não pode ser restaurado aqui.', { cause: reason })
      if (reason instanceof Error && reason.message === 'grande-demais') throw new Error('Este arquivo é grande demais para ser um backup deste aplicativo.', { cause: reason })
      throw new Error('Não foi possível abrir o backup. Verifique o arquivo e o código.', { cause: reason })
    }
  }

  /**
   * Restaura o backup. A intenção é gravada antes da primeira alteração e só
   * sai quando a última entrou: enquanto ela existir, a tela sabe que há uma
   * restauração pela metade e a sincronização se recusa a subir esse estado.
   */
  async restore(accountId: string, masterKey: CryptoKey, code: string, file: unknown): Promise<RestoreResult> {
    const { records, personal } = await this.openContents(accountId, code, file)
    const marca: PendingActionRecord = {
      id: pendingActionId(accountId, 'restore_backup'),
      accountId,
      kind: 'restore_backup',
      createdAt: new Date().toISOString(),
      stage: 'intent',
      restore: { file, appliedRecordIds: [], appliedPersonalIds: [], totalRecords: records.length, totalPersonal: personal.length },
    }
    await this.database.pendingActions.put(marca)
    return this.aplicar(accountId, masterKey, records, personal, marca)
  }

  /**
   * Retoma uma restauração interrompida. Pede o código de novo, porque o
   * arquivo guardado continua cifrado — e continuar cifrado é o ponto.
   */
  async resume(accountId: string, masterKey: CryptoKey, code: string): Promise<RestoreResult> {
    const marca = await this.database.pendingActions.get(pendingActionId(accountId, 'restore_backup'))
    if (!marca?.restore) throw new Error('Não há restauração pendente nesta conta.')
    const { records, personal } = await this.openContents(accountId, code, marca.restore.file)
    return this.aplicar(accountId, masterKey, records, personal, marca)
  }

  private async aplicar(
    accountId: string,
    masterKey: CryptoKey,
    records: Portable[],
    personal: PortablePersonal[],
    marca: PendingActionRecord,
  ): Promise<RestoreResult> {
    const id = marca.id
    const jaGravados = new Set(marca.restore?.appliedRecordIds ?? [])
    const jaPessoais = new Set(marca.restore?.appliedPersonalIds ?? [])
    const deviceId = currentDeviceId(accountId)

    await this.database.pendingActions.update(id, { stage: 'restoring_pastoral' })
    const pendentes = records.filter(({ id: recordId }) => !jaGravados.has(recordId))
    for (let inicio = 0; inicio < pendentes.length; inicio += RESTORE_BATCH) {
      const lote = pendentes.slice(inicio, inicio + RESTORE_BATCH)
      const mutations: EncryptedMutation[] = await Promise.all(lote.map(async (record) => ({
        recordId: record.id,
        recordType: record.recordType,
        envelope: await encryptPayload(masterKey, { schemaVersion: 1, type: record.type, data: record.data }, record.id),
      })))
      await this.repo.applyEncryptedMutations(accountId, deviceId, mutations)
      for (const { id: recordId } of lote) jaGravados.add(recordId)
      await this.database.pendingActions.update(id, { restore: { ...marca.restore!, appliedRecordIds: [...jaGravados], appliedPersonalIds: [...jaPessoais] } })
    }

    await this.database.pendingActions.update(id, { stage: 'restoring_personal' })
    for (const registro of personal) {
      if (jaPessoais.has(registro.id)) continue
      const { area, ...linha } = registro
      const alvo = area === 'leitura' ? this.leitura : this.orcamento
      await alvo.records.put({ ...linha, accountId } as never)
      jaPessoais.add(registro.id)
      await this.database.pendingActions.update(id, { restore: { ...marca.restore!, appliedRecordIds: [...jaGravados], appliedPersonalIds: [...jaPessoais] } })
    }

    await this.database.pendingActions.delete(id)
    return { recordCount: records.length, personalCount: personal.length, completed: true }
  }
}

/** Restauração começada e não concluída nesta instalação. */
export async function pendingBackupRestore(accountId: string, database: ApoioDatabase = db): Promise<{ applied: number; total: number } | null> {
  const marca = await database.pendingActions.get(pendingActionId(accountId, 'restore_backup'))
  if (!marca?.restore) return null
  return {
    applied: marca.restore.appliedRecordIds.length + marca.restore.appliedPersonalIds.length,
    total: marca.restore.totalRecords + marca.restore.totalPersonal,
  }
}

export function downloadBackup(file: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(file)], { type: 'application/octet-stream' }))
  const link = document.createElement('a'); link.href = url; link.download = 'apoio-pastoral-backup.apb'; link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
}
