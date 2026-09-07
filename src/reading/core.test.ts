import { describe, expect, it } from 'vitest'
import { metaAnualDeLivros, readingSummary } from './core'
import type { ReadingBookData, ReadingEntity, ReadingGoalData, ReadingSessionData } from './types'

const meta = (month: string, books: number): ReadingEntity<ReadingGoalData> =>
  ({ id: month, month, books, pages: 0, minutes: 0, createdAt: '', updatedAt: '' })

const livro = (completedDate: string): ReadingEntity<ReadingBookData> => ({
  id: completedDate, title: 'Livro Fictício', author: '', category: 'devotional', status: 'completed',
  totalPages: 0, pagesRead: 0, startDate: '', completedDate, notes: '', createdAt: '', updatedAt: '',
})

describe('a meta de livros é do ano', () => {
  it('vale para o ano inteiro, escrita em qualquer mês', () => {
    // Livro não se lê por mês: um de trezentas páginas atravessa três.
    // Escrevê-la em janeiro basta para valer em setembro.
    expect(metaAnualDeLivros([meta('2026-01', 12)], '2026')).toBe(12)
  })

  it('a última escrita do ano é a que vale', () => {
    expect(metaAnualDeLivros([meta('2026-01', 12), meta('2026-06', 18)], '2026')).toBe(18)
  })

  it('não empresta a meta de outro ano', () => {
    expect(metaAnualDeLivros([meta('2025-01', 12)], '2026')).toBe(0)
  })
})

describe('o resumo de leitura', () => {
  it('compara os livros concluídos no ano com a meta do ano', () => {
    const livros = [livro('2026-02-10'), livro('2026-07-03'), livro('2025-12-01')]
    const sessoes: Array<ReadingEntity<ReadingSessionData>> = []

    const resumo = readingSummary(livros, sessoes, null, '2026-09', [meta('2026-01', 12)])

    expect(resumo.goalBooks).toBe(12)
    expect(resumo.booksCompletedYear).toBe(2)
    expect(resumo.booksCompletedMonth).toBe(0)
  })
})
