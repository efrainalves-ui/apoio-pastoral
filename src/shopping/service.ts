import { decryptRecord, encryptPayload } from '../crypto/vault'
import { familyBudgetDb, type FamilyBudgetDatabase } from '../family-budget/database'
import type { BudgetExpenseData } from '../family-budget/types'
import { itemTotal, type ShoppingItemData, type ShoppingItemEntity } from './types'

const agora = () => new Date().toISOString()

/**
 * A lista de compras mora no banco pessoal, ao lado do orçamento familiar.
 *
 * É o mesmo lugar por um motivo: compra de casa é dinheiro de casa. Ficar no
 * banco pastoral faria a lista sair no encerramento de distrito junto com o
 * que é da igreja, e ela não tem nada a ver com isso.
 */
export class ShoppingListService {
  constructor(private readonly database: FamilyBudgetDatabase = familyBudgetDb) {}

  async items(accountId: string, key: CryptoKey): Promise<ShoppingItemEntity[]> {
    const records = await this.database.records.where('accountId').equals(accountId)
      .filter((record) => record.recordType === 'shopping').toArray()
    const abertos = await Promise.all(records.map(async (record) => {
      const payload = await decryptRecord(key, record)
      return payload?.type === 'family_budget_shopping' ? ({ id: record.id, ...(payload.data as ShoppingItemData) }) : null
    }))
    return abertos.flatMap((item) => item ? [item] : [])
      .sort((esquerda, direita) => esquerda.createdAt.localeCompare(direita.createdAt))
  }

  async save(accountId: string, key: CryptoKey, input: ShoppingItemData, id: string = crypto.randomUUID()): Promise<ShoppingItemEntity> {
    if (!input.name.trim()) throw new Error('Informe o nome do item.')
    if (!(input.quantity > 0)) throw new Error('Informe uma quantidade maior que zero.')
    const existente = await this.database.records.get(id)
    if (existente && existente.accountId !== accountId) throw new Error('Este item pertence a outra conta.')
    const carimbo = agora()
    const data: ShoppingItemData = {
      ...input,
      name: input.name.trim(),
      notes: input.notes.trim(),
      unitPrice: Math.max(0, input.unitPrice),
      createdAt: input.createdAt || carimbo,
      updatedAt: carimbo,
    }
    const envelope = await encryptPayload(key, { schemaVersion: 1, type: 'family_budget_shopping', data }, id)
    await this.database.records.put({ id, accountId, recordType: 'shopping', createdAt: existente?.createdAt ?? carimbo, updatedAt: carimbo, ...envelope })
    return { id, ...data }
  }

  async remove(accountId: string, id: string): Promise<void> {
    const record = await this.database.records.get(id)
    if (!record || record.accountId !== accountId) throw new Error('Item não encontrado.')
    await this.database.records.delete(id)
  }

  /** Tira da lista tudo que já foi confirmado, depois da compra. */
  async clearConfirmed(accountId: string, key: CryptoKey): Promise<number> {
    const confirmados = (await this.items(accountId, key)).filter(({ confirmed }) => confirmed)
    await this.database.records.bulkDelete(confirmados.map(({ id }) => id))
    return confirmados.length
  }

  /**
   * Transforma as compras confirmadas em uma despesa pessoal.
   *
   * **Nunca acontece sozinho.** É sempre um botão que o pastor aperta depois de
   * conferir o total, e por isso o valor vem do que está na lista naquele
   * momento, não de um cálculo guardado antes. Uma conversão automática
   * lançaria despesa por engano toda vez que alguém marcasse um item.
   */
  async toPersonalExpense(
    accountId: string,
    key: CryptoKey,
    date: string,
    salvarDespesa: (data: BudgetExpenseData) => Promise<unknown>,
  ): Promise<{ total: number; items: number }> {
    const confirmados = (await this.items(accountId, key)).filter(({ confirmed }) => confirmed)
    if (!confirmados.length) throw new Error('Confirme ao menos um item antes de lançar a despesa.')
    const total = confirmados.reduce((soma, item) => soma + itemTotal(item), 0)
    if (!(total > 0)) throw new Error('Informe o valor dos itens confirmados antes de lançar a despesa.')
    const carimbo = agora()
    await salvarDespesa({
      category: 'food',
      description: `Compras do mercado (${confirmados.length} ${confirmados.length === 1 ? 'item' : 'itens'})`,
      amount: total,
      date,
      status: 'paid',
      fixed: false,
      installment: false,
      installmentsTotal: 0,
      installmentNumber: 0,
      notes: '',
      titheDeducted: false,
      createdAt: carimbo,
      updatedAt: carimbo,
    })
    return { total, items: confirmados.length }
  }
}
