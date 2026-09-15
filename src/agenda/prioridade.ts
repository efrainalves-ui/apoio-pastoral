import type { AgendaCategory, AgendaEventData, PrioridadeEstrategica } from './types'

/**
 * A prioridade estratégica de um compromisso, só onde ela é clara.
 *
 * Pregação é Identidade; Comissão, Liderança; Visita, Estudo Bíblico e
 * Batismo, Discipulado; Dedicação de criança, Novas Gerações.
 * Reunião, Evento e Treinamento só têm prioridade quando o pastor a escolhe no
 * registro — nunca deduzida do título: nem todo treinamento é de liderança.
 * O compromisso criado por uma campanha evangelística é Discipulado sem
 * precisar escolher. Ceia do Senhor, Concílio, PGP, Casamento, Pessoal, Outro e
 * Viagem ficam neutros.
 *
 * O símbolo é um acréscimo: a cor e a faixa da categoria continuam as mesmas.
 */
const PRIORIDADE_DA_CATEGORIA: Partial<Record<AgendaCategory, PrioridadeEstrategica>> = {
  preaching: 'identity',
  committee: 'leadership',
  visit: 'discipleship',
  bible_study: 'discipleship',
  baptism: 'discipleship',
  child_dedication: 'new_generations',
}

/** Reunião, Evento e Treinamento: a prioridade é escolhida no registro. */
export const usaPrioridadeEscolhida = (category: AgendaCategory): boolean => category === 'meeting' || category === 'event' || category === 'training'

export function prioridadeDoCompromisso(event: Pick<AgendaEventData, 'category' | 'prioridadeEstrategica'> & Partial<Pick<AgendaEventData, 'linkedSource'>>): PrioridadeEstrategica | null {
  if (event.prioridadeEstrategica && usaPrioridadeEscolhida(event.category)) return event.prioridadeEstrategica
  // Evangelismo e campanhas são Discipulado: o que a campanha põe na Agenda já nasce com essa prioridade.
  if (event.linkedSource?.type.startsWith('evangelism_')) return 'discipleship'
  if (usaPrioridadeEscolhida(event.category)) return null
  return PRIORIDADE_DA_CATEGORIA[event.category] ?? null
}
