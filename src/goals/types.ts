export type GoalMetric = 'tithes_offerings' | 'baptisms' | 'rebaptisms' | 'professions_faith' | 'bible_studies' | 'uapg'
export interface GoalData { churchId: string | null; year: number; metric: GoalMetric; target: number; createdAt: string; updatedAt: string }
export interface GoalEntity extends GoalData { id: string }
export interface GoalEntryData { churchId: string; metric: GoalMetric; date: string; amount: number; source: 'manual' | 'pdf'; reference: string; createdAt: string }
export interface GoalEntryEntity extends GoalEntryData { id: string }
export interface GoalImportPreview { hash: string; entries: Omit<GoalEntryData, 'source' | 'createdAt'>[]; errors: string[] }
export const GOAL_LABELS: Record<GoalMetric, string> = { tithes_offerings: 'Dízimos e ofertas', baptisms: 'Batismos', rebaptisms: 'Rebatismos', professions_faith: 'Profissões de fé', bible_studies: 'Estudos Bíblicos', uapg: 'UAPG' }
