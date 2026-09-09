import { describe, expect, it } from 'vitest'
import { familiaDestasPessoas, mesclarPapeis, nomeDaFamilia } from './parentesco'
import type { FamilyEntity } from './types'

const familia = (id: string, memberIds: string[]): FamilyEntity => ({
  id, name: `Família ${id}`, primaryChurchId: 'igreja-1', memberIds,
  address: '', notes: '', history: [], createdAt: '', updatedAt: '',
})

describe('os papéis vindos da visita', () => {
  it('não apagam quem não estava na sala', () => {
    // O filho que estava no trabalho continua sendo filho.
    const depois = mesclarPapeis(
      [{ personId: 'pai', role: 'head' }, { personId: 'filho-ausente', role: 'child' }],
      [{ personId: 'mae', role: 'spouse' }],
    )

    expect(depois).toHaveLength(3)
    expect(depois.find(({ personId }) => personId === 'filho-ausente')?.role).toBe('child')
  })

  it('corrigem o papel de quem já estava', () => {
    const depois = mesclarPapeis([{ personId: 'a', role: 'other' }], [{ personId: 'a', role: 'spouse' }])

    expect(depois).toEqual([{ personId: 'a', role: 'spouse' }])
  })
})

describe('achar a família de quem foi visitado', () => {
  it('basta uma pessoa já estar numa', () => {
    const achada = familiaDestasPessoas([familia('f1', ['pai']), familia('f2', ['outro'])], ['pai', 'mae'])

    expect(achada?.id).toBe('f1')
  })

  it('sem ninguém cadastrado, não inventa família', () => {
    expect(familiaDestasPessoas([familia('f1', ['outro'])], ['pai'])).toBeNull()
  })
})

describe('o nome de uma família nova', () => {
  it('vem do sobrenome de quem a encabeça', () => {
    expect(nomeDaFamilia('Maria dos Santos Alves')).toBe('Família Alves')
  })

  it('ignora as partículas curtas', () => {
    expect(nomeDaFamilia('João da Silva')).toBe('Família Silva')
  })
})
