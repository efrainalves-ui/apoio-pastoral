import { describe, expect, it } from 'vitest'
import { areaComparison, origemDosEstudos, resultadoDoRelatorioIntegrado, type AreaSources } from './areas'
import type { GoalEntity, GoalEntryEntity } from './types'

const lancamento = (overrides: Partial<GoalEntryEntity> = {}): GoalEntryEntity => ({
  id: crypto.randomUUID(), churchId: 'igreja-a', metric: 'bible_studies', date: '2026-03-01',
  amount: 15, source: 'pdf', reference: 'Relatório Integrado · 1º trimestre de 2026 · x.pdf',
  createdAt: '2026-03-01T00:00:00.000Z', ...overrides,
})

const fontes = (entries: GoalEntryEntity[] = [], studies: AreaSources['studies'] = []): AreaSources =>
  ({ entries, studies, uapgs: [] })

const meta = (target: number): GoalEntity => ({
  id: crypto.randomUUID(), churchId: null, year: 2026, metric: 'bible_studies', target,
  createdAt: '', updatedAt: '',
})

/* Estudos Bíblicos são por número: o que o relatório lança é o alcançado da meta. */
describe('o resultado vindo do Relatório Integrado', () => {
  it('soma por igreja e no total, e é o progresso da meta', () => {
    const entries = [lancamento(), lancamento({ churchId: 'igreja-b', amount: 7 })]
    const resultado = resultadoDoRelatorioIntegrado('bible_studies', entries, 2026)
    expect(resultado.total).toBe(22)
    expect(resultado.porIgreja).toHaveLength(2)
    expect(resultado.lancamentos).toBe(2)

    // O número do relatório é o alcançado da meta.
    expect(areaComparison('bible_studies', [], fontes(entries), 2026).result).toBe(22)
  })

  it('ignora lançamento de outra origem, de outro ano e de outra área', () => {
    const entries = [
      lancamento({ source: 'manual', reference: 'Digitado à mão' }),
      lancamento({ date: '2025-03-01' }),
      lancamento({ metric: 'baptisms' }),
      lancamento({ reference: 'Outro relatório qualquer' }),
    ]
    expect(resultadoDoRelatorioIntegrado('bible_studies', entries, 2026).total).toBe(0)
  })

  it('dois trimestres da mesma igreja somam no ano', () => {
    const entries = [lancamento({ amount: 15 }), lancamento({ date: '2026-06-01', amount: 8 })]
    const resultado = resultadoDoRelatorioIntegrado('bible_studies', entries, 2026)
    expect(resultado.total).toBe(23)
    expect(resultado.porIgreja).toEqual([{ churchId: 'igreja-a', amount: 23 }])
  })

  it('zero informado conta como lançamento de zero, e não some', () => {
    const resultado = resultadoDoRelatorioIntegrado('bible_studies', [lancamento({ amount: 0 })], 2026)
    expect(resultado.total).toBe(0)
    expect(resultado.lancamentos).toBe(1)
  })

  /* Ausência é ausência: nenhum lançamento, e nada fingindo ser zero. */
  it('sem lançamento nenhum, não há resultado do relatório', () => {
    const resultado = resultadoDoRelatorioIntegrado('bible_studies', [], 2026)
    expect(resultado.lancamentos).toBe(0)
    expect(resultado.porIgreja).toEqual([])
  })
})

/*
  Os estados que a tela precisa distinguir. Esconder o resultado porque falta
  combinar o alvo é esconder justamente o que já se conseguiu.
*/
describe('resultado e alvo, nas seis combinações', () => {
  it('resultado com meta definida: mostra os dois e a porcentagem', () => {
    const p = areaComparison('bible_studies', [meta(10)], fontes([lancamento({ amount: 1 }), lancamento({ amount: 1 })]), 2026)
    expect(p.result).toBe(2)
    expect(p.target).toBe(10)
    expect(p.percent).toBe(20)
  })

  it('resultado sem meta definida: o resultado continua valendo', () => {
    const p = areaComparison('bible_studies', [], fontes([lancamento({ amount: 1 }), lancamento({ amount: 1 })]), 2026)
    expect(p.result).toBe(2)
    expect(p.target).toBe(0)
    expect(p.percent).toBe(0)
  })

  it('meta definida sem resultado: a meta aparece e falta tudo', () => {
    const p = areaComparison('bible_studies', [meta(10)], fontes(), 2026)
    expect(p.result).toBe(0)
    expect(p.missing).toBe(10)
  })

  it('meta e resultado zerados: nada alcançado, e nada inventado', () => {
    const p = areaComparison('bible_studies', [meta(0)], fontes(), 2026)
    expect(p.result).toBe(0)
    expect(p.target).toBe(0)
    expect(p.reached).toBe(false)
  })

  /* Informação ausente não é zero: sem fonte nenhuma, não há o que alcançar. */
  it('sem informação, o percentual não inventa progresso', () => {
    const p = areaComparison('bible_studies', [], fontes(), 2026)
    expect(p.percent).toBe(0)
    expect(p.reached).toBe(false)
  })

  /*
    Valor bloqueado na conferência não vira lançamento, e por isso não aparece
    aqui nem no total do relatório.
  */
  it('valor bloqueado não chega ao resultado do relatório', () => {
    expect(resultadoDoRelatorioIntegrado('bible_studies', [], 2026).total).toBe(0)
  })
})

/*
  O exemplo do pastor: o primeiro trimestre informou 120 e a meta é 500 — a meta
  mostra 120 de 500. O segundo trimestre soma. O cadastro nominal aparece ao
  lado, com a diferença, e não entra na conta.
*/
describe('origem dos estudos bíblicos', () => {
  it('120 de 500 no primeiro trimestre; o segundo soma; o nominal só confere', () => {
    const nominais = [{ churchId: 'igreja-a', startedAt: '2026-02-10' }, { churchId: 'igreja-a', startedAt: '2026-08-01' }]
    let sources = fontes([lancamento({ amount: 120 })], nominais)
    expect(areaComparison('bible_studies', [meta(500)], sources, 2026)).toMatchObject({ result: 120, target: 500, percent: 24 })
    expect(origemDosEstudos(sources, 2026)).toMatchObject({ resultado: 120, oficial: 120, nominal: 2, diferenca: 119, incluidos: ['2026-1'] })

    sources = fontes([lancamento({ amount: 120 }), lancamento({ amount: 30, date: '2026-06-01' })], nominais)
    expect(areaComparison('bible_studies', [meta(500)], sources, 2026).result).toBe(150)
    expect(origemDosEstudos(sources, 2026).incluidos).toEqual(['2026-1', '2026-2'])
  })

  it('sem relatório, não há diferença a mostrar', () => {
    expect(origemDosEstudos(fontes([], [{ churchId: 'igreja-a', startedAt: '2026-02-10' }]), 2026)).toMatchObject({ oficial: 0, nominal: 1, diferenca: null, incluidos: [] })
  })
})
