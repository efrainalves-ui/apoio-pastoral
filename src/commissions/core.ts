import type { CommissionAgendaItem, DecisionResult } from './types'

export function requiredMajority(favorable: number, against: number): number { const valid = favorable + against; return valid ? Math.floor(valid / 2) + 1 : 0 }
export function voteResult(favorable: number, against: number, abstentions: number, quorum: boolean, informative = false): DecisionResult {
  if (informative) return 'recorded'
  if (!quorum || favorable + against === 0) return 'deferred'
  return favorable >= requiredMajority(favorable, against) ? 'approved' : 'rejected'
}
export function agendaText(item: CommissionAgendaItem): string { return `PROPÕE-SE ${item.proposal.trim()}.` }
export function minutesText(item: CommissionAgendaItem): string { return `VOTADO ${(item.vote?.finalText || item.proposal).trim()}.` }
export function voteNumber(year: number, sequence: number): string { return `${year}-${String(sequence).padStart(3, '0')}` }
export function canDeliberate(participantsWithVote: number, quorum: number): boolean { return quorum > 0 && participantsWithVote >= quorum }
export function reorderAgenda(items: CommissionAgendaItem[], from: number, to: number): CommissionAgendaItem[] { const next = [...items]; const [item] = next.splice(from, 1); if (!item) return items; next.splice(to, 0, item); return next.map((entry, index) => ({ ...entry, order: index + 1 })) }
