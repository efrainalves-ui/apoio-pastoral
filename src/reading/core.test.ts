import { describe, expect, it } from 'vitest'
import {
  acumuladoAteOMes, datasCoerentes, formatarTempo, mesesDoAno, metaDoAno, propostaDeSoma, relatorioMensal, resumoAnual, revisaoPendente, sessaoDoRegistroRetroativo,
} from './core'
import type { ReadingAnnualGoalData, ReadingBookData, ReadingEntity, ReadingGoalRecordData, ReadingSessionData } from './types'

const livro = (id: string, extra: Partial<ReadingBookData> = {}): ReadingEntity<ReadingBookData> => ({
  id, title: `Livro Fictício ${id}`, author: 'Autora Fictícia', category: 'devotional', status: 'reading',
  totalPages: 300, pagesRead: 0, startDate: '2026-01-05', completedDate: null, notes: '', createdAt: '', updatedAt: '', ...extra,
})
const sessao = (id: string, bookId: string, date: string, pages: number, minutes: number): ReadingEntity<ReadingSessionData> =>
  ({ id, bookId, date, pages, minutes, notes: '', createdAt: `${date}T10:00:00Z`, updatedAt: '' })
const anual = (year: string, books: number | null, pages: number | null): ReadingEntity<ReadingAnnualGoalData> =>
  ({ id: `anual-${year}`, tipo: 'anual', year, books, pages, createdAt: '', updatedAt: '' })
const mensal = (month: string, books: number, pages: number): ReadingEntity<ReadingGoalRecordData> =>
  ({ id: `mensal-${month}`, month, books, pages, minutes: 300, createdAt: '', updatedAt: '' })

/*
  Um livro de trezentas páginas lido de janeiro a março, concluído em março; outro
  concluído em fevereiro; e uma sessão de dezembro do ano anterior.
*/
const LIVROS = [
  livro('longo', { status: 'completed', completedDate: '2026-03-10', pagesRead: 300 }),
  livro('curto', { status: 'completed', completedDate: '2026-02-20', totalPages: 120, pagesRead: 120 }),
  livro('antigo', { status: 'completed', completedDate: '2025-12-30' }),
]
const SESSOES = [
  sessao('s1', 'longo', '2026-01-31', 100, 95),
  sessao('s2', 'longo', '2026-02-01', 100, 80),
  sessao('s3', 'curto', '2026-02-01', 120, 100),
  sessao('s4', 'longo', '2026-03-10', 100, 60),
  sessao('s5', 'antigo', '2025-12-31', 50, 40),
  sessao('ruim', 'curto', '2026-02-02', -30, -10),
]

describe('meta anual de leitura', () => {
  it('livros e páginas contra a meta do ano; tempo só como resultado; nada negativo', () => {
    const resumo = resumoAnual(LIVROS, SESSOES, '2026', anual('2026', 15, 5000))
    expect(resumo.livros).toEqual({ feito: 2, meta: 15, percentual: 13, faltam: 13, superadaEm: null })
    expect(resumo.paginas).toEqual({ feito: 420, meta: 5000, percentual: 8, faltam: 4580, superadaEm: null })
    expect(resumo.minutos).toBe(335)
    expect(formatarTempo(2555)).toBe('42h 35min')
    expect(formatarTempo(420)).toBe('7h')
    expect(formatarTempo(35)).toBe('35min')
  })

  it('meta superada mostra o valor real, acima de 100%; sem meta, continua mostrando o resultado', () => {
    const superada = resumoAnual(LIVROS, SESSOES, '2026', anual('2026', 1, 400))
    expect(superada.livros).toMatchObject({ feito: 2, percentual: 200, faltam: 0, superadaEm: 1 })
    expect(superada.paginas).toMatchObject({ feito: 420, percentual: 105, superadaEm: 20 })
    expect(resumoAnual(LIVROS, SESSOES, '2026', null).livros).toEqual({ feito: 2, meta: null, percentual: null, faltam: null, superadaEm: null })
    // Só páginas: o campo de livros fica sem meta.
    expect(resumoAnual(LIVROS, SESSOES, '2026', anual('2026', null, 1000)).livros.meta).toBeNull()
  })

  it('uma meta por ano; anos diferentes não se emprestam', () => {
    const metas = [anual('2025', 10, 3000), anual('2026', 15, 5000)]
    expect(metaDoAno(metas, '2026')).toMatchObject({ books: 15 })
    expect(metaDoAno(metas, '2027')).toBeNull()
  })
})

