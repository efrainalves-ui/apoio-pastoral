import { describe, expect, it } from 'vitest'
import type { AreaSources } from '../goals/areas'
import type { AnnualGoalEntity } from './types'
import { goalBudget, goalChurchResults, goalMonthlyResults, trackGoal } from './goalTracking'

const ANO = 2026
const IGREJA_A = 'igreja-ficticia-a'
const IGREJA_B = 'igreja-ficticia-b'
const HOJE = new Date('2026-06-15T12:00:00.000Z')

function meta(partes: Partial<AnnualGoalEntity>): AnnualGoalEntity {
  return {
    id: 'meta-ficticia', title: 'Meta Fictícia do Distrito', description: '', area: 'discipleship', year: ANO,
    churchIds: [], responsible: '', dueDate: '2026-12-31', priority: 'normal', status: 'in_progress', notes: '',
    campaignIds: [], agendaEventIds: [], references: [], history: [], createdAt: '', updatedAt: '',
    ...partes,
  }
}

const vazio: AreaSources = { entries: [], studies: [], uapgs: [] }

describe('acompanhamento da meta do planejamento', () => {
  it('usa o que o pastor registrou quando não há vínculo com uma área', () => {
    const acompanhamento = trackGoal(meta({ target: 20, progress: [{ month: '2026-01', amount: 5 }, { month: '2026-02', amount: 3 }] }), vazio, HOJE)

    expect(acompanhamento.automatic).toBe(false)
    expect(acompanhamento.result).toBe(8)
    expect(acompanhamento.percent).toBe(40)
    expect(acompanhamento.missing).toBe(12)
  })

  // Vinculada a uma área, a meta lê o resultado de lá: nada é lançado duas vezes.
  it('traz o resultado real da área vinculada', () => {
    const sources: AreaSources = { ...vazio, studies: [
      { churchId: IGREJA_A, startedAt: '2026-03-01T10:00:00.000Z' },
      { churchId: IGREJA_B, startedAt: '2026-04-01T10:00:00.000Z' },
    ] }

    const acompanhamento = trackGoal(meta({ target: 4, linkedArea: 'bible_studies' }), sources, HOJE)

    expect(acompanhamento.automatic).toBe(true)
    expect(acompanhamento.result).toBe(2)
    expect(acompanhamento.percent).toBe(50)
  })

  it('ignora o registro manual quando existe vínculo', () => {
    const sources: AreaSources = { ...vazio, studies: [{ churchId: IGREJA_A, startedAt: '2026-03-01T10:00:00.000Z' }] }

    const acompanhamento = trackGoal(meta({ target: 4, linkedArea: 'bible_studies', progress: [{ month: '2026-01', amount: 99 }] }), sources, HOJE)

    expect(acompanhamento.result).toBe(1)
  })

  it('avisa quando a divisão entre igrejas não fecha com a meta do distrito', () => {
    const acompanhamento = trackGoal(meta({ target: 10, churchTargets: [{ churchId: IGREJA_A, target: 4 }, { churchId: IGREJA_B, target: 3 }] }), vazio, HOJE)

    expect(acompanhamento.churchTargetsSum).toBe(7)
    expect(acompanhamento.targetsMismatch).toBe(true)
  })

  // Dividir entre igrejas é opcional: sem divisão, a meta funciona igual.
  it('não avisa nada quando não há divisão por igreja', () => {
    expect(trackGoal(meta({ target: 10 }), vazio, HOJE).targetsMismatch).toBe(false)
  })

  it('marca alcançada, em andamento e não alcançada', () => {
    expect(trackGoal(meta({ target: 5, progress: [{ month: '2026-01', amount: 5 }] }), vazio, HOJE).status).toBe('reached')
    expect(trackGoal(meta({ target: 5 }), vazio, HOJE).status).toBe('in_progress')
    expect(trackGoal(meta({ target: 5, dueDate: '2026-05-31' }), vazio, HOJE).status).toBe('missed')
  })

  it('distribui o resultado mês a mês nos dois modos', () => {
    const manual = goalMonthlyResults(meta({ progress: [{ month: '2026-02', amount: 4 }] }), vazio)
    const vinculada = goalMonthlyResults(meta({ linkedArea: 'bible_studies' }), { ...vazio, studies: [{ churchId: IGREJA_A, startedAt: '2026-05-10T10:00:00.000Z' }] })

    expect(manual[1]).toBe(4)
    expect(vinculada[4]).toBe(1)
  })

  it('mostra o resultado de cada igreja quando há divisão', () => {
    const sources: AreaSources = { ...vazio, studies: [
      { churchId: IGREJA_A, startedAt: '2026-03-01T10:00:00.000Z' },
      { churchId: IGREJA_A, startedAt: '2026-04-01T10:00:00.000Z' },
      { churchId: IGREJA_B, startedAt: '2026-04-05T10:00:00.000Z' },
    ] }

    const porIgreja = goalChurchResults(meta({ linkedArea: 'bible_studies', churchTargets: [{ churchId: IGREJA_A, target: 4 }, { churchId: IGREJA_B, target: 2 }] }), sources)

    expect(porIgreja).toEqual([
      { churchId: IGREJA_A, target: 4, result: 2, percent: 50 },
      { churchId: IGREJA_B, target: 2, result: 1, percent: 50 },
    ])
  })
})

describe('orçamento da meta', () => {
  it('soma previsto, gasto e saldo', () => {
    const orcamento = goalBudget([
      { id: '1', label: 'Material fictício', planned: 300, spent: 120 },
      { id: '2', label: 'Transporte fictício', planned: 200, spent: 0 },
    ])

    expect(orcamento).toEqual({ planned: 500, spent: 120, balance: 380 })
  })

  it('trata a meta sem orçamento como zero', () => {
    expect(goalBudget(undefined)).toEqual({ planned: 0, spent: 0, balance: 0 })
  })
})
