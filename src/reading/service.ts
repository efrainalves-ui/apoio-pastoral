import { PersonalVaultStore } from '../db/personalVault'
import { db, type ApoioDatabase } from '../db/database'
import type { VaultRecord } from '../db/types'
import { localDateKey } from '../shared/dates'
import type {
  ReadingBookData, ReadingDataByType, ReadingEntity, ReadingGoalData,
  ReadingRecordType, ReadingSessionData,
} from './types'

const now = () => new Date().toISOString()

/*
  Leitura vive no cofre cifrado do pastor, e não mais num banco à parte.

  O banco próprio garantia a separação do distrito, mas cobrava um preço
  invisível: nenhuma sincronização olhava para ele, e o livro anotado no celular
  não existia no computador. A separação continua, feita pelo tipo do registro —
  `isPersonalRecord` reconhece os três, e o encerramento de distrito os preserva.
*/
const TIPO_DO_COFRE: Record<ReadingRecordType, VaultRecord['recordType']> = {
  book: 'personal_reading_book', session: 'personal_reading_session', goal: 'personal_reading_goal',
}
const tipoDoPayload = (tipo: ReadingRecordType) => `personal_reading_${tipo}`

export class ReadingService {
  private readonly cofre: PersonalVaultStore
  constructor(database: ApoioDatabase = db) { this.cofre = new PersonalVaultStore(database) }

  private list<T extends ReadingRecordType>(accountId: string, key: CryptoKey, type: T) {
    return this.cofre.listar<ReadingDataByType[T]>(accountId, key, TIPO_DO_COFRE[type], tipoDoPayload(type))
  }

  private save<T extends ReadingRecordType>(accountId: string, key: CryptoKey, type: T, input: ReadingDataByType[T], id?: string) {
    return this.cofre.gravar(accountId, key, TIPO_DO_COFRE[type], tipoDoPayload(type), input, id)
  }

  async books(accountId: string, key: CryptoKey) { return (await this.list(accountId, key, 'book')).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) }
  async sessions(accountId: string, key: CryptoKey) { return (await this.list(accountId, key, 'session')).sort((a, b) => b.date.localeCompare(a.date)) }
  async goals(accountId: string, key: CryptoKey) { return this.list(accountId, key, 'goal') }

  async saveBook(accountId: string, key: CryptoKey, input: ReadingBookData, id?: string) {
    if (!input.title.trim() || !input.author.trim()) throw new Error('Informe o título e o autor do livro.')
    if (input.totalPages !== null && input.totalPages <= 0) throw new Error('Informe uma quantidade válida de páginas.')
    const completedDate = input.status === 'completed' ? input.completedDate ?? localDateKey() : null
    return this.save(accountId, key, 'book', { ...input, title: input.title.trim(), author: input.author.trim(), notes: input.notes.trim(), completedDate }, id)
  }

  /**
   * Registra a leitura e avança o livro na mesma gravação.
   *
   * Os dois entram juntos: metade disso gravada deixaria o livro dizendo uma
   * coisa e o histórico outra.
   */
  async addSession(accountId: string, key: CryptoKey, input: Omit<ReadingSessionData, 'createdAt' | 'updatedAt'>): Promise<ReadingEntity<ReadingSessionData>> {
    if (!input.bookId || !input.date || (input.pages <= 0 && input.minutes <= 0)) throw new Error('Escolha o livro e informe páginas ou minutos de leitura.')
    const book = (await this.books(accountId, key)).find(({ id }) => id === input.bookId)
    if (!book) throw new Error('Livro não encontrado.')

    const carimbo = now()
    const sessionId = crypto.randomUUID()
    const sessionData: ReadingSessionData = { ...input, notes: input.notes.trim(), createdAt: carimbo, updatedAt: carimbo }

    const pagesRead = book.pagesRead + Math.max(0, input.pages)
    const completed = Boolean(book.totalPages && pagesRead >= book.totalPages)
    const { id: _id, ...storedBook } = book; void _id
    const bookData: ReadingBookData = {
      ...storedBook,
      pagesRead: book.totalPages ? Math.min(pagesRead, book.totalPages) : pagesRead,
      status: completed ? 'completed' : book.status === 'want_to_read' ? 'reading' : book.status,
      completedDate: completed ? input.date : book.completedDate,
      updatedAt: carimbo,
    }

    await this.cofre.gravarVarios(accountId, key, [
      { recordType: TIPO_DO_COFRE.session, payloadType: tipoDoPayload('session'), id: sessionId, data: sessionData },
      { recordType: TIPO_DO_COFRE.book, payloadType: tipoDoPayload('book'), id: book.id, data: bookData },
    ])
    return { id: sessionId, ...sessionData }
  }

  async completeBook(accountId: string, key: CryptoKey, book: ReadingEntity<ReadingBookData>, date: string) {
    const { id, ...data } = book
    return this.saveBook(accountId, key, { ...data, pagesRead: data.totalPages ?? data.pagesRead, status: 'completed', completedDate: date }, id)
  }

  async saveGoal(accountId: string, key: CryptoKey, input: ReadingGoalData) {
    const existing = (await this.goals(accountId, key)).find(({ month }) => month === input.month)
    return this.save(accountId, key, 'goal', input, existing?.id)
  }

  /** Apaga o livro e o histórico dele: a sessão sem livro não diz nada. */
  async removeBook(accountId: string, key: CryptoKey, bookId: string) {
    const livro = (await this.books(accountId, key)).find(({ id }) => id === bookId)
    if (!livro) throw new Error('Livro não encontrado.')
    const sessoes = (await this.sessions(accountId, key)).filter((session) => session.bookId === bookId)
    await this.cofre.apagarVarios(accountId, key, [bookId, ...sessoes.map(({ id }) => id)])
  }
}
