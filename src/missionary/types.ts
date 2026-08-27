export type InterestStatus = 'waiting_study' | 'bible_study' | 'study_finished' | 'former_adventist'
export type StudyStatus = 'in_progress' | 'completed'
export interface InterestData { churchId: string; name: string; contact: string; notes: string; status: InterestStatus; createdAt: string; updatedAt: string }
export interface InterestEntity extends InterestData { id: string }
export interface BibleStudyData { interestId: string; churchId: string; startedAt: string; completedAt: string | null; status: StudyStatus; followUp: string; outcome: 'continue_interested' | 'baptized' | null; createdAt: string; updatedAt: string }
export interface BibleStudyEntity extends BibleStudyData { id: string }
export interface MissionaryPairData { churchId: string; memberIds: string[]; active: boolean; createdAt: string; updatedAt: string }
export interface MissionaryPairEntity extends MissionaryPairData { id: string }
export type AgeGroup = 'adults' | 'young' | 'teenagers' | 'preteenagers' | 'other'
export interface SabbathClassData { churchId: string; teacherId: string; assistantId: string | null; ageGroup: AgeGroup; participantIds: string[]; createdAt: string; updatedAt: string }
export interface SabbathClassEntity extends SabbathClassData { id: string }
export interface SmallGroupData { name: string; churchId: string; leaderId: string; associateId: string | null; host: string; address: string; day: string; time: string; participantIds: string[]; active: boolean; createdAt: string; updatedAt: string }
export interface SmallGroupEntity extends SmallGroupData { id: string }
export interface UapgData { name: string; churchId: string; smallGroupId: string | null; notes: string; active: boolean; createdAt: string; updatedAt: string }
export interface UapgEntity extends UapgData { id: string }
export const AGE_GROUP_LABELS: Record<AgeGroup,string> = { adults:'Adultos', young:'Jovens', teenagers:'Adolescentes', preteenagers:'Pré-adolescentes', other:'Outros' }
export const INTEREST_STATUS_LABELS: Record<InterestStatus, string> = { waiting_study: 'Aguardando estudo', bible_study: 'Estudo bíblico', study_finished: 'Estudo finalizado', former_adventist: 'Ex-adventista' }
