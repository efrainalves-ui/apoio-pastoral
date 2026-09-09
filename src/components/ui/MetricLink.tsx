import { Link } from 'react-router-dom'
import { CountUp } from './CountUp'

interface MetricLinkProps {
  label: string
  value: number
  to: string
  tone?: 'ok' | 'atencao' | 'neutro'
}

/**
 * O número é o caminho.
 *
 * Antes cada cartão trazia os números e, embaixo, uma fileira de links de texto
 * — "Abrir cuidados", "Abrir pedidos de oração". Eram duas coisas dizendo o
 * mesmo, e o que a mão procura é o número: ele é grande, está no alto e já
 * responde a pergunta. Tocar nele leva para onde ele conta.
 */
export function MetricLink({ label, value, to, tone = 'neutro' }: MetricLinkProps) {
  return (
    <Link className={`metric-link metric-link--${tone}`} to={to}>
      <span className="metric-link__label">{label}</span>
      <strong className="metric-link__value"><CountUp value={value} /></strong>
    </Link>
  )
}
