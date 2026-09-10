import { describe, expect, it } from 'vitest'
import { dividirEmParcelas, emCentavos, emReais, formatar, lerValor, percentual, somar } from './dinheiro'

describe('dinheiro em centavos', () => {
  /*
    O motivo de tudo isto existir: somar reais em ponto flutuante erra, e num
    orçamento familiar o erro vira um saldo que não fecha.
  */
  it('soma sem o erro do ponto flutuante', () => {
    expect(0.1 + 0.2).not.toBe(0.3)
    expect(somar([emCentavos(0.1), emCentavos(0.2)])).toBe(emCentavos(0.3))
    expect(somar([emCentavos(1234.56), emCentavos(0.44)])).toBe(123_500)
  })

  it('vai e volta sem perder centavo', () => {
    expect(emCentavos(1234.56)).toBe(123_456)
    expect(emReais(123_456)).toBe(1234.56)
    expect(emCentavos(0.07)).toBe(7)
  })

  /* O separador que o Intl põe depois de "R$" é um espaço não separável. */
  it('mostra no formato brasileiro', () => {
    const semNbsp = (valor: number) => formatar(valor).replace(/\u00a0/gu, ' ')
    expect(semNbsp(123_456)).toBe('R$ 1.234,56')
    expect(semNbsp(0)).toBe('R$ 0,00')
    expect(semNbsp(-4550)).toBe('-R$ 45,50')
  })
})

describe('leitura do que foi digitado', () => {
  it('aceita as formas que os dois teclados produzem', () => {
    expect(lerValor('1.234,56')).toBe(123_456)
    expect(lerValor('1234,56')).toBe(123_456)
    expect(lerValor('1234.56')).toBe(123_456)
    expect(lerValor('R$ 1.234,56')).toBe(123_456)
    expect(lerValor('  45  ')).toBe(4500)
  })

  it('entende ponto de milhar sem decimal', () => {
    expect(lerValor('1.234')).toBe(123_400)
    expect(lerValor('12.345')).toBe(1_234_500)
  })

  it('completa a casa que falta', () => {
    expect(lerValor('45,5')).toBe(4550)
    expect(lerValor('0,7')).toBe(70)
  })

  it('corta o que passa de dois decimais em vez de arredondar para cima', () => {
    expect(lerValor('10,999')).toBe(1099)
  })

  it('aceita negativo', () => {
    expect(lerValor('-45,50')).toBe(-4550)
  })

  it('devolve nulo quando não há número', () => {
    expect(lerValor('')).toBeNull()
    expect(lerValor('abc')).toBeNull()
    expect(lerValor('R$')).toBeNull()
    expect(lerValor('-')).toBeNull()
  })
})

describe('parcelas', () => {
  /*
    Três de 33,33 somam 99,99 e perdem um centavo. O resto vai para as
    primeiras, como as lojas fazem.
  */
  it('somam exatamente o total, mesmo quando não divide redondo', () => {
    const parcelas = dividirEmParcelas(10_000, 3)
    expect(parcelas).toEqual([3334, 3333, 3333])
    expect(somar(parcelas)).toBe(10_000)
  })

  it('divide redondo quando dá', () => {
    expect(dividirEmParcelas(480_000, 12)).toEqual(Array.from({ length: 12 }, () => 40_000))
  })

  it('aguenta uma parcela só e nenhuma', () => {
    expect(dividirEmParcelas(999, 1)).toEqual([999])
    expect(dividirEmParcelas(999, 0)).toEqual([])
  })

  it('não perde centavo em nenhuma divisão até vinte e quatro', () => {
    for (let quantidade = 1; quantidade <= 24; quantidade += 1) {
      for (const total of [1, 99, 100, 4567, 123_456, 999_999]) {
        expect(somar(dividirEmParcelas(total, quantidade))).toBe(total)
      }
    }
  })
})

describe('percentual', () => {
  it('arredonda para uma casa', () => {
    expect(percentual(56_570, 85_000)).toBe(66.6)
    expect(percentual(50, 100)).toBe(50)
  })

  it('não divide por zero', () => {
    expect(percentual(1000, 0)).toBe(0)
  })
})
