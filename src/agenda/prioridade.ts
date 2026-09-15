import type { AgendaCategory, AgendaEventData, PrioridadeEstrategica } from './types'

/**
 * A prioridade estratégica de um compromisso, só onde ela é clara.
 *
 * Pregação é Identidade; Comissão e Treinamento, Liderança; Visita, Estudo
 * Bíblico e Batismo, Discipulado; Dedicação de criança, Novas Gerações.
 * Reunião e Evento só têm prioridade quando o pastor a escolhe no registro —
 * nunca deduzida do título. Ceia do Senhor, Concílio, PGP, Casamento, Pessoal,
 * Outro e Viagem ficam neutros.
 *
 * O símbolo é um acréscimo: a cor e a faixa da categoria continuam as mesmas.
 */
const PRIORIDADE_DA_CATEGORIA: Partial<Record<AgendaCategory, PrioridadeEstrategica>> = {
  preaching: 'identity',
  committee: 'leadership',
  training: 'leadership',
  visit: 'discipleship',
  bible_study: 'discipleship',
  baptism: 'discipleship',
  child_dedication: 'new_generations',
}

/** Reunião e Evento: a prioridade é escolhida no registro. */
export const usaPrioridadeEscolhida = (category: AgendaCategory): boolean => category === 'meeting' || category === 'event'

export function prioridadeDoCompromisso(event: Pick<AgendaEventData, 'category' | 'prioridadeEstrategica'>): PrioridadeEstrategica | null {
  if (usaPrioridadeEscolhida(event.category)) return event.prioridadeEstrategica ?? null
  return PRIORIDADE_DA_CATEGORIA[event.category] ?? null
}
