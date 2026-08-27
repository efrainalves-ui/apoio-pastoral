import { decryptPayload, encryptPayload } from '../crypto/vault'
import { readingDb, type ReadingDatabase } from './database'
import type { ReadingBookData, ReadingDataByType, ReadingEntity, ReadingGoalData, ReadingRecordType, ReadingSessionData, ReadingStoredRecord } from './types'

const now = () => new Date().toISOString()
export class ReadingService {
  constructor(private readonly database: ReadingDatabase = readingDb) {}
  private async decode<T extends ReadingRecordType>(record: ReadingStoredRecord, key: CryptoKey, type: T): Promise<ReadingEntity<ReadingDataByType[T]> | null> { const payload = await decryptPayload(key, record); return payload.type === `personal_reading_${type}` ? { id: record.id, ...(payload.data as ReadingDataByType[T]) } : null }
  private async list<T extends ReadingRecordType>(accountId: string, key: CryptoKey, type: T): Promise<ReadingEntity<ReadingDataByType[T]>[]> { const records = await this.database.records.where('accountId').equals(accountId).filter((record) => record.recordType === type).toArray(); return (await Promise.all(records.map((record) => this.decode(record, key, type)))).flatMap((item) => item ? [item] : []) }
  private async stored<T extends ReadingRecordType>(accountId: string, key: CryptoKey, type: T, input: ReadingDataByType[T], id: string = crypto.randomUUID()): Promise<ReadingStoredRecord> { const existing = await this.database.records.get(id); if (existing && existing.accountId !== accountId) throw new Error('Este registro pertence a outra conta.'); const timestamp = now(); const data = { ...input, createdAt: input.createdAt || timestamp, updatedAt: timestamp }; return { id, accountId, recordType: type, createdAt: existing?.createdAt ?? timestamp, updatedAt: timestamp, ...await encryptPayload(key, { schemaVersion: 1, type: `personal_reading_${type}`, data }, id) } }
  private async save<T extends ReadingRecordType>(accountId: string, key: CryptoKey, type: T, input: ReadingDataByType[T], id?: string): Promise<ReadingEntity<ReadingDataByType[T]>> { const record = await this.stored(accountId, key, type, input, id); await this.database.records.put(record); const decoded = await this.decode(record, key, type); return decoded! }
  async books(accountId: string, key: CryptoKey) { return (await this.list(accountId, key, 'book')).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) }
  async sessions(accountId: string, key: CryptoKey) { return (await this.list(accountId, key, 'session')).sort((a, b) => b.date.localeCompare(a.date)) }
  async goals(accountId: string, key: CryptoKey) { return this.list(accountId, key, 'goal') }
  async saveBook(accountId: string, key: CryptoKey, input: ReadingBookData, id?: string) { if (!input.title.trim() || !input.author.trim()) throw new Error('Informe o título e o autor do livro.'); if (input.totalPages !== null && input.totalPages <= 0) throw new Error('Informe uma quantidade válida de páginas.'); const completedDate = input.status === 'completed' ? input.completedDate ?? new Date().toISOString().slice(0, 10) : null; return this.save(accountId, key, 'book', { ...input, title: input.title.trim(), author: input.author.trim(), notes: input.notes.trim(), completedDate }, id) }
  async addSession(accountId: string, key: CryptoKey, input: Omit<ReadingSessionData, 'createdAt' | 'updatedAt'>): Promise<ReadingEntity<ReadingSessionData>> {
    if (!input.bookId || !input.date || (input.pages <= 0 && input.minutes <= 0)) throw new Error('Escolha o livro e informe páginas ou minutos de leitura.')
    const book = (await this.books(accountId, key)).find(({ id }) => id === input.bookId); if (!book) throw new Error('Livro não encontrado.')
    const timestamp = now(); const sessionData: ReadingSessionData = { ...input, notes: input.notes.trim(), createdAt: timestamp, updatedAt: timestamp }; const sessionRecord = await this.stored(accountId, key, 'session', sessionData)
    const pagesRead = book.pagesRead + Math.max(0, input.pages); const completed = Boolean(book.totalPages && pagesRead >= book.totalPages); const { id: _id, ...storedBook } = book; void _id
    const bookData: ReadingBookData = { ...storedBook, pagesRead: book.totalPages ? Math.min(pagesRead, book.totalPages) : pagesRead, status: completed ? 'completed' : book.status === 'want_to_read' ? 'reading' : book.status, completedDate: completed ? input.date : book.completedDate, updatedAt: timestamp }
    const bookRecord = await this.stored(accountId, key, 'book', bookData, book.id)
    await this.database.transaction('rw', this.database.records, async () => { await this.database.records.bulkPut([sessionRecord, bookRecord]) })
    return (await this.decode(sessionRecord, key, 'session'))!
  }
  async completeBook(accountId: string, key: CryptoKey, book: ReadingEntity<ReadingBookData>, date: string) { const { id, ...data } = book; return this.saveBook(accountId, key, { ...data, pagesRead: data.totalPages ?? data.pagesRead, status: 'completed', completedDate: date }, id) }
  async saveGoal(accountId: string, key: CryptoKey, input: ReadingGoalData) { const existing = (await this.goals(accountId, key)).find(({ month }) => month === input.month); return this.save(accountId, key, 'goal', input, existing?.id) }
  async removeBook(accountId: string, key: CryptoKey, bookId: string) { const book = await this.database.records.get(bookId); if (!book || book.accountId !== accountId || book.recordType !== 'book') throw new Error('Livro não encontrado.'); const sessions = (await this.sessions(accountId, key)).filter((session) => session.bookId === bookId); await this.database.transaction('rw', this.database.records, async () => { await this.database.records.delete(bookId); await this.database.records.bulkDelete(sessions.map(({ id }) => id)) }) }
}
