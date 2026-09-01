import { describe, expect, it } from 'vitest'
import { FOLLOW_UP_DEFAULT_DAYS, VISIT_DURATION_MINUTES, followUpDefaultDate, visitEndFrom } from './VisitFormPage'

describe('horário da visita', () => {
  // O pastor anota quando visitou; o término é consequência, não pergunta.
  it('deriva o término do horário informado', () => {
    expect(visitEndFrom('2026-09-01T14:00')).toBe('2026-09-01T14:30')
    expect(VISIT_DURATION_MINUTES).toBe(30)
  })

  it('atravessa a virada de hora sem perder o minuto', () => {
    expect(visitEndFrom('2026-09-01T23:45')).toBe('2026-09-02T00:15')
  })

  it('devolve o próprio valor quando o horário ainda não é válido', () => {
    expect(visitEndFrom('')).toBe('')
  })

  it('sugere o prazo do lembrete sem o pastor calcular a data', () => {
    expect(followUpDefaultDate(new Date('2026-09-01T12:00:00'))).toBe('2026-09-08')
    expect(FOLLOW_UP_DEFAULT_DAYS).toBe(7)
  })
})
