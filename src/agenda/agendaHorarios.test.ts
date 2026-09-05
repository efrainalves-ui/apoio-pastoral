import { describe, expect, it } from 'vitest'
import { categoryDefaults, endFollowingStart, localDateTime } from './types'

describe('data e hora do compromisso são as do pastor, não as de Greenwich', () => {
  it('escreve a data local, mesmo tarde da noite', () => {
    // Às 22h num fuso a oeste, `toISOString()` já está no dia seguinte. O campo
    // do formulário fala em hora local, então o texto precisa ser local também.
    const sabadoTarde = new Date(2026, 8, 5, 22, 30)

    expect(localDateTime(sabadoTarde)).toBe('2026-09-05T22:30')
    expect(categoryDefaults('preaching', sabadoTarde).startAt.slice(0, 10)).toBe('2026-09-05')
    expect(categoryDefaults('preaching', sabadoTarde).endAt.slice(0, 10)).toBe('2026-09-05')
  })
})

describe('o término acompanha o início', () => {
  it('mantém a duração ao mudar o início de dia e de hora', () => {
    // O caso relatado: padrão marcava término às 09:00 de hoje, o início foi
    // mudado para sábado às 19h, e o término ficava no dia anterior.
    expect(endFollowingStart('2026-09-04T08:00', '2026-09-04T09:00', '2026-09-05T19:00')).toBe('2026-09-05T20:00')
  })

  it('mantém uma duração maior que uma hora', () => {
    expect(endFollowingStart('2026-09-04T08:00', '2026-09-04T11:30', '2026-09-05T19:00')).toBe('2026-09-05T22:30')
  })

  it('usa uma hora quando a duração guardada não serve', () => {
    // Término igual ou anterior ao início não é duração: é um estado inválido
    // que não pode ser preservado como se fosse escolha de alguém.
    expect(endFollowingStart('2026-09-04T08:00', '2026-09-04T08:00', '2026-09-05T19:00')).toBe('2026-09-05T20:00')
    expect(endFollowingStart('2026-09-04T10:00', '2026-09-04T09:00', '2026-09-05T19:00')).toBe('2026-09-05T20:00')
  })

  it('não mexe no término quando o início digitado ainda não é uma data', () => {
    expect(endFollowingStart('2026-09-04T08:00', '2026-09-04T09:00', '')).toBe('2026-09-04T09:00')
  })
})
