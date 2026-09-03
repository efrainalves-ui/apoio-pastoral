import { personLabel } from '../reports/redaction'
import type { ChurchType } from '../district/types'
import type { CommissionAgendaItem, CommissionConfigData, CommissionMeetingData, DecisionResult, PresidentMode, PresidentTieBreak } from './types'

/** Como o pastor aparece na pauta e na ata quando ele não informou o nome. */
export const PASTOR_PRESIDENT_LABEL = 'Pastor do distrito'
export function pastorLabel(pastorName?: string): string { return pastorName?.trim() || PASTOR_PRESIDENT_LABEL }

/**
 * O presidente padrão da comissão é o pastor. Só em igreja organizada, e
 * excepcionalmente, um ancião registrado pode presidir no lugar dele.
 */
export function elderPresidencyAllowed(churchType: ChurchType | undefined): boolean { return churchType === 'organized_church' }

export function commissionPresident(config: Pick<CommissionConfigData, 'presidentMode' | 'pastorName' | 'boardPresidentId' | 'elderIds'> | null, churchType: ChurchType | undefined, personName: (id: string) => string = (id) => id): { mode: PresidentMode; personId: string; label: string } {
  const anciao = config?.boardPresidentId ?? ''
  const registrado = (config?.elderIds ?? []).includes(anciao)
  if (config?.presidentMode === 'elder' && elderPresidencyAllowed(churchType) && anciao && registrado) return { mode: 'elder', personId: anciao, label: personName(anciao) }
  return { mode: 'pastor', personId: '', label: pastorLabel(config?.pastorName) }
}

/**
 * Nome que vai para os documentos, seja o pastor ou o ancião que presidiu.
 *
 * `presidentLabel` é o nome do pastor digitado por ele e guardado ao lado do
 * identificador. Ele passava direto: a assinatura de uma ata gerada sem nomes
 * trazia o nome do pastor por extenso, duas vezes, no fim da página. Agora ele
 * segue a mesma confirmação de todo mundo.
 */
export function meetingPresidentName(
  meeting: Pick<CommissionMeetingData, 'presidentId' | 'presidentLabel'>,
  personName: (id: string) => string,
  includeNames = true,
): string {
  return personLabel(includeNames, meeting.presidentLabel, personName(meeting.presidentId))
}

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
