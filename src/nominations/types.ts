import type { DecisionResult, TaskStatus } from '../commissions/types'

export type NominationStatus = 'preparation' | 'formed' | 'nominating' | 'awaiting_consent' | 'ready' | 'presented' | 'objections' | 'voting' | 'completed' | 'archived'
export type NominationMethod = 'organizing_committee' | 'board_expanded' | 'permanent'
export type OfficeStatus = 'open' | 'filled' | 'not_applicable' | 'archived'
export type OfficialOfficeStatus = 'pending' | 'elected' | 'not_approved' | 'vacant' | 'referred_back'
export type CandidateStatus = 'suggested' | 'reviewing' | 'awaiting_conversation' | 'accepted' | 'declined' | 'recommended' | 'not_recommended' | 'withdrawn'
export type EligibilityStatus = 'pending' | 'confirmed' | 'ineligible'
export type ObjectionDecision = 'pending' | 'maintained' | 'changed' | 'withdrawn' | 'vacant' | 'awaiting_presentation'
export type OfficialVenue = 'administrative' | 'regular_church'
export type OfficialVoteMode = 'complete' | 'by_office'

export interface NominationFormation { method: NominationMethod; organizingCommitteeIds: string[]; organizingVoteReference: string; committeeMemberIds: string[]; presidentId: string; secretaryId: string; districtLeaderId: string; quorum: number; electedAt: string; notes: string }
export interface NominationOffice { id: string; area: string; title: string; vacancies: number; multiplePeople: boolean; description: string; status: OfficeStatus; indicatedByOtherCommittee: boolean; officialStatus: OfficialOfficeStatus; archivedAt?: string }
export interface NominationVote { favorable: number; against: number; abstentions: number; result: DecisionResult; required: number; participantIds: string[]; votedAt: string }
export interface NominationCandidate { id: string; officeId: string; personId: string; status: CandidateStatus; confidentialNote: string; conversationDate: string; consent: boolean; refusalReason: string; eligibility: EligibilityStatus; fidelityAlert: boolean; vote?: NominationVote; electedAt?: string }
export interface NominationMeeting { id: string; date: string; time: string; location: string; presidentId: string; secretaryId: string; participantIds: string[]; guestNames: string[]; quorum: number; openingPrayer: string; reflection: string; agenda: string[]; confidentialNotes: string; nextMeetingDate: string; agendaEventId?: string; finalizedAt?: string; corrections: Array<{ id: string; at: string; text: string }>; /** Modelos editáveis: quando vazios, o aplicativo mostra o modelo pastoral padrão. */ agendaTemplate?: string; minutesTemplate?: string }
export interface NominationReportLine { officeId: string; officeTitle: string; personId: string; personName: string }
export interface NominationReportVersion { id: string; version: number; createdAt: string; presentationDate: string; officialVoteDate: string; lines: NominationReportLine[]; openOffices: string[]; publicNote: string; /** Modelo editável do relatório final; vazio usa o modelo pastoral padrão. */ reportTemplate?: string }
export interface NominationObjection { id: string; receivedAt: string; subject: string; confidentialDetails: string; decision: ObjectionDecision; decidedAt?: string }
export interface NominationOfficialVote { id: string; mode: OfficialVoteMode; venue: OfficialVenue; officeId?: string; date: string; time: string; location: string; presidentId: string; secretaryId: string; participantIds: string[]; quorum: number; favorable: number; against: number; abstentions: number; result: DecisionResult; required: number; administrativeMeetingId?: string; finalizedAt?: string; corrections: Array<{ id: string; at: string; text: string }> }
export interface NominationTask { id: string; title: string; responsibleId: string; dueDate: string; status: TaskStatus; agendaEventId?: string }
export interface NominationHistoryEntry { id: string; at: string; action: string }
export interface NominationProcessData { churchId: string; period: string; status: NominationStatus; formation: NominationFormation; offices: NominationOffice[]; candidates: NominationCandidate[]; meetings: NominationMeeting[]; reports: NominationReportVersion[]; objections: NominationObjection[]; officialVotes: NominationOfficialVote[]; vacancyProcesses: Array<{ id: string; officeId: string; route: 'board' | 'permanent_nominating'; startedAt: string; sourceVoteReference: string }>; tasks: NominationTask[]; history: NominationHistoryEntry[]; createdAt: string; updatedAt: string }
export type NominationProcessEntity = NominationProcessData & { id: string }
