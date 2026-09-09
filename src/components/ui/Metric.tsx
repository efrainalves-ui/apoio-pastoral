import type { ReactNode } from 'react'

interface MetricProps {
  label: string
  value: ReactNode
  /** Uma linha curta abaixo do número: comparação, prazo, origem. */
  detail?: ReactNode
  tone?: 'ok' | 'atencao' | 'neutro'
  size?: 'grande' | 'normal'
}

/**
 * Rótulo pequeno em cima, número grande embaixo.
 *
 * É o bloco que faz o dado principal ocupar mais espaço do que o texto que o
 * explica — o contrário do que a tela fazia, com rótulo e valor do mesmo
 * tamanho, disputando a atenção.
 */
export function Metric({ label, value, detail, tone = 'neutro', size = 'normal' }: MetricProps) {
  return (
    <div className={`metric metric--${size} metric--${tone}`}>
      <span className="metric__label">{label}</span>
      <strong className="metric__value">{value}</strong>
      {detail && <span className="metric__detail">{detail}</span>}
    </div>
  )
}
