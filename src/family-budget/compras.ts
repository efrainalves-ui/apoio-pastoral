import type { Centavos } from './dinheiro'
import { somar } from './dinheiro'

/**
 * A lista de compras da casa.
 *
 * Uma lista que começa vazia é uma lista que nunca é usada: ninguém digita
 * setenta itens antes da primeira ida ao mercado. Por isso o catálogo abaixo
 * vem pronto, e o que a família não usa ela apaga uma vez só.
 *
 * Duas ausências são propositais e estão guardadas em teste: café não entra —
 * a casa toma cevada — e nada aqui vira despesa individual. A compra inteira
 * vira **uma** saída em Alimentação · Supermercado, porque quarenta linhas de
 * dois reais no extrato não dizem nada que o total não diga melhor.
 */

export const UNIDADES = [
  'unidade', 'pacote', 'caixa', 'saco', 'garrafa', 'lata', 'pote', 'bandeja',
  'dúzia', 'kg', 'g', 'L', 'ml', 'fardo', 'rolo', 'outra',
] as const
export type Unidade = (typeof UNIDADES)[number]

export interface ItemDoCatalogo {
  nome: string
  categoria: string
  unidade: Unidade
}

function grupo(categoria: string, itens: Array<string | [string, Unidade]>): ItemDoCatalogo[] {
  return itens.map((item) => {
    const [nome, unidade] = Array.isArray(item) ? item : [item, 'unidade' as Unidade]
    return { nome, categoria, unidade }
  })
}