describe('relatório mensal', () => {
  it('páginas e tempo pela data da sessão; o livro conta só no mês da conclusão; virada de mês e de ano', () => {
    const janeiro = relatorioMensal(LIVROS, SESSOES, '2026-01')
    expect(janeiro).toMatchObject({ paginas: 100, minutos: 95, sessoes: 1, dias: 1 })
    expect(janeiro.livrosConcluidos).toHaveLength(0)
    expect(janeiro.livrosLidos.map(({ id }) => id)).toEqual(['longo'])

    const fevereiro = relatorioMensal(LIVROS, SESSOES, '2026-02')
    expect(fevereiro).toMatchObject({ paginas: 220, minutos: 180, sessoes: 3, dias: 2 })
    expect(fevereiro.livrosConcluidos.map(({ id }) => id)).toEqual(['curto'])
    expect(fevereiro.livrosLidos.map(({ id }) => id).sort()).toEqual(['curto', 'longo'])

    expect(relatorioMensal(LIVROS, SESSOES, '2026-03').livrosConcluidos.map(({ id }) => id)).toEqual(['longo'])
    expect(relatorioMensal(LIVROS, SESSOES, '2025-12')).toMatchObject({ paginas: 50, minutos: 40 })
  })

  it('editar ou excluir a sessão recalcula; o acumulado vai de janeiro até o mês; os meses são resultado', () => {
    const semA = SESSOES.filter(({ id }) => id !== 's2')
    expect(relatorioMensal(LIVROS, semA, '2026-02').paginas).toBe(120)
    const editada = SESSOES.map((item) => item.id === 's3' ? { ...item, pages: 60 } : item)
    expect(relatorioMensal(LIVROS, editada, '2026-02').paginas).toBe(160)

    expect(acumuladoAteOMes(LIVROS, SESSOES, '2026-02')).toEqual({ livros: 1, paginas: 320, minutos: 275 })
    const meses = mesesDoAno(LIVROS, SESSOES, '2026')
    expect(meses).toHaveLength(12)
    expect(meses[2]).toEqual({ mes: '2026-03', livros: 1, paginas: 100, minutos: 60, temRegistro: true })
    expect(meses[11]).toEqual({ mes: '2026-12', livros: 0, paginas: 0, minutos: 0, temRegistro: false })
  })
})

/*
  O registro do pastor: um livro, oitenta páginas e uma hora e meia, no mesmo mês.

  Os três números vêm de campos diferentes e não podem se trocar pelo caminho: o
  ano, o relatório do mês e a linha daquele mês precisam dizer a mesma coisa.
*/
describe('um livro, 80 páginas e 90 minutos no mesmo mês', () => {
  const UNICO = [livro('unico', { status: 'completed', startDate: '2026-09-01', completedDate: '2026-09-16', totalPages: 80, pagesRead: 80 })]
  const UMA = [sessao('u1', 'unico', '2026-09-16', 80, 90)]

  it('o ano, o mês e a linha do mês mostram 1 livro, 80 páginas e 1h 30min', () => {
    const anoTodo = resumoAnual(UNICO, UMA, '2026', null)
    expect(anoTodo.livros.feito).toBe(1)
    expect(anoTodo.paginas.feito).toBe(80)
    expect(anoTodo.minutos).toBe(90)
    expect(formatarTempo(anoTodo.minutos)).toBe('1h 30min')

    const setembro = relatorioMensal(UNICO, UMA, '2026-09')
    expect(setembro).toMatchObject({ paginas: 80, minutos: 90, sessoes: 1, dias: 1 })
    expect(setembro.livrosConcluidos.map(({ id }) => id)).toEqual(['unico'])
    expect(setembro.historico.map(({ pages, minutes }) => ({ pages, minutes }))).toEqual([{ pages: 80, minutes: 90 }])

    // `1` é a quantidade de livros e `80` são as páginas — nunca o contrário.
    const linhas = mesesDoAno(UNICO, UMA, '2026')
    expect(linhas[8]).toEqual({ mes: '2026-09', livros: 1, paginas: 80, minutos: 90, temRegistro: true })
    expect(linhas.filter(({ temRegistro }) => temRegistro)).toHaveLength(1)
    expect(acumuladoAteOMes(UNICO, UMA, '2026-09')).toEqual({ livros: 1, paginas: 80, minutos: 90 })
  })
})

describe('metas mensais antigas', () => {
  const antigas = [mensal('2026-01', 12, 300), mensal('2026-02', 12, 400), mensal('2026-06', 18, 500), mensal('2025-11', 10, 200)]

  it('revisão só com meta antiga e sem decisão registrada', () => {
    expect(revisaoPendente([])).toBe(false)
    expect(revisaoPendente(antigas)).toBe(true)
    expect(revisaoPendente([...antigas, { id: 'r', tipo: 'revisao', decisao: 'ignorar', createdAt: '', updatedAt: '' }])).toBe(false)
  })

  it('somar: páginas dos meses, livros da última meta do ano, minutos fora; ano com meta anual fica como está', () => {
    expect(propostaDeSoma(antigas)).toEqual([
      { year: '2025', books: 10, pages: 200 },
      { year: '2026', books: 18, pages: 1200 },
    ])
    expect(propostaDeSoma([...antigas, anual('2026', 20, 6000)])).toEqual([{ year: '2025', books: 10, pages: 200 }])
  })
})

describe('registrar leitura que já aconteceu', () => {
  const lido = { startDate: '2026-02-03', completedDate: '2026-02-20', pagesRead: 180 }

  it('a sessão nasce na data da conclusão, ou do início; sem páginas e sem tempo, nada', () => {
    expect(sessaoDoRegistroRetroativo(lido, 420, 'livro-ficticio')).toMatchObject({ bookId: 'livro-ficticio', date: '2026-02-20', pages: 180, minutes: 420 })
    expect(sessaoDoRegistroRetroativo({ ...lido, completedDate: null }, 60, 'l')?.date).toBe('2026-02-03')
    expect(sessaoDoRegistroRetroativo({ ...lido, pagesRead: 0 }, 0, 'l')).toBeNull()
    expect(sessaoDoRegistroRetroativo({ startDate: '', completedDate: null, pagesRead: 10 }, 30, 'l')).toBeNull()
    expect(sessaoDoRegistroRetroativo({ ...lido, pagesRead: -5 }, 90, 'l')).toMatchObject({ pages: 0, minutes: 90 })
  })

  it('a conclusão não pode ser antes do começo', () => {
    expect(datasCoerentes('2026-02-03', '2026-02-02')).toBe(false)
    expect(datasCoerentes('2026-02-03', '2026-02-20')).toBe(true)
    expect(datasCoerentes('2026-02-03', null)).toBe(true)
  })
})
