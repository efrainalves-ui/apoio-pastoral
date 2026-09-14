import { PersonalVaultStore } from '../db/personalVault'
import { db, type ApoioDatabase } from '../db/database'
import type { VaultRecord } from '../db/types'
import { idDerivado } from '../shared/idDerivado'
import { localDateKey } from '../shared/dates'
import { ehRevisao, propostaDeSoma } from './core'
import type {
  DecisaoSobreMetasAntigas, ReadingAnnualGoalData, ReadingBookData, ReadingDataByType, ReadingEntity,
  ReadingGoalReviewData, ReadingRecordType, ReadingSessionData,
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

export type MetaAnualInput = { books: number | null; pages: number | null }
export type SessaoInput = Pick<ReadingSessionData, 'date' | 'pages' | 'minutes' | 'notes'>

/** Número de meta: inteiro e não negativo. Zero ou vazio é "sem meta" para aquele campo. */
function valorDaMeta(valor: number | null): number | null {
  if (valor === null || Number.isNaN(valor)) return null
  if (!Number.isInteger(valor) || valor < 0) throw new Error('Informe números inteiros, sem valores negativos.')
  return valor === 0 ? null : valor
}

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
  /** Metas mensais antigas, metas anuais e a revisão, todas no mesmo tipo de registro. */
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
    const sessionData: ReadingSessionData = { ...input, pages: Math.max(0, input.pages), minutes: Math.max(0, input.minutes), notes: input.notes.trim(), createdAt: carimbo, updatedAt: carimbo }

    const pagesRead = book.pagesRead + sessionData.pages
    const completed = Boolean(book.totalPages && pagesRead >= book.totalPages)
    const { id: _id, ...storedBook } = book; void _id
    const bookData: ReadingBookData = {
      ...storedBook,
      pagesRead: book.totalPages ? Math.min(pagesRead, book.totalPages) : pagesRead,
      status: completed ? 'completed' : book.status === 'want_to_read' ? 'reading' : book.status,
      completedDate: completed && book.status !== 'completed' ? input.date : book.completedDate,
      updatedAt: carimbo,
    }

    await this.cofre.gravarVarios(accountId, key, [
      { recordType: TIPO_DO_COFRE.session, payloadType: tipoDoPayload('session'), id: sessionId, data: sessionData },
      { recordType: TIPO_DO_COFRE.book, payloadType: tipoDoPayload('book'), id: book.id, data: bookData },
    ])
    return { id: sessionId, ...sessionData }
  }

  /** As páginas lidas do livro acompanham a correção da sessão, sem passar do total nem ficar negativas. */
  private paginasDoLivro(book: ReadingEntity<ReadingBookData>, diferenca: number): ReadingBookData {
    const { id: _id, ...dados } = book; void _id
    const ajustado = Math.max(0, book.pagesRead + diferenca)
    return { ...dados, pagesRead: book.totalPages ? Math.min(ajustado, book.totalPages) : ajustado }
  }

  async updateSession(accountId: string, key: CryptoKey, sessionId: string, input: SessaoInput): Promise<void> {
    if (!input.date || (input.pages <= 0 && input.minutes <= 0)) throw new Error('Informe a data e as páginas ou os minutos de leitura.')
    const sessao = (await this.sessions(accountId, key)).find(({ id }) => id === sessionId)
    if (!sessao) throw new Error('Leitura não encontrada.')
    const { id: _id, ...guardada } = sessao; void _id
    const dados: ReadingSessionData = { ...guardada, date: input.date, pages: Math.max(0, input.pages), minutes: Math.max(0, input.minutes), notes: input.notes.trim() }
    const livro = (await this.books(accountId, key)).find(({ id }) => id === sessao.bookId)
    await this.cofre.gravarVarios(accountId, key, [
      { recordType: TIPO_DO_COFRE.session, payloadType: tipoDoPayload('session'), id: sessionId, data: dados },
      ...(livro ? [{ recordType: TIPO_DO_COFRE.book, payloadType: tipoDoPayload('book'), id: livro.id, data: this.paginasDoLivro(livro, dados.pages - Math.max(0, sessao.pages)) }] : []),
    ])
  }

  async removeSession(accountId: string, key: CryptoKey, sessionId: string): Promise<void> {
    const sessao = (await this.sessions(accountId, key)).find(({ id }) => id === sessionId)
    if (!sessao) throw new Error('Leitura não encontrada.')
    const livro = (await this.books(accountId, key)).find(({ id }) => id === sessao.bookId)
    if (livro) await this.save(accountId, key, 'book', this.paginasDoLivro(livro, -Math.max(0, sessao.pages)), livro.id)
    await this.cofre.apagar(accountId, key, sessionId)
  }

  async completeBook(accountId: string, key: CryptoKey, book: ReadingEntity<ReadingBookData>, date: string) {
    const { id, ...data } = book
    return this.saveBook(accountId, key, { ...data, pagesRead: data.totalPages ?? data.pagesRead, status: 'completed', completedDate: date }, id)
  }

  /** Reler abre um ciclo novo, explícito: o livro volta a contar só quando esse ciclo for concluído. */
  async rereadBook(accountId: string, key: CryptoKey, book: ReadingEntity<ReadingBookData>, date: string) {
    return this.saveBook(accountId, key, {
      title: book.title, author: book.author, category: book.category, totalPages: book.totalPages, pagesRead: 0,
      startDate: date, completedDate: null, status: 'reading', notes: '', createdAt: '', updatedAt: '',
    })
  }

  /**
   * A meta de um ano. Uma só por conta e por ano, em qualquer aparelho: o
   * identificador sai da conta e do ano, e editar grava por cima.
   */
  async saveAnnualGoal(accountId: string, key: CryptoKey, year: string, input: MetaAnualInput): Promise<ReadingEntity<ReadingAnnualGoalData>> {
    if (!/^\d{4}$/u.test(year)) throw new Error('Informe o ano da meta.')
    const books = valorDaMeta(input.books)
    const pages = valorDaMeta(input.pages)
    const id = await idDerivado(`leitura:meta-anual:${accountId}:${year}`)
    const existente = (await this.goals(accountId, key)).find((meta) => meta.id === id)
    return this.save(accountId, key, 'goal', { tipo: 'anual', year, books, pages, createdAt: existente?.createdAt ?? '', updatedAt: '' }, id) as Promise<ReadingEntity<ReadingAnnualGoalData>>
  }

  /**
   * Conclui a revisão das metas mensais antigas, uma vez por conta.
   *
   * As metas antigas não são apagadas nem alteradas. Rodar de novo — outro
   * aparelho, uma atualização — encontra a revisão feita e não faz nada.
   */
  async concludeGoalReview(accountId: string, key: CryptoKey, decisao: DecisaoSobreMetasAntigas, nova?: { year: string } & MetaAnualInput): Promise<ReadingEntity<ReadingGoalReviewData>> {
    const id = await idDerivado(`leitura:revisao-das-metas-mensais:${accountId}`)
    const metas = await this.goals(accountId, key)
    const feita = metas.find((meta): meta is ReadingEntity<ReadingGoalReviewData> => meta.id === id && ehRevisao(meta))
    if (feita) return feita
    if (decisao === 'nova') {
      if (!nova) throw new Error('Informe a meta anual.')
      await this.saveAnnualGoal(accountId, key, nova.year, nova)
    }
    if (decisao === 'somar') for (const proposta of propostaDeSoma(metas)) await this.saveAnnualGoal(accountId, key, proposta.year, proposta)
    return this.save(accountId, key, 'goal', { tipo: 'revisao', decisao, createdAt: '', updatedAt: '' }, id) as Promise<ReadingEntity<ReadingGoalReviewData>>
  }

  /** Apaga o livro e o histórico dele: a sessão sem livro não diz nada. */
  async removeBook(accountId: string, key: CryptoKey, bookId: string) {
    const livro = (await this.books(accountId, key)).find(({ id }) => id === bookId)
    if (!livro) throw new Error('Livro não encontrado.')
    const sessoes = (await this.sessions(accountId, key)).filter((session) => session.bookId === bookId)
    await this.cofre.apagarVarios(accountId, key, [bookId, ...sessoes.map(({ id }) => id)])
  }
}
