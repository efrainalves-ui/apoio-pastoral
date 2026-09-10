import { describe, expect, it } from 'vitest'
import type { AgendaEventEntity } from '../agenda/types'
import type { ChurchEntity } from '../district/types'
import { contarPorFiltro, historicosPorSermao, ordenar, passaNoFiltro } from './biblioteca'
import { abreviacaoDoLivro } from './livros'
import type { SermonEntity } from './types'

const IGREJA: ChurchEntity = {
  id: 'igreja-ficticia', districtId: 'distrito-ficticio', name: 'Igreja Fictícia do Porto', type: 'organized_church',
  externalCode: '', address: '', worshipSchedules: [], administrativeNotes: '', status: 'active', history: [],
  createdAt: '2026-01-01T10:00:00.000Z', updatedAt: '2026-01-01T10:00:00.000Z',
}

function sermao(id: string, overrides: Partial<SermonEntity> = {}): SermonEntity {
  return {
    id, title: `Sermão fictício ${id}`, theme: 'Esperança', mainText: 'João 3:16', complementaryTexts: '',
    objective: '', introduction: '', content: '', conclusion: '', appeal: '', notes: '', tags: [],
    status: 'draft', createdAt: '2026-01-01T10:00:00.000Z', updatedAt: '2026-01-01T10:00:00.000Z', ...overrides,
  }
}

function pregacao(id: string, sermonId: string, startAt: string): AgendaEventEntity {
  return {
    id, title: 'Pregação fictícia', category: 'preaching', churchId: IGREJA.id, location: '', address: '',
    visitTarget: 'none', sermonId, sermonSnapshot: null, startAt, endAt: startAt, allDay: false,
    reminderMinutes: null, notes: '', includeInItinerary: false, mondayException: false,
    createdAt: startAt, updatedAt: startAt,
  }
}

const AGORA = new Date('2026-09-10T12:00:00.000Z')

describe('abreviação do livro', () => {
  it('reconhece os livros mais usados', () => {
    expect(abreviacaoDoLivro('Gálatas 6:13–16')).toBe('GL')
    expect(abreviacaoDoLivro('2 Crônicas 7:14')).toBe('2CR')
    expect(abreviacaoDoLivro('João 10:10')).toBe('JO')
    expect(abreviacaoDoLivro('Romanos 8:28')).toBe('RM')
    expect(abreviacaoDoLivro('Mateus 22:37-40')).toBe('MT')
    expect(abreviacaoDoLivro('Apocalipse 21')).toBe('AP')
  })

  it('não confunde João com 1 João, que é outro livro', () => {
    expect(abreviacaoDoLivro('1 João 4:8')).toBe('1JO')
    expect(abreviacaoDoLivro('I João 4:8')).toBe('1JO')
    expect(abreviacaoDoLivro('3 João 1:4')).toBe('3JO')
    expect(abreviacaoDoLivro('João 4:8')).toBe('JO')
  })

  it('não confunde Jó com João', () => {
    expect(abreviacaoDoLivro('Jó 1:21')).toBe('JÓ')
  })

  it('aceita as formas que o pastor escreve à mão', () => {
    expect(abreviacaoDoLivro('II Timóteo 3:16')).toBe('2TM')
    expect(abreviacaoDoLivro('1ª Coríntios 13')).toBe('1CO')
    expect(abreviacaoDoLivro('salmos 23')).toBe('SL')
    expect(abreviacaoDoLivro('  Isaías 40:31  ')).toBe('IS')
  })

  it('devolve nulo quando não há livro reconhecível', () => {
    expect(abreviacaoDoLivro('')).toBeNull()
    expect(abreviacaoDoLivro('Sem texto base definido')).toBeNull()
  })
})

describe('biblioteca de sermões', () => {
  const sermons = [
    sermao('s1', { status: 'ready', updatedAt: '2026-03-01T10:00:00.000Z' }),
    sermao('s2', { status: 'draft', updatedAt: '2026-05-01T10:00:00.000Z' }),
    sermao('s3', { status: 'archived', updatedAt: '2026-01-05T10:00:00.000Z' }),
  ]
  const eventos = [
    pregacao('e1', 's1', '2026-02-01T19:00:00.000Z'),
    pregacao('e2', 's1', '2026-04-01T19:00:00.000Z'),
    // Agendada para o futuro: ainda não foi pregada, e não pode contar.
    pregacao('e3', 's2', '2026-12-01T19:00:00.000Z'),
  ]
  const historicos = historicosPorSermao(sermons, eventos, [IGREJA], AGORA)

  it('conta só o que já foi pregado', () => {
    expect(historicos.get('s1')?.vezes).toBe(2)
    expect(historicos.get('s1')?.ultimoLugar).toBe('Igreja Fictícia do Porto')
    expect(historicos.get('s2')?.vezes).toBe(0)
    expect(historicos.get('s3')?.vezes).toBe(0)
  })

  it('os contadores dos filtros somam o acervo', () => {
    expect(contarPorFiltro(sermons, historicos)).toEqual({ todos: 3, ready: 1, draft: 1, archived: 1, nunca: 2 })
  })

  it('cada filtro alcança o que promete', () => {
    expect(sermons.filter((s) => passaNoFiltro(s, 'nunca', historicos)).map(({ id }) => id)).toEqual(['s2', 's3'])
    expect(sermons.filter((s) => passaNoFiltro(s, 'ready', historicos)).map(({ id }) => id)).toEqual(['s1'])
    expect(sermons.filter((s) => passaNoFiltro(s, 'todos', historicos))).toHaveLength(3)
  })

  it('ordena pelo que o pastor pede', () => {
    expect(ordenar(sermons, 'recentes', historicos).map(({ id }) => id)).toEqual(['s2', 's1', 's3'])
    expect(ordenar(sermons, 'antigos', historicos).map(({ id }) => id)).toEqual(['s3', 's1', 's2'])
    expect(ordenar(sermons, 'pregados', historicos).map(({ id }) => id)).toEqual(['s1', 's2', 's3'])
    expect(ordenar(sermons, 'nunca', historicos)[0]?.id).toBe('s2')
    expect(ordenar(sermons, 'titulo', historicos).map(({ id }) => id)).toEqual(['s1', 's2', 's3'])
  })

  it('não altera a lista recebida', () => {
    const original = sermons.map(({ id }) => id)
    ordenar(sermons, 'titulo', historicos)
    expect(sermons.map(({ id }) => id)).toEqual(original)
  })

  it('aguenta um acervo grande sem travar', () => {
    const muitos = Array.from({ length: 500 }, (_, indice) => sermao(`grande-${indice}`))
    const muitasPregacoes = muitos.flatMap((s, indice) => indice % 3 ? [] : [pregacao(`p-${indice}`, s.id, '2026-02-01T19:00:00.000Z')])
    const inicio = performance.now()
    const mapa = historicosPorSermao(muitos, muitasPregacoes, [IGREJA], AGORA)
    expect(mapa.size).toBe(500)
    expect(performance.now() - inicio).toBeLessThan(1500)
  })
})
