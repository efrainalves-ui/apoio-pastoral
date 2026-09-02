import { describe, expect, it } from 'vitest'
import { BACKGROUND_MS, INACTIVITY_MS, shouldLock } from './autoLock'

const agora = Date.parse('2026-09-01T12:00:00.000Z')

describe('bloqueio automático do cofre', () => {
  it('mantém aberto enquanto há uso', () => {
    expect(shouldLock({ agora, ultimaAtividade: agora - 60_000, escondidoDesde: null })).toBe(false)
  })

  it('fecha depois de quinze minutos parado', () => {
    expect(shouldLock({ agora, ultimaAtividade: agora - INACTIVITY_MS, escondidoDesde: null })).toBe(true)
  })

  it('fecha quando fica tempo demais em segundo plano', () => {
    expect(shouldLock({ agora, ultimaAtividade: agora - 1_000, escondidoDesde: agora - BACKGROUND_MS })).toBe(true)
  })

  it('não fecha por uma troca rápida de aplicativo', () => {
    expect(shouldLock({ agora, ultimaAtividade: agora - 1_000, escondidoDesde: agora - 30_000 })).toBe(false)
  })
})
