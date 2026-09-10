/**
 * Dinheiro em centavos inteiros.
 *
 * `0.1 + 0.2` dá `0.30000000000000004`. Numa lista de compras com quarenta
 * itens o erro aparece no total; num orçamento familiar com um ano de
 * lançamentos ele aparece no saldo, e o pastor não tem como saber se a conta
 * está errada ou se ele esqueceu de anotar alguma coisa.
 *
 * Por isso todo valor guardado é `Centavos`: inteiro, somável sem surpresa. A
 * conversão para reais acontece só na hora de mostrar e na hora de ler o que
 * foi digitado.
 */

/** Valor monetário em centavos inteiros. Nunca fracionário. */
export type Centavos = number

export function emCentavos(reais: number): Centavos {
  return Math.round(reais * 100)
}

export function emReais(centavos: Centavos): number {
  return centavos / 100
}

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

/** "R$ 1.234,56". */
export function formatar(centavos: Centavos): string {
  return moeda.format(emReais(centavos))
}

/**
 * Lê o que a pessoa digitou.
 *
 * Aceita "1.234,56", "1234,56", "1234.56" e "R$ 1.234,56", porque teclado de
 * celular e teclado de computador não produzem a mesma coisa e ninguém deveria
 * ter de aprender qual das duas o aplicativo quer.
 */
export function lerValor(texto: string): Centavos | null {
  const limpo = texto.replace(/[^\d,.-]/gu, '').trim()
  if (!limpo || limpo === '-') return null

  /*
    Vírgula é sempre decimal em português. Ponto é ambíguo: "1234.56" veio de
    teclado numérico e é decimal, "1.234" é milhar. A regra que resolve os dois
    é olhar quantos dígitos vêm depois — decimal tem um ou dois.
  */
  const ultimaVirgula = limpo.lastIndexOf(',')
  const ultimoPonto = limpo.lastIndexOf('.')
  let decimal = -1
  if (ultimaVirgula >= 0) decimal = ultimaVirgula
  else if (ultimoPonto >= 0 && limpo.length - ultimoPonto - 1 <= 2) decimal = ultimoPonto

  const inteiro = (decimal >= 0 ? limpo.slice(0, decimal) : limpo).replace(/[.,]/gu, '')
  const fracao = decimal >= 0 ? limpo.slice(decimal + 1).replace(/[.,]/gu, '').padEnd(2, '0').slice(0, 2) : '00'

  const negativo = inteiro.startsWith('-')
  const digitos = inteiro.replace(/-/gu, '')
  if (!/^\d*$/u.test(digitos) || !/^\d{2}$/u.test(fracao)) return null
  if (!digitos && decimal < 0) return null

  const total = Number(digitos || '0') * 100 + Number(fracao)
  return negativo ? -total : total
}

export function somar(valores: readonly Centavos[]): Centavos {
  return valores.reduce((total, valor) => total + valor, 0)
}

/**
 * Divide um total em parcelas que somam exatamente o total.
 *
 * R$ 100 em 3 não são três parcelas de R$ 33,33 — isso perde um centavo. O
 * resto vai para as primeiras parcelas, que é como as lojas fazem: 33,34 +
 * 33,33 + 33,33.
 */
export function dividirEmParcelas(total: Centavos, quantidade: number): Centavos[] {
  if (quantidade < 1) return []
  const base = Math.trunc(total / quantidade)
  const resto = total - base * quantidade
  return Array.from({ length: quantidade }, (_, indice) => base + (indice < Math.abs(resto) ? Math.sign(resto) : 0))
}

/** Percentual de `parte` sobre `todo`, com uma casa. Zero quando não há todo. */
export function percentual(parte: Centavos, todo: Centavos): number {
  if (todo === 0) return 0
  return Math.round((parte / todo) * 1000) / 10
}
