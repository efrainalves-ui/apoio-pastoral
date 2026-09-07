import { describe, expect, it } from 'vitest'
import { areaComparison, type AreaSources } from './areas'
import type { GoalEntity } from './types'

const semNada: AreaSources = { entries: [], studies: [], uapgs: [], history: [] }

function fontes(atual: number, anterior: number): AreaSources {
  return {
    ...semNada,
    entries: atual > 0
      ? [{ id: 'e1', churchId: 'igreja-1', metric: 'tithes', date: '2026-03-01', amount: atual, source: 'pdf', reference: '', createdAt: '' }]
      : [],
    history: anterior > 0
      ? [{ id: 'h1', area: 'tithes', year: 2025, amount: anterior, source: 'pdf', reference: '', createdAt: '', updatedAt: '' }]
      : [],
  }
}

const meta = (target: number, targetKind?: 'value' | 'percent'): GoalEntity[] => [{
  id: 'meta-1', churchId: null, year: 2026, metric: 'tithes', target,
  ...(targetKind ? { targetKind } : {}), createdAt: '', updatedAt: '',
}]

describe('meta de dízimos escrita em porcentagem', () => {
  it('traduz a porcentagem em número, usando o ano anterior', () => {
    // "Dez por cento a mais que 1000" é 1100 — é contra isso que se mede.
    const comparacao = areaComparison('tithes', meta(10, 'percent'), fontes(550, 1000), 2026)

    expect(comparacao.objective).toBe(1100)
    expect(comparacao.percent).toBe(50)
    expect(comparacao.missing).toBe(550)
  })

  it('sem ano anterior, avisa em vez de inventar progresso', () => {
    // Dez por cento a mais do que nada não é meta. Mostrar 0% ou 100% aqui
    // seria dar um número onde não existe um.
    const comparacao = areaComparison('tithes', meta(10, 'percent'), fontes(550, 0), 2026)

    expect(comparacao.withoutBaseline).toBe(true)
    expect(comparacao.objective).toBe(0)
    expect(comparacao.percent).toBe(0)
  })

  it('meta antiga em valor continua valendo como valor, e pede para ser reescrita', () => {
    // Reinterpretar 50000 como cinquenta mil por cento seria inventar um número
    // absurdo em cima de dado real que o pastor já tinha digitado.
    const comparacao = areaComparison('tithes', meta(1000), fontes(550, 1000), 2026)

    expect(comparacao.legacyValueTarget).toBe(true)
    expect(comparacao.targetKind).toBe('value')
    expect(comparacao.objective).toBe(1000)
    expect(comparacao.percent).toBe(55)
  })

  it('área que não é financeira segue medindo por valor', () => {
    const comparacao = areaComparison('baptisms', [{
      id: 'meta-b', churchId: null, year: 2026, metric: 'baptisms', target: 30, createdAt: '', updatedAt: '',
    }], semNada, 2026)

    expect(comparacao.targetKind).toBe('value')
    expect(comparacao.legacyValueTarget).toBe(false)
    expect(comparacao.objective).toBe(30)
  })
})
