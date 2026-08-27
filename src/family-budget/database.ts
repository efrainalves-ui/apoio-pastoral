import Dexie, { type EntityTable } from 'dexie'
import type { FamilyBudgetStoredRecord } from './types'

export class FamilyBudgetDatabase extends Dexie {
  records!: EntityTable<FamilyBudgetStoredRecord, 'id'>

  constructor(name = 'apoio-pastoral-family-budget') {
    super(name)
    this.version(1).stores({ records: 'id, accountId, recordType, updatedAt' })
  }
}

export const familyBudgetDb = new FamilyBudgetDatabase()
