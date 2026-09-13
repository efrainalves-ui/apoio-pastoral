import { describe, expect, it } from 'vitest'
import { areaComparison, resultadoDoRelatorioIntegrado, type AreaSources } from './areas'
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

/*
  O cadastro nominal e o Relatório Integrado medem a mesma realidade por
  caminhos diferentes. Somá-los contaria a mesma pessoa duas vezes; escolher um
  por conta própria seria decidir no lugar do pastor. Ficam lado a lado.
*/
describe('o resultado vindo do Relatório Integrado', () => {
  it('soma por igreja e no total, sem tocar no progresso da meta', () => {
    const entries = [lancamento(), lancamento({ churchId: 'igreja-b', amount: 7 })]
    const resultado = resultadoDoRelatorioIntegrado('bible_studies', entries, 2026)
    expect(resultado.total).toBe(22)
    expect(resultado.porIgreja).toHaveLength(2)
    expect(resultado.lancamentos).toBe(2)

    // O progresso continua saindo do cadastro nominal: nada é contado duas vezes.
    expect(areaComparison('bible_studies', [], fontes(entries), 2026).result).toBe(0)
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
  const estudo = (churchId = 'igreja-a') => ({ churchId, startedAt: '2026-02-10' })

  it('resultado com meta definida: mostra os dois e a porcentagem', () => {
    const p = areaComparison('bible_studies', [meta(10)], fontes([], [estudo(), estudo()]), 2026)
    expect(p.result).toBe(2)
    expect(p.target).toBe(10)
    expect(p.percent).toBe(20)
  })

  it('resultado sem meta definida: o resultado continua valendo', () => {
    const p = areaComparison('bible_studies', [], fontes([], [estudo(), estudo()]), 2026)
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
