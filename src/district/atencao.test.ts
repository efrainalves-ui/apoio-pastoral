import { describe, expect, it } from 'vitest'
import type { AgendaEventEntity } from '../agenda/types'
import type { PersonEntity } from '../people/types'
import { igrejasQuePrecisamDeAtencao } from './atencao'
import type { ChurchEntity } from './types'

const HOJE = '2026-09-15'
const igreja = (id: string, name: string) => ({ id, name, districtId: 'distrito', status: 'active' } as ChurchEntity)
const pessoa = (churchId: string, importStatus?: string) => ({ id: `p-${churchId}-${importStatus ?? 'ativa'}`, name: 'Pessoa Fictícia', currentChurchId: churchId, importStatus } as PersonEntity)
const compromisso = (churchId: string, startAt: string) => ({ id: `e-${churchId}-${startAt}`, churchId, startAt } as AgendaEventEntity)

describe('igrejas que precisam de atenção', () => {
  const igrejas = [igreja('b', 'Igreja Norte Fictícia'), igreja('a', 'Igreja Central Fictícia'), igreja('c', 'Igreja Sul Fictícia')]

  it('sem pessoas, sem compromisso futuro, e em ordem alfabética', () => {
    const pessoas = [pessoa('b'), pessoa('c')]
    const eventos = [compromisso('c', '2026-09-20T09:00')]
    expect(igrejasQuePrecisamDeAtencao(igrejas, pessoas, eventos, HOJE)).toEqual([
      { id: 'a', name: 'Igreja Central Fictícia', motivo: 'Ainda sem pessoas cadastradas' },
      { id: 'b', name: 'Igreja Norte Fictícia', motivo: 'Sem compromisso futuro na Agenda' },
    ])
  })

  it('compromisso de hoje conta como futuro; o de ontem, não', () => {
    const pessoas = [pessoa('a'), pessoa('b'), pessoa('c')]
    const comHoje = igrejasQuePrecisamDeAtencao(igrejas, pessoas, [compromisso('a', `${HOJE}T08:00`), compromisso('b', '2026-09-14T08:00'), compromisso('c', '2026-12-01T08:00')], HOJE)
    expect(comHoje.map(({ id }) => id)).toEqual(['b'])
  })

  it('pessoa arquivada não sustenta a igreja, e sem igrejas a lista é vazia', () => {
    expect(igrejasQuePrecisamDeAtencao([igreja('a', 'Igreja Central Fictícia')], [pessoa('a', 'archived')], [], HOJE)[0]?.motivo).toBe('Ainda sem pessoas cadastradas')
    expect(igrejasQuePrecisamDeAtencao([], [], [], HOJE)).toEqual([])
  })
})
