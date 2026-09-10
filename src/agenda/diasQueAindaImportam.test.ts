import { describe, expect, it } from 'vitest'
import { diasQueAindaImportam } from './calendar'

/** Domingo a sábado da semana de 6 a 12 de setembro de 2026. */
const SEMANA = Array.from({ length: 7 }, (_, indice) => new Date(2026, 8, 6 + indice))
const dias = (lista: Date[]) => lista.map((data) => data.getDate())

describe('dias que ainda importam', () => {
  it('na quinta, domingo a quarta somem', () => {
    expect(dias(diasQueAindaImportam(SEMANA, new Date(2026, 8, 10, 8, 22)))).toEqual([10, 11, 12])
  })

  it('no domingo, a semana aparece inteira', () => {
    expect(dias(diasQueAindaImportam(SEMANA, new Date(2026, 8, 6, 23, 59)))).toEqual([6, 7, 8, 9, 10, 11, 12])
  })

  it('na segunda, some só o domingo', () => {
    expect(dias(diasQueAindaImportam(SEMANA, new Date(2026, 8, 7, 0, 1)))).toEqual([7, 8, 9, 10, 11, 12])
  })

  it('no sábado sobra o sábado', () => {
    expect(dias(diasQueAindaImportam(SEMANA, new Date(2026, 8, 12, 12, 0)))).toEqual([12])
  })

  /*
    Só a semana corrente encolhe. Quem volta para olhar o que aconteceu na
    semana passada quer ver o que aconteceu, não uma lista vazia.
  */
  it('semana passada e semana futura ficam inteiras', () => {
    expect(dias(diasQueAindaImportam(SEMANA, new Date(2026, 8, 20)))).toHaveLength(7)
    expect(dias(diasQueAindaImportam(SEMANA, new Date(2026, 7, 20)))).toHaveLength(7)
  })

  it('não altera a lista recebida', () => {
    const original = dias(SEMANA)
    diasQueAindaImportam(SEMANA, new Date(2026, 8, 10))
    expect(dias(SEMANA)).toEqual(original)
  })
})
