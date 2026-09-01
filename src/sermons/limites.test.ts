import { describe, expect, it } from 'vitest'
import { SERMON_CONTENT_LIMIT, SERMON_NOTES_LIMIT } from './service'

// Uma página de Word tem por volta de 2.000 a 3.000 caracteres.
const CARACTERES_POR_PAGINA = 3_000

describe('tamanho do sermão', () => {
  it('comporta com folga um sermão de 15 páginas do Word', () => {
    expect(SERMON_CONTENT_LIMIT).toBeGreaterThan(15 * CARACTERES_POR_PAGINA * 2)
  })

  it('deixa espaço largo também para as observações', () => {
    expect(SERMON_NOTES_LIMIT).toBeGreaterThanOrEqual(40_000)
  })
})
