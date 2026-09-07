import type { IncomeStatus } from '../people/types'

export const VISIT_REASONS = ['routine', 'leadership', 'crisis', 'illness', 'mourning', 'newly_baptized', 'rescue', 'interested', 'family', 'other'] as const
export type VisitReason = (typeof VISIT_REASONS)[number]
export const VISIT_REASON_LABELS: Record<VisitReason, string> = { routine: 'Rotina', leadership: 'Liderança', crisis: 'Crise', illness: 'Enfermidade', mourning: 'Luto', newly_baptized: 'Recém-batizado', rescue: 'A resgatar', interested: 'Interessado', family: 'Família', other: 'Outro' }

export type QuestionScope = 'individual' | 'family'
export type QuestionResponseType = 'choice' | 'multiple' | 'number' | 'text'
export interface QuestionSnapshot {
  code: string; version: number; category: string; text: string; scope: QuestionScope
  responseType: QuestionResponseType; options: string[]
  sensitivity: 'pastoral' | 'health_general' | 'prayer'
  unit?: string; scaleMax?: number
  /** A pergunta de cima que precisa ter sido respondida assim para esta existir. */
  dependsOn?: { code: string; answers: string[] }
}
export interface VisitAnswer { id: string; question: QuestionSnapshot; subjectId: string; value: string | string[]; skipped: boolean }
export interface VisitParticipant { id: string; kind: 'person' | 'guest'; personId?: string; guestName?: string; present: boolean }
export interface VisitVersion { version: number; correctedAt: string; correctionNote?: string; answers: VisitAnswer[]; participants: VisitParticipant[]; reason: VisitReason; startAt: string; endAt: string; notes: string }
export interface VisitData { targetType: 'family' | 'person'; targetId: string; churchId: string; scheduledEventId: string | null; mode: 'full' | 'quick'; status: 'completed'; currentVersion: number; versions: VisitVersion[]; createdAt: string; updatedAt: string }
export interface VisitEntity extends VisitData { id: string }

export interface PrayerUpdate { id: string; at: string; text: string }
/** Três situações distintas: membro da igreja, pessoa não cadastrada e pedido sem identificação. */
export type PrayerSubjectKind = 'member' | 'unregistered' | 'anonymous'
export interface PrayerRequestData { subjectType: 'family' | 'person' | 'anonymous' | 'unregistered'; /** Nome digitado quando a pessoa não é cadastrada. */ subjectName?: string; subjectId: string | null; churchId: string; visitId: string | null; text: string; description: string; privateNotes: string; updates: PrayerUpdate[]; status: 'active' | 'answered' | 'closed' | 'needs_follow_up' | 'archived'; requestedAt: string; reviewAt: string; testimony: string; revealed: boolean; createdAt: string; updatedAt: string }
export interface PrayerRequestEntity extends PrayerRequestData { id: string }
export interface PrayerRequestInput { churchId: string; kind: PrayerSubjectKind; personId: string | null; personName: string; subject: string; description: string; requestedAt: string; privateNotes: string }

export const FOLLOW_UP_KINDS = ['call', 'revisit', 'send_material', 'bring_lesson', 'talk_family', 'talk_leader', 'schedule_study', 'follow_decision', 'follow_prayer', 'refer_help', 'other'] as const
export type FollowUpKind = (typeof FOLLOW_UP_KINDS)[number]
export const FOLLOW_UP_LABELS: Record<FollowUpKind, string> = { call: 'Ligar', revisit: 'Visitar novamente', send_material: 'Enviar material', bring_lesson: 'Levar Lição', talk_family: 'Conversar com familiar', talk_leader: 'Falar com líder', schedule_study: 'Agendar estudo', follow_decision: 'Acompanhar decisão', follow_prayer: 'Acompanhar pedido de oração', refer_help: 'Encaminhar para ajuda apropriada', other: 'Outro' }
export interface FollowUpData { visitId: string; subjectType: 'family' | 'person'; subjectId: string; churchId: string; kind: FollowUpKind; dueAt: string; status: 'pending' | 'completed' | 'cancelled'; notes: string; createdAt: string; updatedAt: string }
export interface FollowUpEntity extends FollowUpData { id: string }

export interface TaskData { title: string; description: string; dueAt: string; priority: 'low' | 'normal' | 'high'; status: 'pending' | 'completed' | 'cancelled'; churchId: string | null; relatedType: 'visit' | 'person' | 'family' | 'event' | null; relatedId: string | null; reminderMinutes: number | null; /** Dia e hora do aviso, escolhidos por quem anota. */ remindAt?: string | null; createdAt: string; updatedAt: string }
export interface TaskEntity extends TaskData { id: string }

export interface VisitRoundData { name: string; churchId: string | null; targetFamilyIds: string[]; visitedFamilyIds: string[]; status: 'active' | 'completed' | 'archived'; startedAt: string; completedAt: string | null; createdAt: string; updatedAt: string }
export interface VisitRoundEntity extends VisitRoundData { id: string }

export interface VisitCompletionInput { targetType: 'family' | 'person'; targetId: string; churchId: string; scheduledEventId: string | null; mode: 'full' | 'quick'; participants: VisitParticipant[]; reason: VisitReason; startAt: string; endAt: string; notes: string; answers: VisitAnswer[]; prayerText: string; prayerReviewAt: string; followUp: { kind: FollowUpKind; dueAt: string; notes: string } | null; task: { title: string; description: string; dueAt: string; priority: TaskData['priority'] } | null; incomeAnswers: Array<{ personId: string; status: IncomeStatus }>; roundId: string | null }
