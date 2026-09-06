export type GoalMetric = 'tithes_offerings' | 'baptisms' | 'rebaptisms' | 'professions_faith' | 'bible_studies' | 'uapg' | 'donors'
/**
 * Como a meta foi escrita.
 *
 * `value` é um número absoluto — "trinta batismos". `percent` é um aumento
 * sobre o ano anterior — "dez por cento a mais de entrada". A financeira é
 * escrita em porcentagem porque é assim que ela é combinada na prática, e
 * porque o Comparativo de Entradas já traz o ano anterior para comparar.
 *
 * Ausente significa `value`: são as metas gravadas antes desta distinção
 * existir. Elas não são convertidas sozinhas — converter "50000" em "50000% de
 * aumento" seria inventar um número absurdo em cima de dado real.
 */
export type GoalTargetKind = 'value' | 'percent'
export interface GoalData { churchId: string | null; year: number; metric: GoalMetric; target: number; targetKind?: GoalTargetKind; createdAt: string; updatedAt: string }
export interface GoalEntity extends GoalData { id: string }
export interface GoalEntryData { churchId: string; metric: GoalMetric; date: string; amount: number; source: 'manual' | 'pdf'; reference: string; createdAt: string }
export interface GoalEntryEntity extends GoalEntryData { id: string }
export interface GoalImportPreview { hash: string; entries: Omit<GoalEntryData, 'source' | 'createdAt'>[]; errors: string[] }
export const GOAL_LABELS: Record<GoalMetric, string> = { tithes_offerings: 'Dízimos e ofertas', baptisms: 'Batismos', rebaptisms: 'Rebatismos', professions_faith: 'Profissões de fé', bible_studies: 'Estudos Bíblicos', uapg: 'UAPG', donors: 'Doadores' }

/**
 * Resultado consolidado de um ano anterior, guardado só para comparação.
 * Ele não entra nos lançamentos do ano corrente e não altera nenhuma meta.
 */
export interface GoalHistoryData { area: 'financial' | 'baptisms'; year: number; amount: number; source: 'manual' | 'pdf'; reference: string; createdAt: string; updatedAt: string }
export interface GoalHistoryEntity extends GoalHistoryData { id: string }
export const HISTORY_AREAS: Array<GoalHistoryData['area']> = ['financial', 'baptisms']
