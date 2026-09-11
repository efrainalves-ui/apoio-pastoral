import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { encryptPayload, generateMasterKey } from '../crypto/vault'
import { FamilyBudgetDatabase } from '../family-budget/database'
import { ReadingDatabase } from '../reading/database'
import { ReadingService } from '../reading/service'
import { ShoppingListService } from '../shopping/service'
import { ApoioDatabase } from './database'
import { MigracaoDosPessoais } from './migrarPessoais'

vi.mock('../auth/supabase', async (importarOriginal) => ({
  ...await importarOriginal<Record<string, unknown>>(),
  hasSupabaseConfiguration: false,
  ensureRemoteDevice: vi.fn(() => Promise.resolve()),
}))

const CONTA = 'conta-ficticia-mudanca'
const bancos: Array<{ delete: () => Promise<void> }> = []

beforeEach(() => localStorage.clear())
afterEach(async () => {
  await Promise.all(bancos.splice(0).map((banco) => banco.delete()))
  localStorage.clear()
})

function montar() {
  const cofre = new ApoioDatabase(`cofre-${crypto.randomUUID()}`)
  const leitura = new ReadingDatabase(`leitura-${crypto.randomUUID()}`)
  const orcamento = new FamilyBudgetDatabase(`orcamento-${crypto.randomUUID()}`)
  bancos.push(cofre, leitura, orcamento)
  return { cofre, leitura, orcamento, migracao: new MigracaoDosPessoais(cofre, leitura, orcamento) }
}

async function gravarAntigo(
  banco: ReadingDatabase | FamilyBudgetDatabase,
  key: CryptoKey, id: string, recordType: string, tipo: string, data: unknown,
) {
  await (banco.records as unknown as { put: (registro: unknown) => Promise<unknown> }).put({
    id, accountId: CONTA, recordType, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    ...await encryptPayload(key, { schemaVersion: 1, type: tipo, data }, id),
  })
}

describe('mudança dos registros pessoais para o cofre', () => {
  it('traz leitura, orçamento pessoal e lista de compras', async () => {
    const { cofre, leitura, orcamento, migracao } = montar()
    const key = await generateMasterKey()
    await gravarAntigo(leitura, key, 'livro-1', 'book', 'personal_reading_book', { title: 'Livro Fictício' })
    await gravarAntigo(orcamento, key, 'compra-1', 'shopping', 'family_budget_shopping', { name: 'Arroz fictício' })
    await gravarAntigo(orcamento, key, 'lanc-1', 'pessoal_lancamento', 'pessoal_lancamento', { descricao: 'Saída fictícia' })

    expect(await migracao.pendentes(CONTA)).toBe(3)
    expect(await migracao.mover(CONTA, key)).toMatchObject({ movidos: 3, jaEstavam: 0, ilegiveis: 0 })

    const noCofre = await cofre.vaultRecords.where('accountId').equals(CONTA).toArray()
    expect(noCofre.map(({ recordType }) => recordType).sort()).toEqual(['personal_reading_book', 'personal_shopping', 'pessoal_lancamento'])
  })

  /*
    O banco antigo continua exatamente como está: é dele que um backup gerado
    antes da mudança continua sendo restaurado.
  */
  it('não apaga nada do lugar antigo', async () => {
    const { leitura, migracao } = montar()
    const key = await generateMasterKey()
    await gravarAntigo(leitura, key, 'livro-1', 'book', 'personal_reading_book', { title: 'Livro Fictício' })

    await migracao.mover(CONTA, key)
    expect(await leitura.records.count()).toBe(1)
  })

  /* Rodar de novo não cria um segundo registro nem refaz o trabalho. */
  it('a segunda rodada não move nada', async () => {
    const { migracao, leitura } = montar()
    const key = await generateMasterKey()
    await gravarAntigo(leitura, key, 'livro-1', 'book', 'personal_reading_book', { title: 'Livro Fictício' })

    await migracao.mover(CONTA, key)
    expect(await migracao.pendentes(CONTA)).toBe(0)
    expect(await migracao.mover(CONTA, key)).toMatchObject({ movidos: 0, jaEstavam: 1 })
  })

  /*
    Entradas e saídas do formato antigo do orçamento têm migração própria e um
    caminho de leitura que ainda as cobre. Trazê-las aqui as duplicaria.
  */
  it('deixa o formato antigo do orçamento onde está', async () => {
    const { cofre, orcamento, migracao } = montar()
    const key = await generateMasterKey()
    await gravarAntigo(orcamento, key, 'entrada-1', 'income', 'family_budget_income', { amount: 100 })

    expect(await migracao.mover(CONTA, key)).toMatchObject({ movidos: 0, ilegiveis: 1 })
    expect(await cofre.vaultRecords.count()).toBe(0)
  })

  /*
    Um registro que não abre neste aparelho é contado e deixado para trás.
    Parar a fila por causa dele deixaria todo o resto invisível para sempre.
  */
  it('um registro ilegível não trava os outros', async () => {
    const { leitura, migracao } = montar()
    const key = await generateMasterKey()
    const outraChave = await generateMasterKey()
    await gravarAntigo(leitura, outraChave, 'ilegivel', 'book', 'personal_reading_book', { title: 'Não abre' })
    await gravarAntigo(leitura, key, 'livro-1', 'book', 'personal_reading_book', { title: 'Livro Fictício' })

    expect(await migracao.mover(CONTA, key)).toMatchObject({ movidos: 1, ilegiveis: 1 })
  })

  /* Depois da mudança, o serviço encontra o que o pastor já tinha. */
  it('a leitura e a lista voltam a aparecer pelos serviços novos', async () => {
    const { cofre, leitura, orcamento, migracao } = montar()
    const key = await generateMasterKey()
    await gravarAntigo(leitura, key, 'livro-1', 'book', 'personal_reading_book', {
      title: 'Livro Fictício', author: 'Autora Fictícia', category: 'theology', totalPages: 100,
      pagesRead: 10, startDate: '2026-01-01', completedDate: null, status: 'reading', notes: '',
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    })
    await gravarAntigo(orcamento, key, 'compra-1', 'shopping', 'family_budget_shopping', {
      name: 'Arroz fictício', quantity: 1, unitPrice: 500, unit: 'un', confirmed: false, notes: '',
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    })

    await migracao.mover(CONTA, key)

    expect((await new ReadingService(cofre).books(CONTA, key)).map(({ title }) => title)).toEqual(['Livro Fictício'])
    expect((await new ShoppingListService(cofre).items(CONTA, key)).map(({ name }) => name)).toEqual(['Arroz fictício'])
  })

  it('conta sem nada antigo não faz nada', async () => {
    const { migracao } = montar()
    expect(await migracao.mover(CONTA, await generateMasterKey())).toMatchObject({ movidos: 0, jaEstavam: 0 })
  })
})
