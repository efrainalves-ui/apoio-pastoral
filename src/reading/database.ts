import Dexie, { type EntityTable } from 'dexie'
import type { ReadingStoredRecord } from './types'

export class ReadingDatabase extends Dexie {
  records!: EntityTable<ReadingStoredRecord, 'id'>
  constructor(name = 'apoio-pastoral-personal-reading') { super(name); this.version(1).stores({ records: 'id, accountId, recordType, updatedAt' }) }
}
export const readingDb = new ReadingDatabase()
