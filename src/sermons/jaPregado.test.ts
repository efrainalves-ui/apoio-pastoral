import { describe, expect, it } from 'vitest'
import type { AgendaEventEntity } from '../agenda/types'
import type { ChurchEntity } from '../district/types'
import { sermonReportLines } from '../reports/areaReports'
import { historicosPorSermao } from './biblioteca'
import { alvosDaEscolha, chaveDoJaPregado, planejarJaPregado, type PregacaoAnteriorEntity } from './jaPregado'
import { formatPreachingDate, lastPreaching, listPreachings } from './preachings'
import type { SermonEntity } from './types'

const SERMAO = 'sermao-ficticio'
const AGORA = new Date('2026-09-10T12:00:00.000Z')

const igrejas = [
  { id: 'igreja-a', name: 'Igreja Fictícia A', status: 'active' },
  { id: 'igreja-b', name: 'Igreja Fictícia B', status: 'active' },
  { id: 'igreja-c', name: 'Igreja Fictícia C', status: 'active' },
  { id: 'igreja-arquivada', name: 'Igreja Fictícia Arquivada', status: 'archived' },
] as ChurchEntity[]

function anterior(partes: Partial<PregacaoAnteriorEntity>): PregacaoAnteriorEntity {
  return { id: crypto.randomUUID(), sermonId: SERMAO, churchId: 'igreja-a', lugar: '', data: '', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z', ...partes }
}

function pregacaoNaAgenda(partes: Partial<AgendaEventEntity>): AgendaEventEntity {
  return {
    id: crypto.randomUUID(), title: 'Pregação', category: 'preaching', churchId: 'igreja-b',
    location: '', address: '', visitTarget: 'none', sermonId: SERMAO, sermonSnapshot: null,
    startAt: '2026-08-01T09:00:00.000Z', endAt: '2026-08-01T10:30:00.000Z', allDay: false,
    reminderMinutes: null, notes: '', includeInItinerary: true, mondayException: false,
    createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z',
    ...partes,
  }
}

describe('marcar como já pregado', () => {
  it('uma igreja, sem data', () => {
    const alvos = alvosDaEscolha('uma', igrejas, ['igreja-a'], '')
    const plano = planejarJaPregado(SERMAO, alvos, [], [], AGORA)

    expect(plano.registrar).toEqual([{ churchId: 'igreja-a', lugar: '' }])
    expect(plano.jaConstam).toEqual([])
  })

  it('várias igrejas, sem data', () => {
    const plano = planejarJaPregado(SERMAO, alvosDaEscolha('varias', igrejas, ['igreja-a', 'igreja-c'], ''), [], [], AGORA)

    expect(plano.registrar.map(({ churchId }) => churchId)).toEqual(['igreja-a', 'igreja-c'])
  })

  it('todas as igrejas ativas, sem a arquivada', () => {
    const alvos = alvosDaEscolha('todas', igrejas, [], '')

    expect(alvos.map(({ churchId }) => churchId)).toEqual(['igreja-a', 'igreja-b', 'igreja-c'])
  })

  it('igreja que já estava registrada fica de fora e aparece como já constando', () => {
    const plano = planejarJaPregado(SERMAO, alvosDaEscolha('todas', igrejas, [], ''), [], [anterior({ churchId: 'igreja-a' })], AGORA)

    expect(plano.jaConstam.map(({ churchId }) => churchId)).toEqual(['igreja-a'])
    expect(plano.registrar.map(({ churchId }) => churchId)).toEqual(['igreja-b', 'igreja-c'])
  })

  it('pregação já feita pela Agenda também conta como registrada; a programada não', () => {
    const plano = planejarJaPregado(SERMAO, alvosDaEscolha('todas', igrejas, [], ''), [
      pregacaoNaAgenda({ churchId: 'igreja-b' }),
      pregacaoNaAgenda({ churchId: 'igreja-c', startAt: '2026-10-01T09:00:00.000Z', endAt: '2026-10-01T10:30:00.000Z' }),
    ], [], AGORA)

    expect(plano.jaConstam.map(({ churchId }) => churchId)).toEqual(['igreja-b'])
    expect(plano.registrar.map(({ churchId }) => churchId)).toEqual(['igreja-a', 'igreja-c'])
  })

  it('não repete igreja nem outra igreja escrita de outro jeito', () => {
    const repetidas = planejarJaPregado(SERMAO, [
      { churchId: 'igreja-a', lugar: '' }, { churchId: 'igreja-a', lugar: '' },
    ], [], [], AGORA)
    expect(repetidas.registrar).toHaveLength(1)

    const outra = planejarJaPregado(SERMAO, alvosDaEscolha('outra', igrejas, [], '  capela fictícia do campo '), [], [anterior({ churchId: null, lugar: 'Capela Ficticia do Campo' })], AGORA)
    expect(outra.registrar).toEqual([])
    expect(outra.jaConstam).toHaveLength(1)
  })

  it('outro sermão não conta como registrado', () => {
    const plano = planejarJaPregado(SERMAO, alvosDaEscolha('uma', igrejas, ['igreja-a'], ''), [], [anterior({ sermonId: 'outro-sermao' })], AGORA)

    expect(plano.registrar).toHaveLength(1)
  })

  it('a chave é a mesma para o mesmo sermão e igreja', () => {
    expect(chaveDoJaPregado('conta', SERMAO, { churchId: null, lugar: 'Capela Fictícia' }))
      .toBe(chaveDoJaPregado('conta', SERMAO, { churchId: null, lugar: ' capela ficticia' }))
    expect(chaveDoJaPregado('conta', SERMAO, { churchId: 'igreja-a', lugar: '' }))
      .not.toBe(chaveDoJaPregado('conta', SERMAO, { churchId: 'igreja-b', lugar: '' }))
  })
})

describe('histórico com data não informada', () => {
  it('entra no histórico do sermão como "Data não informada", depois das datadas', () => {
    const lista = listPreachings([pregacaoNaAgenda({})], igrejas, SERMAO, AGORA, [anterior({ churchId: 'igreja-a' }), anterior({ churchId: 'igreja-c', data: '2026-03-14' })])

    expect(lista.map(({ place, date }) => [place, date])).toEqual([
      ['Igreja Fictícia B', '2026-08-01'], ['Igreja Fictícia C', '2026-03-14'], ['Igreja Fictícia A', ''],
    ])
    expect(lista[2]?.origem).toBe('anterior')
    expect(formatPreachingDate(lista[2]!.date)).toBe('Data não informada')
    expect(lastPreaching(lista)?.date).toBe('2026-08-01')
  })

  it('conta nas estatísticas da biblioteca e do relatório', () => {
    const sermao = { id: SERMAO, title: 'Sermão fictício', updatedAt: '2026-01-01' } as SermonEntity
    const historico = historicosPorSermao([sermao], [], igrejas, AGORA, [anterior({}), anterior({ churchId: 'igreja-b' })]).get(SERMAO)
    expect(historico?.vezes).toBe(2)

    const linhas = sermonReportLines([], 1, (id) => igrejas.find((igreja) => igreja.id === id)?.name ?? 'Distrito', false, [
      { data: '', churchId: 'igreja-a', lugar: '', titulo: 'Sermão fictício' },
    ])
    expect(linhas[0]).toBe('Pregações: 1')
    expect(linhas[1]).toBe('Data não informada · Igreja Fictícia A')
  })
})
