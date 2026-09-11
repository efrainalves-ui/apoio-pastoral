import { db, type ApoioDatabase } from '../db/database'
import { PersonalVaultStore } from '../db/personalVault'
import type { BudgetExpenseData } from '../family-budget/types'
import { itemTotal, type ShoppingItemData, type ShoppingItemEntity } from './types'

const agora = () => new Date().toISOString()

/**
 * A lista de compras é do pastor, e agora viaja com ele.
 *
 * Ela morava no banco pessoal, à parte, e era isso que a mantinha fora do
 * encerramento de distrito — compra de casa é dinheiro de casa, e não tem nada
 * a ver com a igreja. O preço era não existir no outro aparelho: a lista feita
 * no celular não aparecia no computador, que é justamente onde ela seria útil.
 *
 * Agora mora no cofre cifrado e anda pelos mesmos trilhos. A promessa continua
 * inteira, sustentada pelo tipo do registro: `isPersonalRecord` a reconhece, e
 * o encerramento de distrito a preserva.
 */
export class ShoppingListService {
  private readonly cofre: PersonalVaultStore
  constructor(database: ApoioDatabase = db) { this.cofre = new PersonalVaultStore(database) }

  async items(accountId: string, key: CryptoKey): Promise<ShoppingItemEntity[]> {
    const abertos = await this.cofre.listar<ShoppingItemData>(accountId, key, 'personal_shopping', 'family_budget_shopping')
    return abertos.sort((esquerda, direita) => esquerda.createdAt.localeCompare(direita.createdAt))
  }

  async save(accountId: string, key: CryptoKey, input: ShoppingItemData, id: string = crypto.randomUUID()): Promise<ShoppingItemEntity> {
    if (!input.name.trim()) throw new Error('Informe o nome do item.')
    if (!(input.quantity > 0)) throw new Error('Informe uma quantidade maior que zero.')
    const data: ShoppingItemData = {
      ...input,
      name: input.name.trim(),
      notes: input.notes.trim(),
      unitPrice: Math.max(0, input.unitPrice),
    }
    return this.cofre.gravar(accountId, key, 'personal_shopping', 'family_budget_shopping', data, id)
  }

  async remove(accountId: string, key: CryptoKey, id: string): Promise<void> {
    await this.cofre.apagar(accountId, key, id)
  }

  /** Tira da lista tudo que já foi confirmado, depois da compra. */
  async clearConfirmed(accountId: string, key: CryptoKey): Promise<number> {
    const confirmados = (await this.items(accountId, key)).filter(({ confirmed }) => confirmed)
    await this.cofre.apagarVarios(accountId, key, confirmados.map(({ id }) => id))
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
