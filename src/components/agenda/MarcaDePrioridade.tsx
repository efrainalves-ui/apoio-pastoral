import { prioridadeDoCompromisso } from '../../agenda/prioridade'
import type { AgendaEventData } from '../../agenda/types'
import { areaDoPlanejamento, nomeCurtoDaArea } from '../../plano-estrategico/areas'
import { SimboloDaArea } from '../plano/SimboloDaArea'
import { SeloDaCategoria } from './IdentidadeDaCategoria'

type Compromisso = Pick<AgendaEventData, 'category' | 'prioridadeEstrategica'> & Partial<Pick<AgendaEventData, 'linkedSource'>>

/** O trecho que entra no nome acessível de quem abre o compromisso. */
export function rotuloDaPrioridade(event: Compromisso): string {
  const area = prioridadeDoCompromisso(event)
  return area ? `, prioridade estratégica ${nomeCurtoDaArea(areaDoPlanejamento(area))}` : ''
}

/**
 * O pequeno símbolo da prioridade estratégica, com o nome ao lado.
 *
 * No celular o nome sai da linha para não pesar, mas continua no nome
 * acessível: a prioridade nunca é só a cor, nem só a forma.
 */
export function MarcaDePrioridade({ event }: { event: Compromisso }) {
  const area = prioridadeDoCompromisso(event)
  if (!area) return null
  const plano = areaDoPlanejamento(area)
  const nome = nomeCurtoDaArea(plano)
  return (
    <span className={`prioridade-agenda area--${plano.slug}`} role="img" aria-label={`Prioridade estratégica: ${nome}`} title={`Prioridade estratégica: ${nome}`}>
      <SimboloDaArea simbolo={plano.simbolo} />
      <span className="prioridade-agenda__nome" aria-hidden="true">{nome}</span>
    </span>
  )
}

/** O selo da categoria, como sempre; e o símbolo estratégico só quando houver prioridade. */
export function SelosDoCompromisso({ event }: { event: Compromisso }) {
  if (!prioridadeDoCompromisso(event)) return <SeloDaCategoria categoria={event.category} />
  return <span className="agenda-selos"><SeloDaCategoria categoria={event.category} /><MarcaDePrioridade event={event} /></span>
}
