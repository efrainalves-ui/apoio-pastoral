import { describe, expect, it } from 'vitest'
import type { GoalEntity, GoalEntryEntity, GoalHistoryEntity } from './types'
import { areaComparison, areaProgress, areaResults, churchProgress, monthlyResults, previousResult, type AreaSources } from './areas'

const ANO = 2026
const IGREJA_A = 'igreja-ficticia-a'
const IGREJA_B = 'igreja-ficticia-b'

function meta(partes: Partial<GoalEntity>): GoalEntity {
  return { id: crypto.randomUUID(), churchId: null, year: ANO, metric: 'baptisms', target: 0, createdAt: '', updatedAt: '', ...partes }
}

function lancamento(partes: Partial<GoalEntryEntity>): GoalEntryEntity {
  return { id: crypto.randomUUID(), churchId: IGREJA_A, metric: 'baptisms', date: '2026-03-10', amount: 1, source: 'pdf', reference: '', createdAt: '', ...partes }
}

const vazio: AreaSources = { entries: [], studies: [], uapgs: [] }

describe('as quatro metas', () => {
  // O pastor vê uma meta só; os lançamentos antigos continuam com sua origem.
  it('soma batismos, rebatismos e profissões de fé numa única meta', () => {
    const sources: AreaSources = { ...vazio, entries: [
      lancamento({ metric: 'baptisms', amount: 3 }),
      lancamento({ metric: 'rebaptisms', amount: 2 }),
      lancamento({ metric: 'professions_faith', amount: 1 }),
    ] }

    expect(areaProgress('baptisms', [meta({ target: 12 })], sources, ANO).result).toBe(6)
  })

  it('calcula percentual e quanto falta', () => {
    const sources: AreaSources = { ...vazio, entries: [lancamento({ amount: 3 })] }

    const progresso = areaProgress('baptisms', [meta({ target: 12 })], sources, ANO)

    expect(progresso.percent).toBe(25)
    expect(progresso.missing).toBe(9)
    expect(progresso.reached).toBe(false)
  })

  it('avisa quando a soma das igrejas não bate com a meta do distrito', () => {
    const metas = [meta({ target: 10 }), meta({ churchId: IGREJA_A, target: 4 }), meta({ churchId: IGREJA_B, target: 3 })]

    const progresso = areaProgress('baptisms', metas, vazio, ANO)

    expect(progresso.churchTargetsSum).toBe(7)
    expect(progresso.targetsMismatch).toBe(true)
  })

  it('não avisa quando a distribuição fecha com o total', () => {
    const metas = [meta({ target: 7 }), meta({ churchId: IGREJA_A, target: 4 }), meta({ churchId: IGREJA_B, target: 3 })]

    expect(areaProgress('baptisms', metas, vazio, ANO).targetsMismatch).toBe(false)
  })

  // O resultado do distrito é a soma do que veio das igrejas, contado uma vez.
  it('não duplica o resultado ao somar as igrejas no distrito', () => {
    const sources: AreaSources = { ...vazio, entries: [
      lancamento({ churchId: IGREJA_A, amount: 2 }),
      lancamento({ churchId: IGREJA_B, amount: 3 }),
    ] }

    const distrito = areaProgress('baptisms', [meta({ target: 10 })], sources, ANO)
    const igrejas = churchProgress('baptisms', [], sources, ANO, [IGREJA_A, IGREJA_B])

    expect(distrito.result).toBe(5)
    expect(igrejas.reduce((soma, item) => soma + item.result, 0)).toBe(5)
  })

  it('marca a meta como alcançada quando o resultado chega ao total', () => {
    const sources: AreaSources = { ...vazio, entries: [lancamento({ amount: 12 })] }

    expect(areaProgress('baptisms', [meta({ target: 12 })], sources, ANO).reached).toBe(true)
  })

  it('distribui o resultado mês a mês', () => {
    const sources: AreaSources = { ...vazio, entries: [
      lancamento({ date: '2026-01-15', amount: 2 }),
      lancamento({ date: '2026-03-02', amount: 1 }),
    ] }

    const meses = monthlyResults('baptisms', sources, ANO)

    expect(meses).toHaveLength(12)
    expect(meses[0]).toBe(2)
    expect(meses[2]).toBe(1)
    expect(meses[5]).toBe(0)
  })
})

