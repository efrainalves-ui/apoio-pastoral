/**
 * Lista de compras: área pessoal, dentro do Orçamento.
 *
 * Vive no banco pessoal, junto do orçamento familiar — não é dado do distrito
 * e não sai no encerramento. Funciona offline como todo o resto: o valor é
 * digitado no mercado, e o total acompanha em tempo real.
 */
export const SHOPPING_UNITS = ['un', 'kg', 'g', 'l', 'ml', 'pct', 'cx'] as const
export type ShoppingUnit = (typeof SHOPPING_UNITS)[number]
export const SHOPPING_UNIT_LABELS: Record<ShoppingUnit, string> = {
  un: 'un', kg: 'kg', g: 'g', l: 'L', ml: 'mL', pct: 'pacote', cx: 'caixa',
}

export interface ShoppingItemData {
  name: string
  quantity: number
  unit: ShoppingUnit
  /** Preço unitário informado no mercado. Zero enquanto ninguém informou. */
  unitPrice: number
  /** Confirmado significa "está no carrinho", e é o que entra no total. */
  confirmed: boolean
  notes: string
  createdAt: string
  updatedAt: string
}

export type ShoppingItemEntity = ShoppingItemData & { id: string }

/** Total de um item: quantidade vezes o preço informado. */
export function itemTotal(item: Pick<ShoppingItemData, 'quantity' | 'unitPrice'>): number {
  return Math.max(0, item.quantity) * Math.max(0, item.unitPrice)
}

/**
 * O que a lista soma agora.
 *
 * `confirmed` é o que já está no carrinho — o número que interessa no caixa.
 * `planned` é a lista inteira, para o pastor ver quanto ainda falta pegar.
 */
export interface ShoppingTotals {
  items: number
  confirmedItems: number
  confirmed: number
  planned: number
  missingPrice: number
}

export function shoppingTotals(itens: ShoppingItemData[]): ShoppingTotals {
  return {
    items: itens.length,
    confirmedItems: itens.filter(({ confirmed }) => confirmed).length,
    confirmed: itens.filter(({ confirmed }) => confirmed).reduce((total, item) => total + itemTotal(item), 0),
    planned: itens.reduce((total, item) => total + itemTotal(item), 0),
    missingPrice: itens.filter((item) => item.unitPrice <= 0).length,
  }
}

/**
 * Itens que costumam voltar à lista.
 *
 * Sai do que já foi comprado antes, por frequência: quem faz a mesma compra
 * toda semana não devia digitar "arroz" toda semana. Nada é adicionado
 * sozinho — a sugestão é um botão.
 */
export function frequentItems(itens: ShoppingItemData[], limite = 12): string[] {
  const contagem = new Map<string, number>()
  for (const item of itens) {
    const nome = item.name.trim()
    if (!nome) continue
    contagem.set(nome, (contagem.get(nome) ?? 0) + 1)
  }
  return [...contagem.entries()]
    .sort((esquerda, direita) => direita[1] - esquerda[1] || esquerda[0].localeCompare(direita[0], 'pt-BR'))
    .slice(0, limite)
    .map(([nome]) => nome)
}
