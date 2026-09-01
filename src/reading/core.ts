import type { ReadingBookData, ReadingEntity, ReadingGoalData, ReadingSessionData } from './types'

export const readingMonth = (value: string | Date) => typeof value === 'string' ? value.slice(0, 7) : `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}`
export function readingSummary(books: ReadingEntity<ReadingBookData>[], sessions: ReadingEntity<ReadingSessionData>[], goal: ReadingEntity<ReadingGoalData> | null, month: string) {
  const monthSessions = sessions.filter(({ date }) => readingMonth(date) === month)
  const year = month.slice(0, 4)
  const booksCompletedMonth = books.filter(({ status, completedDate }) => status === 'completed' && completedDate?.slice(0, 7) === month).length
  const booksCompletedYear = books.filter(({ status, completedDate }) => status === 'completed' && completedDate?.slice(0, 4) === year).length
  const yearSessions = sessions.filter(({ date }) => date.slice(0, 4) === year)
  const pages = monthSessions.reduce((total, session) => total + session.pages, 0); const minutes = monthSessions.reduce((total, session) => total + session.minutes, 0)
  const minutesYear = yearSessions.reduce((total, session) => total + session.minutes, 0)
  return { reading: books.filter(({ status }) => status === 'reading').length, booksCompletedMonth, booksCompletedYear, pages, minutes, minutesYear, goalBooks: goal?.books ?? 0, goalPages: goal?.pages ?? 0, goalMinutes: goal?.minutes ?? 0 }
}
export function bookProgress(book: ReadingEntity<ReadingBookData>) { return book.totalPages && book.totalPages > 0 ? Math.min(100, Math.round(book.pagesRead / book.totalPages * 100)) : null }
