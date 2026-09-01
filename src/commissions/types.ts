export type CommissionKind = 'board' | 'administrative'
export type DecisionType = 'approve' | 'recommend' | 'record' | 'grant' | 'refer' | 'custom'
export type DecisionDestination = 'internal' | 'administrative' | 'regular_church' | 'record' | 'other'
export type DecisionResult = 'approved' | 'rejected' | 'deferred' | 'recorded'
export type PresidentTieBreak = 'favorable' | 'against' | null
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled'
/** Quem preside a comissão: o pastor, ou um ancião em igreja organizada. */
export type PresidentMode = 'pastor' | 'elder'

export interface CommissionConfigData {
  churchId: string; year: number; boardMemberIds: string[]; boardPresidentId: string; secretaryId: string; boardQuorum: number; administrativeQuorum: number; nextBoardVote: number; nextAdministrativeVote: number; updatedAt: string
  /** Sem escolha gravada, o presidente é o pastor. Configurações antigas continuam abrindo. */
  presidentMode?: PresidentMode
  /** Nome do pastor como deve aparecer na pauta e na ata. */
  pastorName?: string
  /** Anciãos da igreja: só quem está aqui pode presidir excepcionalmente. */
  elderIds?: string[]
}
export interface CommissionAgendaItem { id: string; order: number; title: string; department: string; description: string; proposal: string; decisionType: DecisionType; customDecisionType: string; destination: DecisionDestination; responsibleId: string; dueDate: string; privateNotes: string; sourceVoteNumber?: string; sourceMeetingId?: string; vote?: { favorable: number; against: number; abstentions: number; result: DecisionResult; voteNumber?: string; finalText: string; confirmedAt?: string; presidentVoted?: boolean; presidentTieBreak?: PresidentTieBreak } }
export interface CommissionMeetingData { churchId: string; kind: CommissionKind; date: string; time: string; location: string; presidentId: string; /** Nome do presidente quando quem preside é o pastor, que não é membro cadastrado. */ presidentLabel?: string; secretaryId: string; participantIds: string[]; guestNames: string[]; votingGuestNames: string[]; openingPrayer: string; reflection: string; notes: string; agenda: CommissionAgendaItem[]; finalizedAt?: string; createdAt: string; updatedAt: string }
export interface CommissionTaskData { churchId: string; meetingId: string; agendaItemId: string; kind: CommissionKind; title: string; responsibleId: string; dueDate: string; status: TaskStatus; agendaEventId?: string; createdAt: string; updatedAt: string }
export type CommissionEntity<T extends object> = T & { id: string }
