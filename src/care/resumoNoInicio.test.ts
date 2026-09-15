import { describe, expect, it } from 'vitest'
import { diaDaVisita, resumoDeVisitacaoNoInicio } from './resumoNoInicio'
import type { FollowUpEntity, VisitEntity } from './types'

const HOJE = new Date(2026, 8, 15, 10, 0)

function visita(id: string, dia: string, alvo = 'pessoa-1', corrigidaPara?: string): VisitEntity {
  const versao = (version: number, startAt: string) => ({ version, correctedAt: '', answers: [], participants: [], reason: 'routine', startAt, endAt: startAt, notes: '' })
  const versions = corrigidaPara ? [versao(1, `${dia}T10:00`), versao(2, `${corrigidaPara}T10:00`)] : [versao(1, `${dia}T10:00`)]
  return {
    id, targetType: 'person', targetId: alvo, churchId: 'igreja-ficticia', scheduledEventId: null, mode: 'quick', status: 'completed',
    currentVersion: versions.length, versions, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  } as unknown as VisitEntity
}
const acompanhamento = (status: FollowUpEntity['status']) => ({ id: `a-${status}`, status } as FollowUpEntity)

describe('resumo de visitação na tela inicial', () => {
  it('conta as visitas dos últimos 30 dias e as pessoas diferentes visitadas', () => {
    const resumo = resumoDeVisitacaoNoInicio([visita('1', '2026-09-10'), visita('2', '2026-09-14'), visita('3', '2026-08-17', 'pessoa-2')], [], HOJE)
    expect(resumo).toMatchObject({ realizadas: 3, visitados: 2, tendencia: null })
  })

  it('a janela inclui o 29º dia atrás e deixa o 30º para o período anterior', () => {
    const resumo = resumoDeVisitacaoNoInicio([visita('1', '2026-08-17'), visita('2', '2026-08-16')], [], HOJE)
    expect(resumo.realizadas).toBe(1)
    expect(resumo.tendencia).toEqual({ anterior: 1, diferenca: 0, percentual: 0 })
  })

  it('só compara quando há visita anterior à janela', () => {
    const resumo = resumoDeVisitacaoNoInicio([visita('1', '2026-09-01'), visita('2', '2026-09-02'), visita('3', '2026-08-05'), visita('4', '2026-01-10')], [], HOJE)
    expect(resumo.tendencia).toEqual({ anterior: 1, diferenca: 1, percentual: 100 })
    const semAnteriorNaJanela = resumoDeVisitacaoNoInicio([visita('1', '2026-09-01'), visita('4', '2026-01-10')], [], HOJE)
    expect(semAnteriorNaJanela.tendencia).toEqual({ anterior: 0, diferenca: 1, percentual: null })
  })

  it('vale o dia da versão corrigida, não o dia da primeira anotação', () => {
    expect(diaDaVisita(visita('1', '2026-07-01', 'pessoa-1', '2026-09-12'))).toBe('2026-09-12')
    expect(resumoDeVisitacaoNoInicio([visita('1', '2026-07-01', 'pessoa-1', '2026-09-12')], [], HOJE).realizadas).toBe(1)
  })

  it('acompanhamentos pendentes são só os pendentes', () => {
    expect(resumoDeVisitacaoNoInicio([], [acompanhamento('pending'), acompanhamento('completed'), acompanhamento('cancelled')], HOJE).acompanhamentosPendentes).toBe(1)
  })
})
