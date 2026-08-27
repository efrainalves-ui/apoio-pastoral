import type { CipherEnvelope } from '../crypto/types'

export const BOOK_CATEGORIES = ['bible', 'theology', 'leadership', 'devotional', 'family', 'fiction', 'other'] as const
export type BookCategory = (typeof BOOK_CATEGORIES)[number]
export const BOOK_CATEGORY_LABELS: Record<BookCategory, string> = { bible: 'Bíblia', theology: 'Teologia', leadership: 'Liderança', devotional: 'Devocional', family: 'Família', fiction: 'Ficção', other: 'Outra' }
export const BOOK_STATUSES = ['want_to_read', 'reading', 'completed', 'paused'] as const
export type BookStatus = (typeof BOOK_STATUSES)[number]
export const BOOK_STATUS_LABELS: Record<BookStatus, string> = { want_to_read: 'Quero ler', reading: 'Lendo', completed: 'Concluído', paused: 'Pausado' }

export interface ReadingBookData { title: string; author: string; category: BookCategory; totalPages: number | null; pagesRead: number; startDate: string; completedDate: string | null; status: BookStatus; notes: string; createdAt: string; updatedAt: string }
export interface ReadingSessionData { bookId: string; date: string; pages: number; minutes: number; notes: string; createdAt: string; updatedAt: string }
export interface ReadingGoalData { month: string; books: number; pages: number; minutes: number; createdAt: string; updatedAt: string }
export type ReadingRecordType = 'book' | 'session' | 'goal'
export interface ReadingDataByType { book: ReadingBookData; session: ReadingSessionData; goal: ReadingGoalData }
export type ReadingEntity<T> = T & { id: string }
export interface ReadingStoredRecord extends CipherEnvelope { id: string; accountId: string; recordType: ReadingRecordType; createdAt: string; updatedAt: string }
