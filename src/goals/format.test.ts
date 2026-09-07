import { describe, expect, it } from 'vitest'
import { formatGoalValue } from './format'

describe('valores das metas na tela', () => {
  it('dízimos e ofertas saem em reais; as demais, em contagem', () => {
    expect(formatGoalValue('tithes', 819370)).toContain('819.370')
    expect(formatGoalValue('offerings', 302274)).toContain('302.274')
    expect(formatGoalValue('baptisms', 34)).toBe('34')
  })

  it('o dinheiro sai com espaço que quebra a linha', () => {
    // O separador do pt-BR é um espaço não separável. Numa coluna estreita ele
    // nunca quebra, e o valor sai por cima do vizinho — foi o que fundiu
    // "R$ 819.370" com "R$ 2.103" no cartão de metas.
    expect(formatGoalValue('tithes', 819370)).not.toContain(' ')
    expect(formatGoalValue('tithes', 819370)).toBe('R$ 819.370')
  })
})
