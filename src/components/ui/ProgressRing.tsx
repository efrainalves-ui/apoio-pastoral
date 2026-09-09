import { movimentoReduzido } from './animacao'

interface ProgressRingProps {
  /** De 0 a 100. */
  percent: number
  label: string
  /** O que fica escrito no meio. O número, normalmente. */
  children?: React.ReactNode
  size?: number
  tone?: 'ok' | 'atencao' | 'neutro'
}

/**
 * Um anel para uma meta só.
 *
 * O anel diz "quanto do caminho" melhor do que uma barra quando o número é o
 * assunto do cartão — mas só um por cartão: vários anéis lado a lado viram
 * enfeite e param de comparar coisa nenhuma.
 *
 * O tom nunca vai sozinho: a porcentagem escrita no meio é quem informa, e a
 * cor apenas reforça. Quem não distingue verde de vermelho lê o mesmo.
 */
export function ProgressRing({ percent, label, children, size = 92, tone = 'neutro' }: ProgressRingProps) {
  const limitado = Math.max(0, Math.min(100, percent))
  const raio = (size - 10) / 2
  const volta = 2 * Math.PI * raio
  const preenchido = (limitado / 100) * volta

  return (
    <div className={`ring ring--${tone}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${label}: ${Math.round(limitado)} por cento`}>
        <circle className="ring__trilho" cx={size / 2} cy={size / 2} r={raio} fill="none" strokeWidth={9} />
        <circle
          className="ring__traco"
          cx={size / 2} cy={size / 2} r={raio} fill="none" strokeWidth={9} strokeLinecap="round"
          strokeDasharray={`${preenchido} ${volta}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={movimentoReduzido() ? undefined : { transition: 'stroke-dasharray 900ms cubic-bezier(.22,1,.36,1)' }}
        />
      </svg>
      <span className="ring__centro" aria-hidden="true">{children}</span>
    </div>
  )
}
