import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { generateMasterKey } from '../crypto/vault'
import { ApoioDatabase } from '../db/database'
import { isPersonalRecord } from '../district/closeDistrict'
import { readingSummary } from './core'
import { ReadingService } from './service'
import type { ReadingBookData } from './types'

vi.mock('../auth/supabase', async (importarOriginal) => ({
  ...await importarOriginal<Record<string, unknown>>(),
  hasSupabaseConfiguration: false,
  ensureRemoteDevice: vi.fn(() => Promise.resolve()),
}))

const bancos: ApoioDatabase[] = []
afterEach(async () => {
  await Promise.all(bancos.splice(0).map((banco) => banco.delete()))
  localStorage.clear()
})

function novoServico() {
  const banco = new ApoioDatabase(`leitura-ficticia-${crypto.randomUUID()}`)
  bancos.push(banco)
  return { banco, service: new ReadingService(banco) }
}

function book(overrides: Partial<ReadingBookData> = {}): ReadingBookData {
  return { title: 'Livro Fictício', author: 'Autor Fictício', category: 'theology', totalPages: 100, pagesRead: 0, startDate: '2026-08-01', completedDate: null, status: 'want_to_read', notes: 'Anotação fictícia', createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z', ...overrides }
}

describe('leitura pessoal', () => {
  it('cadastra livro, registra páginas e minutos e conclui automaticamente com totais mensais e anuais', async () => {
    const { service } = novoServico(); const key = await generateMasterKey()
    const created = await service.saveBook('account-fixture', key, book())
    await service.addSession('account-fixture', key, { bookId: created.id, date: '2026-08-10', pages: 40, minutes: 35, notes: 'Sessão fictícia um' })
    await service.addSession('account-fixture', key, { bookId: created.id, date: '2026-08-18', pages: 60, minutes: 50, notes: 'Sessão fictícia dois' })
    const books = await service.books('account-fixture', key); const sessions = await service.sessions('account-fixture', key)
    expect(books[0]).toMatchObject({ pagesRead: 100, status: 'completed', completedDate: '2026-08-18' })
    expect(readingSummary(books, sessions, null, '2026-08')).toMatchObject({ booksCompletedMonth: 1, booksCompletedYear: 1, pages: 100, minutes: 85 })
  })

  it('salva e atualiza uma meta mensal sem criar duplicata', async () => {
    const { service } = novoServico(); const key = await generateMasterKey()
    await service.saveGoal('account-fixture', key, { month: '2026-08', books: 2, pages: 300, minutes: 240, createdAt: '', updatedAt: '' })
    await service.saveGoal('account-fixture', key, { month: '2026-08', books: 3, pages: 450, minutes: 360, createdAt: '', updatedAt: '' })
    const goals = await service.goals('account-fixture', key)
    expect(goals).toHaveLength(1); expect(goals[0]).toMatchObject({ month: '2026-08', books: 3, pages: 450, minutes: 360 })
  })

  it('apagar o livro leva o histórico dele junto', async () => {
    const { service } = novoServico(); const key = await generateMasterKey()
    const livro = await service.saveBook('account-fixture', key, book())
    await service.addSession('account-fixture', key, { bookId: livro.id, date: '2026-08-10', pages: 10, minutes: 20, notes: '' })
    await service.removeBook('account-fixture', key, livro.id)
    expect(await service.books('account-fixture', key)).toEqual([])
    expect(await service.sessions('account-fixture', key)).toEqual([])
  })

  /*
    A leitura precisa viajar entre os aparelhos: o livro anotado no celular não
    existia no computador, e não havia aviso nenhum dizendo isso. Estar no cofre
    é o que a põe nos trilhos da sincronização.
  */
  it('entra na fila de sincronização, como todo registro do cofre', async () => {
    const { banco, service } = novoServico(); const key = await generateMasterKey()
    await service.saveBook('account-fixture', key, book())
    expect(await banco.outbox.count()).toBeGreaterThan(0)
  })

  /*
    E continua sendo do pastor, não do distrito. A separação deixou de ser o
    banco à parte e passou a ser o tipo do registro — a promessa é a mesma.
  */
  it('sobrevive ao encerramento de distrito', () => {
    for (const tipo of ['personal_reading_book', 'personal_reading_session', 'personal_reading_goal']) {
      expect(isPersonalRecord({ schemaVersion: 1, type: tipo, data: {} })).toBe(true)
    }
  })

  /* O conteúdo nunca fica legível no armazenamento, esteja ele onde estiver. */
  it('nada legível é gravado', async () => {
    const { banco, service } = novoServico(); const key = await generateMasterKey()
    await service.saveBook('account-fixture', key, book())
    expect(JSON.stringify(await banco.vaultRecords.toArray())).not.toContain('Livro Fictício')
    expect(JSON.stringify(await banco.outbox.toArray())).not.toContain('Livro Fictício')
  })
})
