import { describe, expect, it } from 'vitest'
import { isTie, presidentMayBreakTie, requiredMajority, tieBreakNote, voteResult } from './core'

describe('regra de aprovação e voto de desempate', () => {
  it('exige sempre metade mais um dos votos válidos', () => {
    expect(requiredMajority(3, 2)).toBe(3)
    expect(requiredMajority(4, 3)).toBe(4)
    expect(requiredMajority(1, 0)).toBe(1)
    expect(requiredMajority(0, 0)).toBe(0)
  })

  it('aprova com metade mais um e recusa abaixo disso', () => {
    expect(voteResult(3, 2, 1, true)).toBe('approved')
    expect(voteResult(2, 3, 1, true)).toBe('rejected')
  })

  it('não decide sem quórum nem sem nenhum voto válido', () => {
    expect(voteResult(5, 0, 0, false)).toBe('deferred')
    expect(voteResult(0, 0, 4, true)).toBe('deferred')
  })

  it('registra assunto informativo sem votação', () => {
    expect(voteResult(0, 0, 0, false, true)).toBe('recorded')
  })

  it('reconhece o empate somente quando há votos válidos dos dois lados', () => {
    expect(isTie(2, 2)).toBe(true)
    expect(isTie(0, 0)).toBe(false)
    expect(isTie(3, 2)).toBe(false)
  })

  it('permite o desempate do presidente apenas se ele ainda não votou', () => {
    expect(presidentMayBreakTie(2, 2, false)).toBe(true)
    expect(presidentMayBreakTie(2, 2, true)).toBe(false)
    expect(presidentMayBreakTie(3, 2, false)).toBe(false)
  })

  it('adia o empate quando o presidente já votou e não pode desempatar', () => {
    expect(voteResult(2, 2, 0, true)).toBe('deferred')
  })

  it('desfaz o empate com o voto de qualidade do presidente', () => {
    expect(voteResult(2, 2, 0, true, false, 'favorable')).toBe('approved')
    expect(voteResult(2, 2, 0, true, false, 'against')).toBe('rejected')
  })

  it('descreve o desempate para a ata', () => {
    expect(tieBreakNote('favorable')).toMatch(/presidente, a favor/u)
    expect(tieBreakNote('against')).toMatch(/presidente, contra/u)
    expect(tieBreakNote(null)).toBe('')
  })
})
