import { describe, expect, it } from 'vitest'
import { metaDeGrupos, quadroDeGrupos } from './metasDeGrupos'

describe('a meta de um para cada doze membros', () => {
  it('cento e vinte membros pedem dez', () => {
    expect(metaDeGrupos(120)).toBe(10)
  })

  it('arredonda para cima, porque a regra é de cobertura', () => {
    // Os treze membros não cabem num grupo só, e deixar o décimo terceiro de
    // fora é o que a meta existe para evitar.
    expect(metaDeGrupos(13)).toBe(2)
    expect(metaDeGrupos(1)).toBe(1)
    expect(metaDeGrupos(0)).toBe(0)
  })
})

const igrejas = [{ id: 'a', name: 'Igreja A Fictícia' }, { id: 'b', name: 'Igreja B Fictícia' }]
const membrosDe = (churchId: string, quantos: number) => Array.from({ length: quantos }, () => ({ currentChurchId: churchId }))
const pessoas = [...membrosDe('a', 120), ...membrosDe('b', 13)]

describe('o quadro de grupos do distrito', () => {
  it('conta membros, meta e alcançado por igreja', () => {
    const quadro = quadroDeGrupos(
      igrejas, pessoas,
      [{ churchId: 'a' }, { churchId: 'a' }, { churchId: 'b' }],
      [{ churchId: 'a', active: true }, { churchId: 'a', active: false }],
      [{ churchId: 'b', active: true }],
    )

    expect(quadro.igrejas[0]).toMatchObject({ nome: 'Igreja A Fictícia', membros: 120, meta: 10, escolaSabatina: 2, pequenosGrupos: 1, integracoes: 0 })
    expect(quadro.igrejas[1]).toMatchObject({ membros: 13, meta: 2, escolaSabatina: 1, pequenosGrupos: 0, integracoes: 1 })
  })

  it('a meta do distrito é a soma das metas, não a meta da soma', () => {
    // Somar os membros primeiro daria 133 → 12, escondendo a igreja pequena
    // dentro da grande: ela precisa dos seus dois grupos de qualquer forma.
    const quadro = quadroDeGrupos(igrejas, pessoas, [], [], [])

    expect(quadro.distrito.membros).toBe(133)
    expect(quadro.distrito.meta).toBe(12)
  })

  it('grupo desativado não conta como alcançado', () => {
    const quadro = quadroDeGrupos([igrejas[0]!], pessoas, [], [{ churchId: 'a', active: false }], [])

    expect(quadro.distrito.pequenosGrupos).toBe(0)
  })
})
