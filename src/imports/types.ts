import type { FidelityCategory, PersonData, PersonEntity } from '../people/types'

export type ImportKind = 'members' | 'fidelity'
export type ImportIssueKind = 'unknown_church' | 'possible_duplicate' | 'invalid_name' | 'invalid_birth_date' | 'person_not_found' | 'ambiguous_person' | 'invalid_months' | 'duplicate_row'

export interface ImportIssue {
  id: string
  kind: ImportIssueKind
  churchName: string
  displayName: string
  message: string
  sourceRow?: ParsedFidelityRow
}

export interface ParsedMemberRow { churchName: string; name: string; birthDate: string | null; needsReview: boolean }
export interface ParsedDistrictList { districtName: string | null; rows: ParsedMemberRow[]; unparsedLines: string[] }
export type FidelityRange = '1-7' | '8-12'
export interface ParsedFidelityRow { churchName: string; name: string; months: number | null; range?: FidelityRange; category?: FidelityCategory }

export interface PlannedPersonChange {
  personId: string
  previousData: PersonData | null
  nextData: PersonData
  churchName: string
}

export interface MemberImportPreview {
  kind: 'members'
  fileHash: string
  parsedRows: number
  churchCounts: Record<string, number>
  newPeople: PlannedPersonChange[]
  updatedPeople: PlannedPersonChange[]
  missingPeople: PlannedPersonChange[]
  unchanged: number
  issues: ImportIssue[]
  alreadyImported: boolean
}

export interface FidelityImportPreview {
  kind: 'fidelity'
  fileHash: string
  parsedRows: number
  churchCounts: Record<string, number>
  changes: PlannedPersonChange[]
  unchanged: number
  issues: ImportIssue[]
  alreadyImported: boolean
  categories: { tither: number; nonSystematicTither: number; nonTither: number }
  associatedCategories: { tither: number; nonSystematicTither: number; nonTither: number }
  resolvedIssues?: Array<{ issue: ImportIssue; personId: string; automatic: boolean }>
}

export type ImportPreview = MemberImportPreview | FidelityImportPreview

export interface ImportSummary {
  parsedRows: number
  created: number
  updated: number
  missing: number
  unchanged: number
  issues: number
}

export interface ImportBatchData {
  kind: ImportKind
  modelVersion?: number
  fileHash: string
  source: string
  status: 'applied' | 'undone'
  createdAt: string
  appliedAt: string
  undoneAt?: string
  summary: ImportSummary
  churchCounts: Record<string, number>
  issues: ImportIssue[]
  undo: { createdPersonIds: string[]; previousPeople: Array<{ id: string; data: PersonData }> }
}

export interface ImportBatchEntity extends ImportBatchData { id: string }

export interface ImportApplyResult { batch: ImportBatchEntity; people: PersonEntity[] }