export const CATALOGO_DE_COMPRAS: ItemDoCatalogo[] = [
  ...grupo('Arroz, grãos e cereais', [
    ['Arroz branco', 'kg'], ['Arroz integral', 'kg'], ['Feijão carioca', 'kg'], ['Feijão preto', 'kg'],
    ['Feijão verde', 'kg'], ['Lentilha', 'pacote'], ['Grão-de-bico', 'pacote'], ['Ervilha seca', 'pacote'],
    ['Milho', 'lata'], ['Aveia', 'pacote'], ['Granola', 'pacote'], ['Cereal matinal', 'caixa'], ['Quinoa', 'pacote'],
  ]),
  ...grupo('Massas e farinhas', [
    ['Macarrão espaguete', 'pacote'], ['Macarrão parafuso', 'pacote'], ['Massa de lasanha', 'pacote'],
    ['Farinha de trigo', 'kg'], ['Farinha de mandioca', 'kg'], ['Farinha de milho', 'kg'], ['Fubá', 'kg'],
    ['Tapioca/goma', 'kg'], ['Polvilho', 'pacote'], ['Amido de milho', 'caixa'], ['Fermento', 'pote'],
    ['Mistura para bolo', 'caixa'],
  ]),
  ...grupo('Básicos da despensa', [
    ['Açúcar', 'kg'], ['Açúcar mascavo', 'pacote'], ['Sal', 'kg'], ['Óleo', 'garrafa'], ['Azeite', 'garrafa'],
    ['Vinagre', 'garrafa'], ['Molho de tomate', 'unidade'], ['Extrato de tomate', 'unidade'], 'Ketchup',
    'Mostarda', 'Maionese', 'Molho de pimenta', 'Molho shoyu',
  ]),
  ...grupo('Temperos', [
    'Alho', 'Cebola', 'Pimenta-do-reino', 'Colorau', 'Cominho', 'Orégano', 'Páprica',
    'Açafrão/cúrcuma', 'Cheiro-verde', 'Coentro', 'Canela', 'Outros temperos',
  ]),
  // A casa toma cevada. Café não entra no catálogo padrão.
  ...grupo('Café da manhã', [
    'Cevada', ['Leite', 'L'], ['Leite vegetal', 'L'], 'Achocolatado', 'Pão', 'Pão integral', 'Torradas',
    ['Biscoitos', 'pacote'], ['Bolachas', 'pacote'], 'Cuscuz', 'Tapioca', 'Margarina', 'Manteiga',
    'Requeijão', ['Queijo', 'kg'], 'Geleia', 'Mel', ['Aveia', 'pacote'], ['Granola', 'pacote'], ['Cereal matinal', 'caixa'],
  ]),
  ...grupo('Geladeira e laticínios', [
    ['Ovos', 'dúzia'], ['Queijo', 'kg'], ['Frios', 'kg'], 'Iogurte', 'Manteiga', 'Margarina',
    'Requeijão', 'Creme de leite', 'Leite condensado', ['Leite', 'L'], ['Leite vegetal', 'L'],
  ]),
  ...grupo('Proteínas', [
    ['Carne bovina', 'kg'], ['Frango', 'kg'], ['Peixe', 'kg'], ['Carne suína', 'kg'], ['Carne moída', 'kg'],
    ['Hambúrguer', 'pacote'], ['Salsicha', 'pacote'], ['Linguiça', 'kg'], ['Ovos', 'dúzia'],
    ['Proteína de soja', 'pacote'], ['Hambúrguer vegetal', 'pacote'], ['Proteína vegetal', 'pacote'], 'Outras proteínas',
  ]),
  ...grupo('Frutas', [
    ['Banana', 'kg'], ['Maçã', 'kg'], ['Laranja', 'kg'], ['Mamão', 'kg'], ['Melancia', 'kg'], ['Melão', 'kg'],
    'Abacaxi', ['Manga', 'kg'], ['Uva', 'kg'], ['Limão', 'kg'], 'Abacate', ['Pera', 'kg'], ['Goiaba', 'kg'],
    ['Tangerina', 'kg'], 'Outras frutas',
  ]),
  ...grupo('Verduras, legumes e raízes', [
    ['Tomate', 'kg'], ['Cebola', 'kg'], 'Alho', ['Batata', 'kg'], ['Batata-doce', 'kg'], ['Cenoura', 'kg'],
    ['Beterraba', 'kg'], ['Pepino', 'kg'], ['Pimentão', 'kg'], ['Abóbora', 'kg'], ['Chuchu', 'kg'],
    ['Abobrinha', 'kg'], ['Macaxeira/mandioca', 'kg'], ['Inhame', 'kg'], 'Alface', 'Couve', 'Repolho',
    'Cheiro-verde', 'Coentro', 'Brócolis', 'Couve-flor',
  ]),
  ...grupo('Congelados', [
    ['Legumes congelados', 'pacote'], ['Batata congelada', 'pacote'], 'Pizza', 'Lasanha',
    ['Pão de queijo', 'pacote'], ['Polpa de frutas', 'pacote'], 'Açaí', 'Proteínas congeladas', 'Outros congelados',
  ]),
  // Sem café aqui também.
  ...grupo('Bebidas', [
    ['Água mineral', 'fardo'], ['Água com gás', 'garrafa'], ['Suco', 'L'], ['Polpa de fruta', 'pacote'],
    ['Água de coco', 'L'], ['Refrigerante', 'garrafa'], ['Chá', 'caixa'], 'Cevada', 'Achocolatado', ['Bebida vegetal', 'L'],
  ]),
  ...grupo('Lanches', [
    ['Biscoitos', 'pacote'], ['Cookies', 'pacote'], ['Barras de cereal', 'caixa'], ['Castanhas', 'pacote'],
    ['Amendoim', 'pacote'], ['Pipoca', 'pacote'], 'Chocolate', 'Gelatina', ['Salgadinhos', 'pacote'],
    ['Frutas secas', 'pacote'], 'Outros lanches',
  ]),
  ...grupo('Limpeza', [
    'Detergente', ['Sabão em pó', 'pacote'], ['Sabão líquido', 'garrafa'], ['Amaciante', 'garrafa'],
    ['Água sanitária', 'garrafa'], ['Desinfetante', 'garrafa'], 'Limpador multiuso', ['Álcool', 'garrafa'],
    'Limpador de vidro', 'Desengordurante', ['Sabão em barra', 'pacote'], 'Esponja', 'Palha de aço',
    ['Sacos de lixo', 'pacote'], ['Luvas', 'unidade'], 'Pano de chão', 'Flanela', 'Vassoura', 'Rodo',
  ]),
  ...grupo('Higiene pessoal', [
    ['Papel higiênico', 'pacote'], 'Creme dental', 'Escova de dentes', 'Fio dental', 'Sabonete',
    'Shampoo', 'Condicionador', 'Desodorante', ['Absorvente', 'pacote'], 'Aparelho de barbear',
    ['Algodão', 'pacote'], ['Cotonetes', 'caixa'], 'Enxaguante bucal', 'Hidratante', 'Protetor solar',
  ]),
  ...grupo('Bebê e criança', [
    ['Fraldas', 'pacote'], ['Lenço umedecido', 'pacote'], 'Pomada', 'Shampoo infantil', 'Sabonete infantil',
    ['Leite/fórmula', 'lata'], 'Papinha', ['Cereal infantil', 'caixa'], 'Itens de higiene infantil',
  ]),
  ...grupo('Casa e descartáveis', [
    ['Papel toalha', 'pacote'], ['Guardanapo', 'pacote'], ['Papel alumínio', 'rolo'], ['Filme plástico', 'rolo'],
    ['Sacos para alimentos', 'pacote'], ['Copos descartáveis', 'pacote'], ['Pratos descartáveis', 'pacote'],
    ['Palitos', 'caixa'], ['Fósforos', 'caixa'], 'Velas', 'Inseticida',
  ]),
  ...grupo('Pet', [
    ['Ração', 'kg'], ['Sachê', 'unidade'], ['Areia sanitária', 'saco'], ['Petiscos', 'pacote'], 'Produtos de higiene',
  ]),
]

export const CATEGORIAS_DO_CATALOGO = [...new Set(CATALOGO_DE_COMPRAS.map(({ categoria }) => categoria))]

export interface ItemDaCompra {
  id: string
  nome: string
  categoria: string
  quantidade: number
  unidade: Unidade
  /** Preço de uma unidade, em centavos. */
  valorUnitario: Centavos
  comprado: boolean
  observacao: string
}

