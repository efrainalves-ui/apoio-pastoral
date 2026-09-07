export const PASTORAL_STATUSES = ['active', 'rescue'] as const
export type PastoralStatus = (typeof PASTORAL_STATUSES)[number]

export const PASTORAL_STATUS_LABELS: Record<PastoralStatus, string> = {
  active: 'Ativo',
  rescue: 'A resgatar',
}

export const IMPORT_STATUSES = ['current', 'missing', 'review', 'archived'] as const
export type PersonImportStatus = (typeof IMPORT_STATUSES)[number]

export const IMPORT_STATUS_LABELS: Record<PersonImportStatus, string> = {
  current: 'Consta na lista atual',
  missing: 'Não consta na lista atual',
  review: 'Pendente de revisão',
  archived: 'Arquivado',
}

export type PersonHistoryEvent = 'created' | 'details_updated' | 'church_changed' | 'pastoral_status_changed' | 'import_status_changed' | 'fidelity_updated' | 'income_status_updated'

export interface PersonHistoryEntry {
  id: string
  at: string
  event: PersonHistoryEvent
  from?: string
  to?: string
  changedFields?: string[]
  source?: string
}

export interface MembershipPeriod {
  id: string
  churchId: string
  source: 'manual' | 'member_import'
  validFrom: string
  validTo?: string
}

export type FidelityCategory = 'tither' | 'non_systematic_tither' | 'non_tither'
type LegacyFidelityCategory = 'systematic' | 'non_systematic' | 'no_record'
export type FidelityPrecision = 'exact' | 'range' | 'category_only'
export type IncomeStatus = 'unknown' | 'has_income' | 'no_income'

export const FIDELITY_CATEGORY_LABELS: Record<FidelityCategory, string> = {
  non_tither: 'Não dizimista',
  non_systematic_tither: 'Dizimista não sistemático',
  tither: 'Dizimista',
}

export interface FidelitySnapshot {
  /**
   * O ano que o relatório cobre — não o dia em que ele foi importado.
   *
   * Opcional porque as leituras gravadas antes desta mudança não o têm; para
   * elas vale a data de importação. Ver `anoDaLeitura`.
   */
  referenceYear?: number
  months: number | null
  rangeMin: number
  rangeMax: number
  category: FidelityCategory
  precision: FidelityPrecision
  updatedAt: string
  importedAt: string
  source: string
  importBatchId: string
}

export interface PersonData {
  name: string
  birthDate: string | null
  whatsapp: string
  notes: string
  pastoralStatus: PastoralStatus
  importStatus: PersonImportStatus
  currentChurchId: string
  memberships: MembershipPeriod[]
  history: PersonHistoryEntry[]
  incomeStatus: IncomeStatus
  fidelity: FidelitySnapshot | null
  fidelityHistory: FidelitySnapshot[]
  createdAt: string
  updatedAt: string
}

export interface PersonEntity extends PersonData { id: string }

export interface PersonInput {
  name: string
  birthDate: string
  whatsapp: string
  notes: string
  pastoralStatus: PastoralStatus
  currentChurchId: string
}

export const emptyPersonInput = (): PersonInput => ({
  name: '',
  birthDate: '',
  whatsapp: '',
  notes: '',
  pastoralStatus: 'active',
  currentChurchId: '',
})

export function fidelityCategory(months: number): FidelityCategory {
  if (months === 0) return 'non_tither'
  return months >= 8 ? 'tither' : 'non_systematic_tither'
}

export function normalizeFidelitySnapshot(snapshot: FidelitySnapshot | null): FidelitySnapshot | null {
  if (!snapshot) return null
  const storedCategory = snapshot.category as FidelityCategory | LegacyFidelityCategory
  const category: FidelityCategory = storedCategory === 'systematic'
    ? 'tither'
    : storedCategory === 'non_systematic'
      ? 'non_systematic_tither'
      : storedCategory === 'no_record'
        ? 'non_tither'
        : storedCategory
  const months = typeof snapshot.months === 'number' ? snapshot.months : null
  const rangeMin = typeof snapshot.rangeMin === 'number' ? snapshot.rangeMin : months ?? (category === 'tither' ? 8 : category === 'non_systematic_tither' ? 1 : 0)
  const rangeMax = typeof snapshot.rangeMax === 'number' ? snapshot.rangeMax : months ?? (category === 'tither' ? 12 : category === 'non_systematic_tither' ? 7 : 0)
  return {
    ...snapshot,
    category,
    months,
    rangeMin,
    rangeMax,
    precision: snapshot.precision ?? (months === null ? rangeMin === rangeMax ? 'category_only' : 'range' : 'exact'),
    importedAt: snapshot.importedAt ?? snapshot.updatedAt,
  }
}
