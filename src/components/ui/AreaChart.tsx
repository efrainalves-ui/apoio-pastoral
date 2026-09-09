import { movimentoReduzido } from './animacao'

interface AreaChartProps {
  valores: readonly number[]
  rotulos: readonly string[]
  label: string
  /** Como escrever o valor do último ponto, no pé do gráfico. */
  formatar: (valor: number) => string
}

/**
 * A série do ano, com área e o último ponto marcado.
 *
 * Não substitui a tabela — ela continua logo abaixo, para quem precisa do valor
 * exato. O gráfico mostra a forma: subindo, caindo, irregular. É o que uma
 * coluna de números não diz de relance.
 *
 * Só desenha os meses que já têm resultado. Prolongar a linha até dezembro com
 * zeros faria o ano parecer um desabamento em setembro.
 */
export function AreaChart({ valores, rotulos, label, formatar }: AreaChartProps) {
  let ateOMes = 0
  valores.forEach((valor, indice) => { if (valor > 0) ateOMes = indice + 1 })
  const serie = valores.slice(0, ateOMes)
  if (serie.length < 2) return null

  const largura = 320
  const altura = 96
  const teto = Math.max(...serie)
  const piso = Math.min(...serie)
  const faixa = teto - piso || teto || 1
  const passo = largura / (serie.length - 1)
  // A linha respira: 10 acima e 16 abaixo, para o traço e o ponto não encostarem na borda.
  const y = (valor: number) => 10 + (1 - (valor - piso) / faixa) * (altura - 26)
  const pontos = serie.map((valor, indice) => `${indice * passo},${y(valor)}`)
  const ultimo = serie[serie.length - 1]!
  const idAreaGradiente = `area-${label.replace(/\W/gu, '')}`

  return (
    <div className="area">
      <svg viewBox={`0 0 ${largura} ${altura}`} preserveAspectRatio="none" role="img"
           aria-label={`${label}. ${serie.map((valor, indice) => `${rotulos[indice] ?? ''}: ${formatar(valor)}`).join(', ')}`}>
        <defs>
          <linearGradient id={idAreaGradiente} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--acento-dado)" stopOpacity=".28" />
            <stop offset="100%" stopColor="var(--acento-dado)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`M${pontos.join(' L')} L${largura},${altura} L0,${altura} Z`} fill={`url(#${idAreaGradiente})`} />
        <path className="area__linha" d={`M${pontos.join(' L')}`} fill="none" strokeWidth={2}
              strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke"
              style={movimentoReduzido() ? undefined : { animation: 'traco 900ms cubic-bezier(.22,1,.36,1) both' }} />
        <circle className="area__ponta" cx={(serie.length - 1) * passo} cy={y(ultimo)} r={4} />
      </svg>
      <p className="area__pe">
        <span>{rotulos[0]}</span>
        <span>{rotulos[ateOMes - 1]} · {formatar(ultimo)}</span>
      </p>
    </div>
  )
}