export interface CompraData {
  /** `AAAA-MM` a que a compra pertence. */
  mes: string
  nome: string
  itens: ItemDaCompra[]
  /** Teto que a família se deu para esta compra. Zero quando não há. */
  limite: Centavos
  /** Id do lançamento criado ao finalizar. Guarda contra registrar duas vezes. */
  lancamentoId: string | null
  finalizadaEm: string | null
  createdAt: string
  updatedAt: string
}

export type Compra = CompraData & { id: string }

export function subtotal(item: ItemDaCompra): Centavos {
  return Math.round(item.quantidade * item.valorUnitario)
}

export interface TotaisDaCompra {
  /** O que a lista inteira custaria. */
  listaInteira: Centavos
  /** O que já está marcado como pego. */
  noCarrinho: Centavos
  /** Quanto do limite ainda sobra. Nulo quando não há limite. */
  disponivel: Centavos | null
  passouDoLimite: boolean
  itens: number
  marcados: number
}

export function totaisDaCompra(compra: CompraData): TotaisDaCompra {
  const listaInteira = somar(compra.itens.map(subtotal))
  const noCarrinho = somar(compra.itens.filter(({ comprado }) => comprado).map(subtotal))
  const disponivel = compra.limite > 0 ? compra.limite - noCarrinho : null
  return {
    listaInteira,
    noCarrinho,
    disponivel,
    passouDoLimite: compra.limite > 0 && noCarrinho > compra.limite,
    itens: compra.itens.length,
    marcados: compra.itens.filter(({ comprado }) => comprado).length,
  }
}

/** Uma lista nova a partir do catálogo, com tudo zerado e nada marcado. */
export function listaPadrao(mes: string, escolhidos: readonly ItemDoCatalogo[] = CATALOGO_DE_COMPRAS): CompraData {
  return {
    mes,
    nome: 'Compra do mês',
    itens: escolhidos.map((item) => ({
      id: crypto.randomUUID(),
      nome: item.nome,
      categoria: item.categoria,
      quantidade: 1,
      unidade: item.unidade,
      valorUnitario: 0,
      comprado: false,
      observacao: '',
    })),
    limite: 0,
    lancamentoId: null,
    finalizadaEm: null,
    createdAt: '',
    updatedAt: '',
  }
}

/**
 * A lista de compras antiga, trazida para a lista de hoje.
 *
 * A tela antiga saiu do ar quando o Orçamento Pessoal ganhou as seis áreas, e
 * os itens que estavam nela ficaram guardados sem nenhuma tela que os
 * mostrasse. Eles continuam no cofre e continuam sincronizando; só não tinham
 * por onde aparecer.
 *
 * A lista antiga guardava reais; esta guarda centavos. Sem converter, um item
 * de R$ 25,00 entraria como R$ 0,25. O que já estava no carrinho chega
 * marcado, porque isso é informação do mercado, não da tela.
 */
export function trazerDaListaAntiga(itens: readonly ItemAntigo[]): ItemDaCompra[] {
  return itens.map((item) => {
    const doCatalogo = CATALOGO_DE_COMPRAS.find(({ nome }) => nome.toLowerCase() === item.name.trim().toLowerCase())
    return {
      id: crypto.randomUUID(),
      nome: item.name.trim(),
      categoria: doCatalogo?.categoria ?? 'Outros',
      quantidade: Math.max(0, item.quantity),
      unidade: UNIDADE_DA_LISTA_ANTIGA[item.unit] ?? doCatalogo?.unidade ?? 'unidade',
      valorUnitario: Math.round(Math.max(0, item.unitPrice) * 100),
      comprado: item.confirmed,
      observacao: item.notes.trim(),
    }
  })
}

/** O que a lista antiga guardava de um item. */
export interface ItemAntigo {
  name: string
  quantity: number
  unit: string
  /** Preço unitário em reais — a lista antiga não usava centavos. */
  unitPrice: number
  confirmed: boolean
  notes: string
}

const UNIDADE_DA_LISTA_ANTIGA: Record<string, Unidade> = {
  un: 'unidade', kg: 'kg', g: 'g', l: 'L', ml: 'ml', pct: 'pacote', cx: 'caixa',
}

/**
 * A lista do mês passado, pronta para servir de base.
 *
 * Os preços vêm junto — é o que o mercado cobrava — mas nada vem marcado como
 * comprado: a compra de outubro não pode nascer meio feita.
 */
export function repetirCompra(origem: CompraData, paraOMes: string): CompraData {
  return {
    ...origem,
    mes: paraOMes,
    itens: origem.itens.map((item) => ({ ...item, id: crypto.randomUUID(), comprado: false })),
    lancamentoId: null,
    finalizadaEm: null,
    createdAt: '',
    updatedAt: '',
  }
}

/**
 * A compra vira uma saída só, e nunca duas.
 *
 * Registrar cada item como despesa encheria o extrato de quarenta linhas de
 * dois reais e faria "Alimentação" parecer quarenta gastos diferentes. E
 * finalizar duas vezes não pode dobrar o valor: por isso a compra guarda o
 * lançamento que criou, e recusa criar outro.
 */
export function podeRegistrar(compra: CompraData): boolean {
  return compra.lancamentoId === null && totaisDaCompra(compra).noCarrinho > 0
}