describe('metas que aproveitam o que já está cadastrado', () => {
  it('conta os estudos bíblicos iniciados no ano, sem lançamento novo', () => {
    const sources: AreaSources = { ...vazio, studies: [
      { churchId: IGREJA_A, startedAt: '2026-02-01T10:00:00.000Z' },
      { churchId: IGREJA_B, startedAt: '2026-02-20T10:00:00.000Z' },
      { churchId: IGREJA_A, startedAt: '2025-11-01T10:00:00.000Z' },
    ] }

    expect(areaProgress('bible_studies', [], sources, ANO).result).toBe(2)
    expect(monthlyResults('bible_studies', sources, ANO)[1]).toBe(2)
  })

  it('conta somente as UAPG ativas do ano', () => {
    const sources: AreaSources = { ...vazio, uapgs: [
      { churchId: IGREJA_A, createdAt: '2026-04-01T10:00:00.000Z', active: true },
      { churchId: IGREJA_A, createdAt: '2026-05-01T10:00:00.000Z', active: false },
      { churchId: IGREJA_B, createdAt: '2025-04-01T10:00:00.000Z', active: true },
    ] }

    expect(areaProgress('uapg', [], sources, ANO).result).toBe(1)
  })

  it('não usa lançamentos manuais nas áreas que já têm cadastro', () => {
    const sources: AreaSources = { ...vazio, entries: [lancamento({ metric: 'bible_studies', amount: 99 })] }

    expect(areaResults('bible_studies', sources, ANO)).toEqual([])
  })
})

describe('comparação com o ano anterior', () => {
  const historico = (partes: Partial<GoalHistoryEntity>): GoalHistoryEntity => ({ id: crypto.randomUUID(), area: 'baptisms', year: 2025, amount: 30, source: 'manual', reference: 'Consolidado 2025', createdAt: '', updatedAt: '', ...partes })

  it('usa o consolidado registrado do ano fechado', () => {
    const sources: AreaSources = { ...vazio, history: [historico({})] }

    expect(previousResult('baptisms', sources, 2025)).toBe(30)
  })

  // Sem consolidado, vale o que estiver lançado naquele ano — nunca os dois somados.
  it('cai para os lançamentos do ano quando não há consolidado', () => {
    const sources: AreaSources = { ...vazio, entries: [lancamento({ date: '2025-04-10', amount: 4 }), lancamento({ date: '2025-06-10', amount: 3 })] }

    expect(previousResult('baptisms', sources, 2025)).toBe(7)
    expect(previousResult('baptisms', { ...sources, history: [historico({ amount: 30 })] }, 2025)).toBe(30)
  })

  it('não deixa o histórico mexer no resultado do ano corrente', () => {
    const sources: AreaSources = { ...vazio, history: [historico({ amount: 30 })], entries: [lancamento({ date: '2026-03-10', amount: 5 })] }
    const comparacao = areaComparison('baptisms', [meta({ target: 40, metric: 'baptisms' })], sources, ANO)

    expect(comparacao.result).toBe(5)
    expect(comparacao.target).toBe(40)
    expect(comparacao.missing).toBe(35)
    expect(comparacao.percent).toBe(13)
    expect(comparacao.previous).toBe(30)
    expect(comparacao.difference).toBe(-25)
    expect(comparacao.hasPrevious).toBe(true)
  })

  it('avisa quando ainda não há ano anterior registrado', () => {
    const comparacao = areaComparison('financial', [], vazio, ANO)

    expect(comparacao.hasPrevious).toBe(false)
    expect(comparacao.previous).toBe(0)
  })
})
