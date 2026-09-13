import { describe, expect, it } from 'vitest'
import type { EvangelismCampaignEntity } from '../evangelism/types'
import { CAMPANHAS_NO_RELATORIO, conferirCampanhas, contarDivergencias, noTrimestre } from './campanhas'
import type { RelatorioIntegradoEntity } from './types'

function campanha(overrides: Partial<EvangelismCampaignEntity> = {}): EvangelismCampaignEntity {
  return {
    id: crypto.randomUUID(), name: 'Semana Santa Fictícia', objective: 'holy_week',
    churchIds: ['igreja-a'], startDate: '2026-02-10', endDate: '2026-02-17',
    location: '', address: '', responsibleGeneral: '', mainSpeaker: '', team: [],
    status: 'completed', description: '', notes: '', goalId: null, planningAreas: [],
    additionalSchedule: { enabled: false, days: [], startTime: '', endTime: '' },
    mainAgendaEventId: null, additionalAgendaEventIds: [], points: [], tasks: [], checklist: [],
    plannedBudget: 0, budgetItems: [], followUps: [], learnings: '', history: [],
    createdAt: '', updatedAt: '', ...overrides,
  } as EvangelismCampaignEntity
}

function relatorio(churchId: string, trimestre: string, declaradas: number | null): RelatorioIntegradoEntity {
  return {
    id: crypto.randomUUID(), churchId, trimestre,
    valores: declaradas === null ? {} : { [CAMPANHAS_NO_RELATORIO]: { tipo: 'numero', valor: declaradas } },
    origem: { arquivo: 'x.pdf', paginas: [1] }, importBatchId: '', createdAt: '', updatedAt: '',
  }
}

/*
  Pela data e pela igreja, nunca pelo nome. "Semana Santa" se repete todo ano e
  em toda igreja: deduplicar por texto juntaria campanhas diferentes e separaria
  a mesma escrita de dois jeitos.
*/
describe('qual campanha pertence ao trimestre', () => {
  it('a que acontece dentro dele', () => {
    expect(noTrimestre(campanha(), '2026-1')).toBe(true)
    expect(noTrimestre(campanha(), '2026-2')).toBe(false)
  })

  it('a que atravessa a virada do trimestre pertence aos dois', () => {
    const atravessa = campanha({ startDate: '2026-03-25', endDate: '2026-04-05' })
    expect(noTrimestre(atravessa, '2026-1')).toBe(true)
    expect(noTrimestre(atravessa, '2026-2')).toBe(true)
  })

  it('mesmo nome em outro ano não é a mesma campanha', () => {
    expect(noTrimestre(campanha({ startDate: '2025-02-10', endDate: '2025-02-17' }), '2026-1')).toBe(false)
  })

  it('sem data nenhuma, não dá para dizer, e não se chuta', () => {
    expect(noTrimestre(campanha({ startDate: '', endDate: '' }), '2026-1')).toBe(false)
  })
})

describe('a conferência entre o declarado e o cadastrado', () => {
  it('confere quando os números batem', () => {
    const conferencia = conferirCampanhas([relatorio('igreja-a', '2026-1', 1)], [campanha()], '2026-1')
    expect(conferencia[0]?.situacao).toBe('confere')
    expect(contarDivergencias(conferencia)).toBe(0)
  })

  it('aponta quando a igreja declarou mais do que existe cadastrado', () => {
    const conferencia = conferirCampanhas([relatorio('igreja-a', '2026-1', 3)], [campanha()], '2026-1')
    expect(conferencia[0]).toMatchObject({ declaradas: 3, situacao: 'faltam_cadastrar' })
    expect(conferencia[0]?.cadastradas).toHaveLength(1)
  })

  it('aponta quando há mais cadastradas do que a igreja declarou', () => {
    const conferencia = conferirCampanhas(
      [relatorio('igreja-a', '2026-1', 1)],
      [campanha(), campanha({ name: 'Outra Fictícia', startDate: '2026-03-01', endDate: '2026-03-08' })],
      '2026-1')
    expect(conferencia[0]?.situacao).toBe('sobram_cadastradas')
  })

  /* Zero declarado é resposta: se há campanha cadastrada, a divergência aparece. */
  it('zero declarado com campanha cadastrada é divergência', () => {
    const conferencia = conferirCampanhas([relatorio('igreja-a', '2026-1', 0)], [campanha()], '2026-1')
    expect(conferencia[0]).toMatchObject({ declaradas: 0, situacao: 'sobram_cadastradas' })
  })

  /* Ausência não é zero: quem não informou não entra na conferência. */
  it('indicador ausente não gera linha de conferência', () => {
    expect(conferirCampanhas([relatorio('igreja-a', '2026-1', null)], [campanha()], '2026-1')).toEqual([])
  })

  it('campanha de outra igreja não conta para esta', () => {
    const conferencia = conferirCampanhas(
      [relatorio('igreja-a', '2026-1', 1)], [campanha({ churchIds: ['igreja-b'] })], '2026-1')
    expect(conferencia[0]?.situacao).toBe('faltam_cadastrar')
    expect(conferencia[0]?.cadastradas).toEqual([])
  })

  it('campanha cancelada não conta', () => {
    const conferencia = conferirCampanhas(
      [relatorio('igreja-a', '2026-1', 0)], [campanha({ status: 'cancelled' })], '2026-1')
    expect(conferencia[0]?.situacao).toBe('confere')
  })

  /* A conferência não cria, não une e não apaga nada: só mostra. */
  it('não altera as campanhas cadastradas', () => {
    const cadastradas = [campanha()]
    const copia = JSON.stringify(cadastradas)
    conferirCampanhas([relatorio('igreja-a', '2026-1', 5)], cadastradas, '2026-1')
    expect(JSON.stringify(cadastradas)).toBe(copia)
  })
})
