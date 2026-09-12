import { describe, expect, it } from 'vitest'
import {
  CATALOGO_DE_COMPRAS, CATEGORIAS_DO_CATALOGO, listaPadrao, podeRegistrar,
  repetirCompra, subtotal, totaisDaCompra, trazerDaListaAntiga,
  type CompraData, type ItemAntigo, type ItemDaCompra,
} from './compras'
import { emCentavos } from './dinheiro'

const nomes = () => CATALOGO_DE_COMPRAS.map(({ nome }) => nome)

function item(overrides: Partial<ItemDaCompra> = {}): ItemDaCompra {
  return {
    id: crypto.randomUUID(), nome: 'Arroz branco', categoria: 'Arroz, grãos e cereais',
    quantidade: 1, unidade: 'kg', valorUnitario: emCentavos(25), comprado: false, observacao: '', ...overrides,
  }
}

function compra(itens: ItemDaCompra[], limite = 0): CompraData {
  return {
    mes: '2026-09', nome: 'Compra fictícia', itens, limite,
    lancamentoId: null, finalizadaEm: null,
    createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
  }
}

describe('catálogo de compras', () => {
  /*
    Ausência proposital: a casa toma cevada. Acrescentar café mais tarde para
    "completar" a lista mudaria o que a família vê toda semana.
  */
  it('não traz café, e traz cevada', () => {
    expect(nomes()).not.toContain('Café')
    expect(nomes()).not.toContain('Café solúvel')
    expect(nomes()).toContain('Cevada')
  })

  it('cobre as dezessete prateleiras', () => {
    expect(CATEGORIAS_DO_CATALOGO).toHaveLength(17)
    expect(CATEGORIAS_DO_CATALOGO).toContain('Proteínas')
    expect(CATEGORIAS_DO_CATALOGO).toContain('Bebê e criança')
  })

  it('atende quem come carne e quem não come', () => {
    const proteinas = CATALOGO_DE_COMPRAS.filter(({ categoria }) => categoria === 'Proteínas').map(({ nome }) => nome)
    expect(proteinas).toContain('Carne bovina')
    expect(proteinas).toContain('Proteína de soja')
    expect(proteinas).toContain('Hambúrguer vegetal')
  })

  it('cada item nasce com uma unidade que faz sentido', () => {
    const arroz = CATALOGO_DE_COMPRAS.find(({ nome }) => nome === 'Arroz branco')
    const ovos = CATALOGO_DE_COMPRAS.find(({ nome }) => nome === 'Ovos')
    expect(arroz?.unidade).toBe('kg')
    expect(ovos?.unidade).toBe('dúzia')
  })
})

describe('subtotal e totais', () => {
  it('quantidade vezes valor unitário', () => {
    expect(subtotal(item({ quantidade: 3, valorUnitario: emCentavos(25) }))).toBe(emCentavos(75))
    expect(subtotal(item({ quantidade: 2.5, valorUnitario: emCentavos(10) }))).toBe(emCentavos(25))
  })

  it('separa a lista inteira do que já está no carrinho', () => {
    const totais = totaisDaCompra(compra([
      item({ quantidade: 2, valorUnitario: emCentavos(25), comprado: true }),
      item({ quantidade: 1, valorUnitario: emCentavos(30), comprado: true }),
      item({ quantidade: 1, valorUnitario: emCentavos(40) }),
    ]))
    expect(totais.listaInteira).toBe(emCentavos(120))
    expect(totais.noCarrinho).toBe(emCentavos(80))
    expect(totais.itens).toBe(3)
    expect(totais.marcados).toBe(2)
  })

  it('o limite vira o que ainda dá para gastar', () => {
    const totais = totaisDaCompra(compra([item({ quantidade: 4, valorUnitario: emCentavos(25), comprado: true })], emCentavos(150)))
    expect(totais.disponivel).toBe(emCentavos(50))
    expect(totais.passouDoLimite).toBe(false)
  })

  it('avisa quando o carrinho passa do limite', () => {
    const totais = totaisDaCompra(compra([item({ quantidade: 8, valorUnitario: emCentavos(25), comprado: true })], emCentavos(150)))
    expect(totais.disponivel).toBeLessThan(0)
    expect(totais.passouDoLimite).toBe(true)
  })

  it('sem limite não há disponível', () => {
    expect(totaisDaCompra(compra([item()])).disponivel).toBeNull()
  })
})

describe('lista padrão', () => {
  it('nasce com tudo zerado e nada marcado', () => {
    const nova = listaPadrao('2026-09')
    expect(nova.itens.length).toBe(CATALOGO_DE_COMPRAS.length)
    expect(nova.itens.every(({ comprado, valorUnitario }) => !comprado && valorUnitario === 0)).toBe(true)
    expect(totaisDaCompra(nova).listaInteira).toBe(0)
  })

  it('aceita só as prateleiras escolhidas', () => {
    const proteinas = CATALOGO_DE_COMPRAS.filter(({ categoria }) => categoria === 'Proteínas')
    expect(listaPadrao('2026-09', proteinas).itens).toHaveLength(proteinas.length)
  })
})

