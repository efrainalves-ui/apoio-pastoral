interface SparklineProps {
  valores: readonly number[]
  label: string
  /** Rótulo de cada ponto, para quem lê com leitor de tela. */
  rotulos?: readonly string[]
}

/**
 * O desenho da série, do tamanho de uma linha de texto.
 *
 * Não substitui a tabela: mostra a forma — subindo, caindo, irregular — que uma
 * coluna de números não mostra de relance. Quem precisa do valor exato continua
 * tendo a tabela logo abaixo.
 */
export function Sparkline({ valores, label, rotulos }: SparklineProps) {
  const comValor = valores.filter((valor) => valor > 0)
  if (comValor.length < 2) return null

  const teto = Math.max(...valores)
  const largura = 100
  const altura = 28
  const passo = valores.length > 1 ? largura / (valores.length - 1) : largura
  const pontos = valores.map((valor, indice) => `${indice * passo},${altura - (teto > 0 ? (valor / teto) * (altura - 4) : 0) - 2}`)

  const descricao = rotulos
    ? valores.map((valor, indice) => `${rotulos[indice] ?? indice + 1}: ${valor}`).join(', ')
    : valores.join(', ')

  return (
    <svg className="sparkline" viewBox={`0 0 ${largura} ${altura}`} preserveAspectRatio="none" role="img" aria-label={`${label}. ${descricao}`}>
      <polyline points={pontos.join(' ')} fill="none" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
