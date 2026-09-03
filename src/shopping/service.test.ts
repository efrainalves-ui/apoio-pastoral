import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { generateMasterKey } from '../crypto/vault'
import { FamilyBudgetDatabase } from '../family-budget/database'
import { ShoppingListService } from './service'
import { frequentItems, itemTotal, shoppingTotals, type ShoppingItemData } from './types'

const CONTA = 'conta-ficticia-compras'
const bancos: FamilyBudgetDatabase[] = []
afterEach(async () => { await Promise.all(bancos.splice(0).map((banco) => banco.delete())) })

function novoBanco() {
  const banco = new FamilyBudgetDatabase(`compras-${crypto.randomUUID()}`)
  bancos.push(banco)
  return banco
}

const item = (name: string, quantity: number, unitPrice: number, confirmed = false): ShoppingItemData => ({
  name, quantity, unit: 'un', unitPrice, confirmed, notes: '', createdAt: '', updatedAt: '',
})

describe('total da lista de compras', () => {
  it('soma quantidade vezes valor informado', () => {
    expect(itemTotal({ quantity: 3, unitPrice: 4.5 })).toBe(13.5)
    expect(itemTotal({ quantity: 0, unitPrice: 10 })).toBe(0)
  })

  it('separa o que está no carrinho do que ainda falta pegar', () => {
    const totais = shoppingTotals([item('Arroz fictício', 2, 25, true), item('Feijão fictício', 1, 9, true), item('Café fictício', 1, 0)])

    expect(totais).toEqual({ items: 3, confirmedItems: 2, confirmed: 59, planned: 59, missingPrice: 1 })
  })

  it('sugere os itens que mais voltam à lista', () => {
    const historico = [item('Arroz fictício', 1, 0), item('Arroz fictício', 1, 0), item('Café fictício', 1, 0)]

    expect(frequentItems(historico)).toEqual(['Arroz fictício', 'Café fictício'])
  })
})

describe('lista de compras, área pessoal', () => {
  it('grava, lista e apaga item, tudo cifrado', async () => {
    const banco = novoBanco(); const chave = await generateMasterKey()
    const service = new ShoppingListService(banco)

    const salvo = await service.save(CONTA, chave, item('Arroz fictício', 2, 25))
    expect((await service.items(CONTA, chave)).map(({ name }) => name)).toEqual(['Arroz fictício'])
    expect(JSON.stringify(await banco.records.toArray())).not.toContain('Arroz fictício')

    await service.remove(CONTA, salvo.id)
    expect(await service.items(CONTA, chave)).toHaveLength(0)
  })

  it('recusa item sem nome ou sem quantidade', async () => {
    const banco = novoBanco(); const chave = await generateMasterKey()
    const service = new ShoppingListService(banco)

    await expect(service.save(CONTA, chave, item('   ', 1, 0))).rejects.toThrow('nome do item')
    await expect(service.save(CONTA, chave, item('Café fictício', 0, 0))).rejects.toThrow('quantidade')
  })

  it('não alcança a lista de outra conta', async () => {
    const banco = novoBanco(); const chave = await generateMasterKey()
    const service = new ShoppingListService(banco)
    await service.save(CONTA, chave, item('Arroz fictício', 1, 5))

    expect(await service.items('outra-conta-ficticia', chave)).toHaveLength(0)
  })

  it('a conversão em despesa nunca acontece sozinha, e depende de valor informado', async () => {
    const banco = novoBanco(); const chave = await generateMasterKey()
    const service = new ShoppingListService(banco)
    const lancadas: unknown[] = []
    const salvarDespesa = (data: unknown) => { lancadas.push(data); return Promise.resolve() }

    await service.save(CONTA, chave, item('Arroz fictício', 2, 25, false))
    // Nada confirmado: nenhuma despesa é lançada, e o erro diz o porquê.
    await expect(service.toPersonalExpense(CONTA, chave, '2026-09-10', salvarDespesa)).rejects.toThrow('Confirme ao menos um item')
    expect(lancadas).toHaveLength(0)

    await service.save(CONTA, chave, item('Feijão fictício', 1, 0, true))
    await expect(service.toPersonalExpense(CONTA, chave, '2026-09-10', salvarDespesa)).rejects.toThrow('Informe o valor')
    expect(lancadas).toHaveLength(0)
  })

  it('lança uma despesa pessoal com o total do que está no carrinho', async () => {
    const banco = novoBanco(); const chave = await generateMasterKey()
    const service = new ShoppingListService(banco)
    const lancadas: Array<{ amount: number; description: string; date: string }> = []

    await service.save(CONTA, chave, item('Arroz fictício', 2, 25, true))
    await service.save(CONTA, chave, item('Feijão fictício', 1, 9, true))
    await service.save(CONTA, chave, item('Café fictício', 1, 20, false))

    const resultado = await service.toPersonalExpense(CONTA, chave, '2026-09-10', (data) => { lancadas.push(data); return Promise.resolve() })

    expect(resultado).toEqual({ total: 59, items: 2 })
    expect(lancadas).toHaveLength(1)
    expect(lancadas[0]).toMatchObject({ amount: 59, date: '2026-09-10' })
    // O item não confirmado continua na lista para a próxima ida ao mercado.
    expect(await service.clearConfirmed(CONTA, chave)).toBe(2)
    expect((await service.items(CONTA, chave)).map(({ name }) => name)).toEqual(['Café fictício'])
  })
})

describe('a lista de compras é pessoal, não do distrito', () => {
  it('vive no banco pessoal, junto do orçamento familiar', async () => {
    // Se vivesse no cofre pastoral, sairia no encerramento de distrito junto
    // com o que é da igreja — e compra de casa não tem nada a ver com isso.
    const banco = novoBanco(); const chave = await generateMasterKey()
    await new ShoppingListService(banco).save(CONTA, chave, item('Arroz fictício', 1, 5))

    const gravados = await banco.records.toArray()
    expect(gravados).toHaveLength(1)
    expect(gravados[0]?.recordType).toBe('shopping')
  })
})
