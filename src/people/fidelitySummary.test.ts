import { describe, expect, it } from 'vitest'
import { fidelityCareSummary, isFaithfulByAge } from './fidelitySummary'

describe('resumo de acompanhamento de fidelidade', () => {
  it('separa fiéis, acompanhamento e pessoas a avaliar com dados fictícios', () => {
    const person = (category: 'tither' | 'non_tither' | 'non_systematic_tither', incomeStatus: 'unknown' | 'has_income' | 'no_income') => ({ id: crypto.randomUUID(), name: 'Pessoa Fictícia', birthDate: null, currentChurchId: 'igreja-ficticia', incomeStatus, fidelity: { category }, memberships: [], history: [], whatsapp: '', notes: '', pastoralStatus: 'active' as const, importStatus: 'current' as const, fidelityHistory: [], createdAt: '', updatedAt: '' })
    expect(fidelityCareSummary([person('tither', 'unknown'), person('non_tither', 'no_income'), person('non_systematic_tither', 'has_income'), person('non_tither', 'unknown')] as never)).toEqual({ faithful: 2, followingUp: 1, toEvaluate: 1 })
  })

  it('considera até 15 anos fiel por faixa etária e muda aos 16', () => {
    const person = (birthDate: string | null) => ({ id: 'pessoa-ficticia', name: 'Pessoa Jovem Fictícia', birthDate, currentChurchId: 'igreja-ficticia', incomeStatus: 'unknown' as const, fidelity: { category: 'non_tither' as const }, memberships: [], history: [], whatsapp: '', notes: '', pastoralStatus: 'active' as const, importStatus: 'current' as const, fidelityHistory: [], createdAt: '', updatedAt: '' })
    const reference = new Date('2026-08-25T12:00:00')
    expect(isFaithfulByAge(person('2010-08-26') as never, reference)).toBe(true)
    expect(isFaithfulByAge(person('2010-08-25') as never, reference)).toBe(false)
    expect(isFaithfulByAge(person(null) as never, reference)).toBe(false)
    expect(fidelityCareSummary([person('2010-08-26')] as never, reference)).toEqual({ faithful: 1, followingUp: 0, toEvaluate: 0 })
    expect(fidelityCareSummary([person('2010-08-25')] as never, reference)).toEqual({ faithful: 0, followingUp: 0, toEvaluate: 1 })
  })
})
