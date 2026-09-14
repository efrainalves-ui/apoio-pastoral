import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { generateMasterKey } from '../crypto/vault'
import { ApoioDatabase } from '../db/database'
import { PersonalVaultStore } from '../db/personalVault'
import { isPersonalRecord } from '../district/closeDistrict'
import { ehMetaAnual, ehMetaMensalAntiga, metaDoAno, relatorioMensal, resumoAnual, revisaoPendente } from './core'
import { ReadingService } from './service'
import type { ReadingBookData } from './types'

vi.mock('../auth/supabase', async (importarOriginal) => ({
  ...await importarOriginal<Record<string, unknown>>(),
  hasSupabaseConfiguration: false,
  ensureRemoteDevice: vi.fn(() => Promise.resolve()),
}))

const CONTA = 'account-fixture'
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
  it('sessões em meses diferentes repartem as páginas; o livro conta no mês da conclusão; editar e excluir a sessão recalculam', async () => {
    const { service } = novoServico(); const key = await generateMasterKey()
    const created = await service.saveBook(CONTA, key, book())
    await service.addSession(CONTA, key, { bookId: created.id, date: '2026-07-31', pages: 40, minutes: 35, notes: 'Sessão fictícia um' })
    const segunda = await service.addSession(CONTA, key, { bookId: created.id, date: '2026-08-01', pages: 60, minutes: 50, notes: 'Sessão fictícia dois' })
    let [books, sessions] = await Promise.all([service.books(CONTA, key), service.sessions(CONTA, key)])
    expect(books[0]).toMatchObject({ pagesRead: 100, status: 'completed', completedDate: '2026-08-01' })
    expect(relatorioMensal(books, sessions, '2026-07')).toMatchObject({ paginas: 40, minutos: 35, livrosConcluidos: [] })
    expect(relatorioMensal(books, sessions, '2026-08').livrosConcluidos).toHaveLength(1)

    await service.updateSession(CONTA, key, segunda.id, { date: '2026-08-02', pages: 30, minutes: 20, notes: '' })
    ;[books, sessions] = await Promise.all([service.books(CONTA, key), service.sessions(CONTA, key)])
    expect(relatorioMensal(books, sessions, '2026-08')).toMatchObject({ paginas: 30, minutos: 20, sessoes: 1 })
    expect(books[0]!.pagesRead).toBe(70)

    await service.removeSession(CONTA, key, segunda.id)
    ;[books, sessions] = await Promise.all([service.books(CONTA, key), service.sessions(CONTA, key)])
    expect(resumoAnual(books, sessions, '2026', null)).toMatchObject({ paginas: { feito: 40 }, minutos: 35 })
    expect(books[0]!.pagesRead).toBe(40)
    // Salvar o livro de novo não o conta duas vezes.
    await service.saveBook(CONTA, key, { ...book(), status: 'completed', completedDate: '2026-08-01', pagesRead: 100 }, created.id)
    expect(resumoAnual(await service.books(CONTA, key), sessions, '2026', null).livros.feito).toBe(1)
  })

  it('reler abre outro ciclo, que só conta quando concluído', async () => {
    const { service } = novoServico(); const key = await generateMasterKey()
    const primeira = await service.completeBook(CONTA, key, { id: crypto.randomUUID(), ...book() }, '2026-03-01')
    await service.rereadBook(CONTA, key, primeira, '2026-09-01')
    const books = await service.books(CONTA, key)
    expect(books).toHaveLength(2)
    expect(resumoAnual(books, [], '2026', null).livros.feito).toBe(1)
  })

  it('uma meta anual por conta e por ano, em qualquer aparelho; editar atualiza; anos ficam separados', async () => {
    const { banco, service } = novoServico(); const key = await generateMasterKey()
    await service.saveAnnualGoal(CONTA, key, '2026', { books: 12, pages: null })
    await new ReadingService(banco).saveAnnualGoal(CONTA, key, '2026', { books: 15, pages: 5000 })
    await service.saveAnnualGoal(CONTA, key, '2027', { books: null, pages: 3000 })
    const metas = await service.goals(CONTA, key)
    expect(metas.filter(ehMetaAnual)).toHaveLength(2)
    expect(metaDoAno(metas, '2026')).toMatchObject({ books: 15, pages: 5000 })
    expect(metaDoAno(metas, '2027')).toMatchObject({ books: null, pages: 3000 })
    await expect(service.saveAnnualGoal(CONTA, key, '2026', { books: -1, pages: null })).rejects.toThrow(/negativos/u)
  })

  it('revisão das metas mensais antigas: soma só se escolhida, preserva as antigas, e não repete nem duplica', async () => {
    const { banco, service } = novoServico(); const key = await generateMasterKey()
    const cofre = new PersonalVaultStore(banco)
    for (const [month, books, pages] of [['2026-01', 12, 300], ['2026-02', 12, 400]] as const) {
      await cofre.gravar(CONTA, key, 'personal_reading_goal', 'personal_reading_goal', { month, books, pages, minutes: 240, createdAt: '', updatedAt: '' })
    }
    expect(revisaoPendente(await service.goals(CONTA, key))).toBe(true)

    await service.concludeGoalReview(CONTA, key, 'somar')
    await service.concludeGoalReview(CONTA, key, 'somar')
    await new ReadingService(banco).concludeGoalReview(CONTA, key, 'ignorar')

    const metas = await service.goals(CONTA, key)
    expect(revisaoPendente(metas)).toBe(false)
    expect(metas.filter(ehMetaMensalAntiga)).toHaveLength(2)
    expect(metas.filter(ehMetaAnual)).toHaveLength(1)
    expect(metaDoAno(metas, '2026')).toMatchObject({ books: 12, pages: 700 })
  })

  it('apagar o livro leva o histórico dele junto', async () => {
    const { service } = novoServico(); const key = await generateMasterKey()
    const livro = await service.saveBook(CONTA, key, book())
    await service.addSession(CONTA, key, { bookId: livro.id, date: '2026-08-10', pages: 10, minutes: 20, notes: '' })
    await service.removeBook(CONTA, key, livro.id)
    expect(await service.books(CONTA, key)).toEqual([])
    expect(await service.sessions(CONTA, key)).toEqual([])
  })

  /*
    A leitura viaja entre os aparelhos pelo cofre, continua sendo do pastor e
    não do distrito, e nada fica legível no armazenamento — meta anual inclusive.
  */
  it('cofre, sincronização e encerramento de distrito seguem valendo, sem nada legível', async () => {
    const { banco, service } = novoServico(); const key = await generateMasterKey()
    await service.saveBook(CONTA, key, book())
    await service.saveAnnualGoal(CONTA, key, '2026', { books: 15, pages: 5000 })
    expect(await banco.outbox.count()).toBeGreaterThan(0)
    for (const tipo of ['personal_reading_book', 'personal_reading_session', 'personal_reading_goal']) {
      expect(isPersonalRecord({ schemaVersion: 1, type: tipo, data: {} })).toBe(true)
    }
    const guardado = JSON.stringify([await banco.vaultRecords.toArray(), await banco.outbox.toArray()])
    expect(guardado).not.toContain('Livro Fictício')
    expect(guardado).not.toContain('5000')
  })
})
