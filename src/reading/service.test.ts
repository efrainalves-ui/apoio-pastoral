import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { generateMasterKey } from '../crypto/vault'
import { ApoioDatabase } from '../db/database'
import { readingSummary } from './core'
import { ReadingDatabase } from './database'
import { ReadingService } from './service'
import type { ReadingBookData } from './types'

const readingDatabases: ReadingDatabase[] = []
const pastoralDatabases: ApoioDatabase[] = []
afterEach(async () => {
  await Promise.all([...readingDatabases, ...pastoralDatabases].map((database) => database.delete()))
  readingDatabases.length = 0; pastoralDatabases.length = 0
})

function book(overrides: Partial<ReadingBookData> = {}): ReadingBookData {
  return { title: 'Livro Fictício', author: 'Autor Fictício', category: 'theology', totalPages: 100, pagesRead: 0, startDate: '2026-08-01', completedDate: null, status: 'want_to_read', notes: 'Anotação fictícia', createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z', ...overrides }
}

describe('leitura pessoal', () => {
  it('cadastra livro, registra páginas e minutos e conclui automaticamente com totais mensais e anuais', async () => {
    const database = new ReadingDatabase(`reading-${crypto.randomUUID()}`); readingDatabases.push(database)
    const pastoral = new ApoioDatabase(`pastoral-separation-${crypto.randomUUID()}`); pastoralDatabases.push(pastoral)
    const service = new ReadingService(database); const key = await generateMasterKey()
    const created = await service.saveBook('account-fixture', key, book())
    await service.addSession('account-fixture', key, { bookId: created.id, date: '2026-08-10', pages: 40, minutes: 35, notes: 'Sessão fictícia um' })
    await service.addSession('account-fixture', key, { bookId: created.id, date: '2026-08-18', pages: 60, minutes: 50, notes: 'Sessão fictícia dois' })
    const books = await service.books('account-fixture', key); const sessions = await service.sessions('account-fixture', key)
    expect(books[0]).toMatchObject({ pagesRead: 100, status: 'completed', completedDate: '2026-08-18' })
    expect(readingSummary(books, sessions, null, '2026-08')).toMatchObject({ booksCompletedMonth: 1, booksCompletedYear: 1, pages: 100, minutes: 85 })
    expect(await pastoral.vaultRecords.count()).toBe(0)
    expect(JSON.stringify(await database.records.toArray())).not.toContain('Livro Fictício')
  })

  it('salva e atualiza uma meta mensal sem criar duplicata', async () => {
    const database = new ReadingDatabase(`reading-goal-${crypto.randomUUID()}`); readingDatabases.push(database); const service = new ReadingService(database); const key = await generateMasterKey()
    await service.saveGoal('account-fixture', key, { month: '2026-08', books: 2, pages: 300, minutes: 240, createdAt: '', updatedAt: '' })
    await service.saveGoal('account-fixture', key, { month: '2026-08', books: 3, pages: 450, minutes: 360, createdAt: '', updatedAt: '' })
    const goals = await service.goals('account-fixture', key)
    expect(goals).toHaveLength(1); expect(goals[0]).toMatchObject({ month: '2026-08', books: 3, pages: 450, minutes: 360 })
  })
})