describe('repetir a compra do mês passado', () => {
  /*
    Os preços vêm junto — é o que o mercado cobrava. Mas nada vem marcado: a
    compra de outubro não pode nascer meio feita.
  */
  it('leva os preços e não leva o que já foi comprado', () => {
    const anterior = compra([
      item({ quantidade: 2, valorUnitario: emCentavos(25), comprado: true }),
      item({ nome: 'Feijão carioca', valorUnitario: emCentavos(9), comprado: true }),
    ], emCentavos(500))
    const nova = repetirCompra({ ...anterior, lancamentoId: 'l1', finalizadaEm: '2026-09-20' }, '2026-10')

    expect(nova.mes).toBe('2026-10')
    expect(nova.limite).toBe(emCentavos(500))
    expect(nova.itens.every(({ comprado }) => !comprado)).toBe(true)
    expect(nova.itens.map(({ valorUnitario }) => valorUnitario)).toEqual([emCentavos(25), emCentavos(9)])
    expect(nova.lancamentoId).toBeNull()
    expect(nova.finalizadaEm).toBeNull()
  })

  it('os itens copiados não compartilham identificador com os antigos', () => {
    const anterior = compra([item()])
    const nova = repetirCompra(anterior, '2026-10')
    expect(nova.itens[0]!.id).not.toBe(anterior.itens[0]!.id)
  })
})

describe('registrar a compra nas finanças', () => {
  /*
    Uma compra vira uma saída só. E finalizar duas vezes não pode dobrar o
    valor: a compra guarda o lançamento que criou e recusa criar outro.
  */
  it('só registra quando há algo no carrinho', () => {
    expect(podeRegistrar(compra([item({ comprado: true })]))).toBe(true)
    expect(podeRegistrar(compra([item({ comprado: false })]))).toBe(false)
    expect(podeRegistrar(compra([]))).toBe(false)
  })

  it('não registra duas vezes a mesma compra', () => {
    const jaRegistrada = { ...compra([item({ comprado: true })]), lancamentoId: 'lancamento-ficticio' }
    expect(podeRegistrar(jaRegistrada)).toBe(false)
  })
})

/**
 * A tela da lista antiga saiu do ar quando o Orçamento Pessoal ganhou as seis
 * áreas. O que estava nela continuou no cofre, sincronizando, sem nenhuma tela
 * que mostrasse. Trazer é o caminho de volta — e a armadilha é a moeda: a lista
 * antiga guardava reais, esta guarda centavos.
 */
describe('trazer o que ficou na lista de compras antiga', () => {
  const antigo = (overrides: Partial<ItemAntigo> = {}): ItemAntigo => ({
    name: 'Arroz branco', quantity: 2, unit: 'kg', unitPrice: 25, confirmed: false, notes: '', ...overrides,
  })

  it('converte reais em centavos', () => {
    const [trazido] = trazerDaListaAntiga([antigo({ unitPrice: 25.5 })])
    expect(trazido!.valorUnitario).toBe(emCentavos(25.5))
  })

  it('mantém o que já estava no carrinho', () => {
    const [pego, naoPego] = trazerDaListaAntiga([antigo({ confirmed: true }), antigo({ confirmed: false })])
    expect(pego!.comprado).toBe(true)
    expect(naoPego!.comprado).toBe(false)
  })

  it('traduz a unidade antiga e reconhece o item do catálogo', () => {
    const [trazido] = trazerDaListaAntiga([antigo({ unit: 'pct' })])
    expect(trazido!.unidade).toBe('pacote')
    expect(CATEGORIAS_DO_CATALOGO).toContain(trazido!.categoria)
  })

  it('o que não está no catálogo entra em Outros, sem perder nada', () => {
    const [trazido] = trazerDaListaAntiga([antigo({ name: '  Tempero fictício  ', unit: 'un', notes: ' na feira ' })])
    expect(trazido!.nome).toBe('Tempero fictício')
    expect(trazido!.categoria).toBe('Outros')
    expect(trazido!.unidade).toBe('unidade')
    expect(trazido!.observacao).toBe('na feira')
  })

  it('não deixa quantidade nem preço negativos entrarem', () => {
    const [trazido] = trazerDaListaAntiga([antigo({ quantity: -3, unitPrice: -10 })])
    expect(trazido!.quantidade).toBe(0)
    expect(trazido!.valorUnitario).toBe(0)
  })

  it('cada item trazido nasce com identificador próprio', () => {
    const trazidos = trazerDaListaAntiga([antigo(), antigo()])
    expect(new Set(trazidos.map(({ id }) => id)).size).toBe(2)
  })
})
