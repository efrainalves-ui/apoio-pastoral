import type { CipherEnvelope } from '../crypto/types'

export const BOOK_CATEGORIES = ['bible', 'theology', 'leadership', 'devotional', 'family', 'fiction', 'other'] as const
export type BookCategory = (typeof BOOK_CATEGORIES)[number]
export const BOOK_CATEGORY_LABELS: Record<BookCategory, string> = { bible: 'Bíblia', theology: 'Teologia', leadership: 'Liderança', devotional: 'Devocional', family: 'Família', fiction: 'Ficção', other: 'Outra' }
export const BOOK_STATUSES = ['want_to_read', 'reading', 'completed', 'paused'] as const
export type BookStatus = (typeof BOOK_STATUSES)[number]
export const BOOK_STATUS_LABELS: Record<BookStatus, string> = { want_to_read: 'Quero ler', reading: 'Lendo', completed: 'Concluído', paused: 'Pausado' }

export interface ReadingBookData { title: string; author: string; category: BookCategory; totalPages: number | null; pagesRead: number; startDate: string; completedDate: string | null; status: BookStatus; notes: string; createdAt: string; updatedAt: string }
export interface ReadingSessionData { bookId: string; date: string; pages: number; minutes: number; notes: string; createdAt: string; updatedAt: string }

/**
 * Meta mensal antiga.
 *
 * Nenhuma tela oferece mais: fica guardada como estava, para histórico e
 * recuperação, e só entra numa meta anual se o pastor escolher na revisão.
 */
export interface ReadingGoalData { month: string; books: number; pages: number; minutes: number; createdAt: string; updatedAt: string }

/** A meta do ano: livros e páginas, juntos ou separados. Tempo nunca é meta. */
export interface ReadingAnnualGoalData { tipo: 'anual'; year: string; books: number | null; pages: number | null; createdAt: string; updatedAt: string }

export type DecisaoSobreMetasAntigas = 'nova' | 'somar' | 'ignorar'
/** A revisão das metas mensais antigas, feita uma vez por conta. */
export interface ReadingGoalReviewData { tipo: 'revisao'; decisao: DecisaoSobreMetasAntigas; createdAt: string; updatedAt: string }

/**
 * Tudo que mora no registro de meta de leitura.
 *
 * O mesmo tipo de registro de sempre: cofre, sincronização, backup e
 * encerramento de distrito continuam tratando igual. O que muda é o formato
 * dentro dele, e as metas mensais antigas seguem legíveis.
 */
export type ReadingGoalRecordData = ReadingGoalData | ReadingAnnualGoalData | ReadingGoalReviewData

export type ReadingRecordType = 'book' | 'session' | 'goal'
export interface ReadingDataByType { book: ReadingBookData; session: ReadingSessionData; goal: ReadingGoalRecordData }
export type ReadingEntity<T> = T & { id: string }
export interface ReadingStoredRecord extends CipherEnvelope { id: string; accountId: string; recordType: ReadingRecordType; createdAt: string; updatedAt: string }
