import type { CommissionAgendaItem, DecisionResult, PresidentTieBreak } from './types'

export function requiredMajority(favorable: number, against: number): number { const valid = favorable + against; return valid ? Math.floor(valid / 2) + 1 : 0 }

/** Empate: mesmo número de votos válidos de cada lado. */
export function isTie(favorable: number, against: number): boolean { return favorable + against > 0 && favorable === against }

/**
 * RN-025: o presidente vota apenas para desempatar, e só se ainda não tiver
 * votado na contagem comum. Se já votou, o assunto fica adiado em vez de ser
 * decidido por um segundo voto da mesma pessoa.
 */
export function presidentMayBreakTie(favorable: number, against: number, presidentVoted: boolean): boolean {
  return isTie(favorable, against) && !presidentVoted
}

export function voteResult(favorable: number, against: number, abstentions: number, quorum: boolean, informative = false, tieBreak: PresidentTieBreak = null): DecisionResult {
  if (informative) return 'recorded'
  if (!quorum || favorable + against === 0) return 'deferred'
  const totalFavorable = favorable + (tieBreak === 'favorable' ? 1 : 0)
  const totalAgainst = against + (tieBreak === 'against' ? 1 : 0)
  if (totalFavorable === totalAgainst) return 'deferred'
  return totalFavorable >= requiredMajority(totalFavorable, totalAgainst) ? 'approved' : 'rejected'
}

/** Frase curta que registra o desempate na ata, sem complicar a tela. */
export function tieBreakNote(tieBreak: PresidentTieBreak): string {
  if (tieBreak === 'favorable') return 'Empate desfeito pelo voto de qualidade do presidente, a favor.'
  if (tieBreak === 'against') return 'Empate desfeito pelo voto de qualidade do presidente, contra.'
  return ''
}
export function agendaText(item: CommissionAgendaItem): string { return `PROPÕE-SE ${item.proposal.trim()}.` }
export function minutesText(item: CommissionAgendaItem): string { return `VOTADO ${(item.vote?.finalText || item.proposal).trim()}.` }
export function voteNumber(year: number, sequence: number): string { return `${year}-${String(sequence).padStart(3, '0')}` }
export function canDeliberate(participantsWithVote: number, quorum: number): boolean { return quorum > 0 && participantsWithVote >= quorum }
export function reorderAgenda(items: CommissionAgendaItem[], from: number, to: number): CommissionAgendaItem[] { const next = [...items]; const [item] = next.splice(from, 1); if (!item) return items; next.splice(to, 0, item); return next.map((entry, index) => ({ ...entry, order: index + 1 })) }
