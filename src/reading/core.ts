import type { ReadingBookData, ReadingEntity, ReadingGoalData, ReadingSessionData } from './types'

export const readingMonth = (value: string | Date) => typeof value === 'string' ? value.slice(0, 7) : `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}`
/**
 * Quantos livros o pastor quer ler no ano.
 *
 * Livro não se lê por mês: um de trezentas páginas atravessa três. A meta de
 * livros vale o ano inteiro, e vem da última vez em que foi escrita naquele
 * ano — escrevê-la em janeiro basta para valer em setembro.
 *
 * Páginas e minutos continuam mensais: esses, sim, se contam por mês.
 */
export function metaAnualDeLivros(metas: ReadingEntity<ReadingGoalData>[], ano: string): number {
  return metas
    .filter(({ month, books }) => month.slice(0, 4) === ano && books > 0)
    .sort((esquerda, direita) => esquerda.month.localeCompare(direita.month))
    .at(-1)?.books ?? 0
}

export function readingSummary(books: ReadingEntity<ReadingBookData>[], sessions: ReadingEntity<ReadingSessionData>[], goal: ReadingEntity<ReadingGoalData> | null, month: string, metasDoAno: ReadingEntity<ReadingGoalData>[] = []) {
  const monthSessions = sessions.filter(({ date }) => readingMonth(date) === month)
  const year = month.slice(0, 4)
  const booksCompletedMonth = books.filter(({ status, completedDate }) => status === 'completed' && completedDate?.slice(0, 7) === month).length
  const booksCompletedYear = books.filter(({ status, completedDate }) => status === 'completed' && completedDate?.slice(0, 4) === year).length
  const yearSessions = sessions.filter(({ date }) => date.slice(0, 4) === year)
  const pages = monthSessions.reduce((total, session) => total + session.pages, 0); const minutes = monthSessions.reduce((total, session) => total + session.minutes, 0)
  const minutesYear = yearSessions.reduce((total, session) => total + session.minutes, 0)
  return { reading: books.filter(({ status }) => status === 'reading').length, booksCompletedMonth, booksCompletedYear, pages, minutes, minutesYear, goalBooks: metaAnualDeLivros(metasDoAno, year) || (goal?.books ?? 0), goalPages: goal?.pages ?? 0, goalMinutes: goal?.minutes ?? 0 }
}
export function bookProgress(book: ReadingEntity<ReadingBookData>) { return book.totalPages && book.totalPages > 0 ? Math.min(100, Math.round(book.pagesRead / book.totalPages * 100)) : null }

/**
 * A leitura que já aconteceu.
 *
 * O pastor registra em setembro um livro que leu em fevereiro, e quer que ele
 * conte em fevereiro. Duas coisas vinham do lugar errado para isso funcionar: a
 * conclusão era sempre carimbada com a data de hoje, e o tempo de leitura só
 * existia dentro de uma sessão que ele não tinha como criar no passado.
 *
 * Páginas e minutos continuam vindo **só das sessões** — é de lá que os totais
 * do mês e do ano saem. Guardar minutos também no livro criaria dois números
 * para a mesma pergunta, e eles divergiriam no primeiro mês.
 */
export function sessaoDoRegistroRetroativo(
  livro: { startDate: string; completedDate: string | null; pagesRead: number },
  minutos: number,
  bookId: string,
): { bookId: string; date: string; pages: number; minutes: number; notes: string } | null {
  if (minutos <= 0 && livro.pagesRead <= 0) return null
  const data = livro.completedDate || livro.startDate
  if (!data) return null
  return { bookId, date: data, pages: Math.max(0, livro.pagesRead), minutes: Math.max(0, minutos), notes: '' }
}

/** A conclusão não pode ser antes do começo. */
export function datasCoerentes(startDate: string, completedDate: string | null): boolean {
  if (!completedDate || !startDate) return true
  return completedDate >= startDate
}
