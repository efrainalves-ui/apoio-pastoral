import { describe, expect, it } from 'vitest'
import { detalhesAoTrocarCategoria } from './detalhes'
import { prioridadeDoCompromisso, usaPrioridadeEscolhida } from './prioridade'
import { AGENDA_CATEGORIES, type AgendaEventInput } from './types'

function base(overrides: Partial<AgendaEventInput> = {}): AgendaEventInput {
  return {
    title: '', category: 'meeting', churchId: null, location: '', address: '', visitTarget: 'none', sermonId: null, sermonSnapshot: null,
    ceremonyDetails: null, startAt: '2026-10-10T09:00', endAt: '2026-10-10T10:00', allDay: false, reminderMinutes: null, notes: '',
    includeInItinerary: true, mondayException: false, ...overrides,
  }
}

describe('prioridade estratégica dos compromissos', () => {
  it('as categorias com ligação clara têm a sua área', () => {
    expect(prioridadeDoCompromisso({ category: 'preaching' })).toBe('identity')
    expect(prioridadeDoCompromisso({ category: 'committee' })).toBe('leadership')
    expect(prioridadeDoCompromisso({ category: 'training' })).toBe('leadership')
    expect(prioridadeDoCompromisso({ category: 'visit' })).toBe('discipleship')
    expect(prioridadeDoCompromisso({ category: 'bible_study' })).toBe('discipleship')
    expect(prioridadeDoCompromisso({ category: 'baptism' })).toBe('discipleship')
    expect(prioridadeDoCompromisso({ category: 'child_dedication' })).toBe('new_generations')
  })

  it('Ceia do Senhor, Concílio, PGP, Casamento, Pessoal, Outro e Viagem ficam neutros', () => {
    for (const category of ['communion', 'council', 'pgp', 'wedding', 'personal', 'other', 'travel'] as const) {
      expect(prioridadeDoCompromisso({ category, prioridadeEstrategica: 'identity' }), category).toBeNull()
    }
  })

  it('Reunião e Evento só têm prioridade quando ela está no registro, e nunca pelo título', () => {
    expect(usaPrioridadeEscolhida('meeting')).toBe(true)
    expect(usaPrioridadeEscolhida('event')).toBe(true)
    expect(AGENDA_CATEGORIES.filter(usaPrioridadeEscolhida)).toEqual(['meeting', 'event'])
    expect(prioridadeDoCompromisso(base({ title: 'Reunião de jovens e discipulado' }))).toBeNull()
    expect(prioridadeDoCompromisso(base({ category: 'event', prioridadeEstrategica: 'new_generations' }))).toBe('new_generations')
  })

  it('trocar para uma categoria sem escolha apaga a prioridade escolhida', () => {
    const reuniao = base({ prioridadeEstrategica: 'leadership' })
    expect(detalhesAoTrocarCategoria(reuniao, 'council').prioridadeEstrategica).toBeNull()
    expect(detalhesAoTrocarCategoria(reuniao, 'event').prioridadeEstrategica).toBe('leadership')
    expect(detalhesAoTrocarCategoria(base(), 'visit')).not.toHaveProperty('prioridadeEstrategica')
  })
})
