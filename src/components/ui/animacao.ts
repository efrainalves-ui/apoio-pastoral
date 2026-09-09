/**
 * Se este aparelho pediu menos movimento.
 *
 * Quem liga "reduzir movimento" no sistema costuma ter um motivo — enjoo,
 * vertigem, dificuldade de acompanhar. Animar assim mesmo não é capricho: é
 * ignorar um pedido explícito de acessibilidade.
 */
export function movimentoReduzido(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Suaviza o fim da contagem: rápida no começo, calma ao chegar.
 *
 * Linear parece um contador de posto de gasolina. A desaceleração é o que faz o
 * número parecer pousar no lugar em vez de travar.
 */
export function desacelerar(t: number): number {
  return 1 - (1 - t) ** 3
}
