import { describe, expect, it } from 'vitest'
import { datasCoerentes, metaAnualDeLivros, readingSummary, sessaoDoRegistroRetroativo } from './core'
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

describe('registrar leitura que já aconteceu', () => {
  const livro = { startDate: '2026-02-03', completedDate: '2026-02-20', pagesRead: 180 }

  /*
    O pastor registra em setembro um livro que leu em fevereiro, e quer que ele
    conte em fevereiro. A sessão nasce na data da conclusão, não na de hoje.
  */
  it('a sessão nasce na data da conclusão', () => {
    expect(sessaoDoRegistroRetroativo(livro, 420, 'livro-ficticio')).toMatchObject({
      bookId: 'livro-ficticio', date: '2026-02-20', pages: 180, minutes: 420,
    })
  })

  it('sem conclusão, usa a data de início', () => {
    expect(sessaoDoRegistroRetroativo({ ...livro, completedDate: null }, 60, 'l')?.date).toBe('2026-02-03')
  })

  /*
    Sem tempo e sem páginas não há leitura a registrar — criar uma sessão vazia
    encheria o histórico de linhas que não dizem nada.
  */
  it('sem tempo e sem páginas não cria sessão', () => {
    expect(sessaoDoRegistroRetroativo({ ...livro, pagesRead: 0 }, 0, 'l')).toBeNull()
  })

  it('só o tempo já basta', () => {
    expect(sessaoDoRegistroRetroativo({ ...livro, pagesRead: 0 }, 90, 'l')).toMatchObject({ minutes: 90, pages: 0 })
  })

  it('sem data nenhuma, não cria sessão', () => {
    expect(sessaoDoRegistroRetroativo({ startDate: '', completedDate: null, pagesRead: 10 }, 30, 'l')).toBeNull()
  })

  it('nada positivo, nada a registrar', () => {
    expect(sessaoDoRegistroRetroativo({ ...livro, pagesRead: -5 }, -10, 'l')).toBeNull()
  })

  /* Um número ruim num campo não pode contaminar o total do mês. */
  it('páginas negativas não viram total negativo quando há tempo', () => {
    expect(sessaoDoRegistroRetroativo({ ...livro, pagesRead: -5 }, 90, 'l')).toMatchObject({ pages: 0, minutes: 90 })
  })
})

describe('coerência das datas', () => {
  it('a conclusão não pode ser antes do começo', () => {
    expect(datasCoerentes('2026-02-03', '2026-02-02')).toBe(false)
    expect(datasCoerentes('2026-02-03', '2026-02-03')).toBe(true)
    expect(datasCoerentes('2026-02-03', '2026-02-20')).toBe(true)
  })

  it('sem conclusão, nada a conferir', () => {
    expect(datasCoerentes('2026-02-03', null)).toBe(true)
  })
})
