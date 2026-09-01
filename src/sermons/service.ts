import { currentDeviceId } from '../auth/device'
import { decryptPayload, encryptPayload } from '../crypto/vault'
import { db, type ApoioDatabase } from '../db/database'
import { VaultRepository } from '../db/repository'
import type { SermonEntity, SermonInput } from './types'

/**
 * Um sermão de 15 páginas do Word passa de 30 mil caracteres, e o limite antigo
 * de 20 mil barrava exatamente isso. O teto agora é folgado — cerca de 120
 * páginas — e existe só para um registro não virar um envio gigante na
 * sincronização.
 */
export const SERMON_CONTENT_LIMIT = 300_000
export const SERMON_NOTES_LIMIT = 40_000
const SERMON_TITLE_LIMIT = 180

function validate(input: SermonInput): void {
  if (!input.title.trim()) throw new Error('Informe o título do sermão.')
  if (!input.mainText.trim()) throw new Error('Informe o texto bíblico principal.')
  if (input.title.length > SERMON_TITLE_LIMIT) throw new Error(`O título passa de ${SERMON_TITLE_LIMIT} caracteres.`)
  if (input.content.length > SERMON_CONTENT_LIMIT) throw new Error(`O conteúdo passa de ${SERMON_CONTENT_LIMIT.toLocaleString('pt-BR')} caracteres. Divida o sermão em duas partes.`)
  if (input.notes.length > SERMON_NOTES_LIMIT) throw new Error(`As observações passam de ${SERMON_NOTES_LIMIT.toLocaleString('pt-BR')} caracteres.`)
}
export class SermonService {
  private readonly repository: VaultRepository
  constructor(private readonly database: ApoioDatabase = db) { this.repository = new VaultRepository(database) }
  async list(accountId: string, masterKey: CryptoKey): Promise<SermonEntity[]> { const records = await this.repository.list(accountId, 'sermon'); const items = await Promise.all(records.map(async (record) => { const payload = await decryptPayload(masterKey, record); return payload.type === 'sermon' ? { id: record.id, ...(payload.data as Omit<SermonEntity, 'id'>) } : null })); return items.filter((item): item is SermonEntity => Boolean(item)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) }
  async get(accountId: string, masterKey: CryptoKey, id: string): Promise<SermonEntity | null> { return (await this.list(accountId, masterKey)).find((item) => item.id === id) ?? null }
  async create(accountId: string, masterKey: CryptoKey, input: SermonInput): Promise<SermonEntity> { validate(input); const id = crypto.randomUUID(); const now = new Date().toISOString(); const data = { ...input, title: input.title.trim(), theme: input.theme.trim(), mainText: input.mainText.trim(), complementaryTexts: input.complementaryTexts.trim(), objective: input.objective.trim(), introduction: input.introduction.trim(), content: input.content.trim(), conclusion: input.conclusion.trim(), appeal: input.appeal.trim(), notes: input.notes.trim(), tags: input.tags.map((tag) => tag.trim()).filter(Boolean), createdAt: now, updatedAt: now }; await this.repository.saveEncrypted(accountId, currentDeviceId(accountId), id, await encryptPayload(masterKey, { schemaVersion: 1, type: 'sermon', data }, id), 'sermon'); return { id, ...data } }
  async update(accountId: string, masterKey: CryptoKey, id: string, input: SermonInput): Promise<SermonEntity> { const current = await this.get(accountId, masterKey, id); if (!current) throw new Error('Sermão não encontrado.'); validate(input); const data = { ...input, title: input.title.trim(), theme: input.theme.trim(), mainText: input.mainText.trim(), complementaryTexts: input.complementaryTexts.trim(), objective: input.objective.trim(), introduction: input.introduction.trim(), content: input.content.trim(), conclusion: input.conclusion.trim(), appeal: input.appeal.trim(), notes: input.notes.trim(), tags: input.tags.map((tag) => tag.trim()).filter(Boolean), createdAt: current.createdAt, updatedAt: new Date().toISOString() }; await this.repository.saveEncrypted(accountId, currentDeviceId(accountId), id, await encryptPayload(masterKey, { schemaVersion: 1, type: 'sermon', data }, id), 'sermon'); return { id, ...data } }
  async remove(accountId: string, masterKey: CryptoKey, id: string): Promise<void> { if (!await this.get(accountId, masterKey, id)) throw new Error('Sermão não encontrado.'); await this.repository.deleteEncrypted(accountId, currentDeviceId(accountId), id, await encryptPayload(masterKey, { schemaVersion: 1, type: 'sermon_tombstone', data: { deletedAt: new Date().toISOString() } }, id)) }
}
