import { describe, expect, it } from 'vitest'
import { variacaoNoMesmoPeriodo } from './areas'

const zeros = Array<number>(12).fill(0)
const meses = (...valores: number[]) => [...valores, ...zeros].slice(0, 12)

describe('crescimento ou queda de um ano para o outro', () => {
  it('corta o ano fechado no mês em que o ano novo parou', () => {
    // Doze meses contra oito parecem uma queda enorme e podem ser um
    // crescimento. É a conta que já mentiu uma vez nesta tela.
    const anterior = meses(100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100)
    const atual = meses(110, 110, 110, 110)

    expect(variacaoNoMesmoPeriodo(anterior, atual)).toBeCloseTo(10)
  })

  it('mostra a queda com sinal negativo', () => {
    expect(variacaoNoMesmoPeriodo(meses(200), meses(150))).toBeCloseTo(-25)
  })

  it('sem base não há porcentagem', () => {
    // Crescer sobre nada não é porcentagem, e escrever "+100%" ali seria
    // inventar um número em cima de ausência de dado.
    expect(variacaoNoMesmoPeriodo(zeros, meses(150))).toBeNull()
    expect(variacaoNoMesmoPeriodo(meses(200), zeros)).toBeNull()
  })
})
