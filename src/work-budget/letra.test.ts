import { describe, expect, it } from 'vitest'
import { emCentavos } from '../family-budget/dinheiro'
import {
  avaliarCompra, elegibilidadeDoItem, saldoDoAno,
  type AquisicaoLetra, type ItemDoCatalogoLetra,
} from './letra'
import type { ContextoDoCalculo } from './parametros'

const contexto: ContextoDoCalculo = {
  fpe: emCentavos(7000), percentualDeAudit: 80, valorDaDespesa: 0, valorFixoLocal: 0, outraBase: 0,
}

function item(overrides: Partial<ItemDoCatalogoLetra> = {}): ItemDoCatalogoLetra {
  return {
    id: 'notebook', nome: 'Notebook', grupo: 'Equipamentos',
    limite: emCentavos(4000), limitePercentual: null, limiteBase: null,
    intervaloEmMeses: 48, ehLivro: false, referencia: 'LETRA', observacao: '', ...overrides,
  }
}

function aquisicao(overrides: Partial<AquisicaoLetra> = {}): AquisicaoLetra {
  return {
    id: 'a1', itemId: 'notebook', descricao: '', data: '2024-11-20',
    valor: emCentavos(4000), coberto: emCentavos(4000), parcelaPessoal: 0,
    memoria: null, observacao: '', createdAt: '', updatedAt: '', ...overrides,
  }
}

const orcamento = { total: emCentavos(6000), reservaDeLivros: emCentavos(2000) }
const catalogo = [item(), item({ id: 'livros', nome: 'Livros', ehLivro: true, limite: null, intervaloEmMeses: null })]

describe('saldo do ano', () => {
  /*
    A reserva sai de dentro do total, não se soma a ele. Com 6.000 no ano e
    2.000 reservados para livros, o que pode ir para o resto são 4.000 — não
    6.000.
  */
  it('a reserva de livros sai de dentro do total', () => {
    const saldo = saldoDoAno(orcamento, [], catalogo, '2026')
    expect(saldo.disponivelParaOutros).toBe(emCentavos(4000))
    expect(saldo.saldoDeLivros).toBe(emCentavos(2000))
    expect(saldo.saldoTotal).toBe(emCentavos(6000))
  })

  it('só conta as aquisições do ano pedido', () => {
    const saldo = saldoDoAno(orcamento, [aquisicao({ data: '2025-03-01', coberto: emCentavos(3000) })], catalogo, '2026')
    expect(saldo.usadoEmOutros).toBe(0)
  })

  it('gasto em equipamento não consome a reserva de livros', () => {
    const saldo = saldoDoAno(orcamento, [aquisicao({ data: '2026-02-10', coberto: emCentavos(3500) })], catalogo, '2026')
    expect(saldo.saldoDeOutros).toBe(emCentavos(500))
    expect(saldo.saldoDeLivros).toBe(emCentavos(2000))
  })

  /*
    A reserva é piso de livros, não teto. Passar dela continua valendo — mas o
    excedente sai do que sobrava para o resto, senão o ano fecharia com mais
    gasto do que orçamento.
  */
  it('livro além da reserva consome o orçamento geral', () => {
    const saldo = saldoDoAno(orcamento, [aquisicao({ itemId: 'livros', data: '2026-02-10', coberto: emCentavos(2500) })], catalogo, '2026')
    expect(saldo.saldoDeLivros).toBe(0)
    expect(saldo.saldoDeOutros).toBe(emCentavos(3500))
    expect(saldo.saldoTotal).toBe(emCentavos(3500))
  })

  it('avisa quando o ano estourou', () => {
    const saldo = saldoDoAno(orcamento, [aquisicao({ data: '2026-02-10', coberto: emCentavos(6500) })], catalogo, '2026')
    expect(saldo.estourado).toBe(true)
  })
})

describe('intervalo de renovação', () => {
  /*
    O intervalo conta da última aquisição, não do início do ano. Quem comprou em
    novembro de 2024 não recompra em janeiro de 2025 só porque virou o ano.
  */
  it('conta a partir da última aquisição', () => {
    const resultado = elegibilidadeDoItem(item(), [aquisicao({ data: '2024-11-20' })], '2025-01-05')
    expect(resultado.elegivel).toBe(false)
    expect(resultado.liberaEm).toBe('2028-11-20')
    expect(resultado.motivo).toContain('20/11/2024')
  })

  it('libera no dia calculado', () => {
    expect(elegibilidadeDoItem(item(), [aquisicao()], '2028-11-19').elegivel).toBe(false)
    expect(elegibilidadeDoItem(item(), [aquisicao()], '2028-11-20').elegivel).toBe(true)
  })

  it('sem aquisição anterior está livre', () => {
    expect(elegibilidadeDoItem(item(), [], '2026-01-01').elegivel).toBe(true)
  })

  it('item sem intervalo nunca bloqueia', () => {
    const livros = item({ id: 'livros', intervaloEmMeses: null })
    expect(elegibilidadeDoItem(livros, [aquisicao({ itemId: 'livros', data: '2026-08-01' })], '2026-08-02').elegivel).toBe(true)
  })

  it('o intervalo usa a aquisição mais recente, não a primeira', () => {
    const resultado = elegibilidadeDoItem(item(), [aquisicao({ data: '2020-01-10' }), aquisicao({ id: 'a2', data: '2025-06-15' })], '2026-01-01')
    expect(resultado.ultimaData).toBe('2025-06-15')
    expect(resultado.elegivel).toBe(false)
  })

  it('31 de janeiro mais um mês não vira 3 de março', () => {
    const mensal = item({ intervaloEmMeses: 1 })
    expect(elegibilidadeDoItem(mensal, [aquisicao({ data: '2026-01-31' })], '2026-02-28').liberaEm).toBe('2026-02-28')
  })
})

describe('avaliar compra', () => {
  const saldoCheio = saldoDoAno(orcamento, [], catalogo, '2026')

  /*
    A compra acima do limite acontece: o excedente é do pastor, e o registro
    existe. Recusar o registro só faria o gasto viver fora do aplicativo.
  */
  it('acima do limite, o excedente vira parcela pessoal', () => {
    const avaliacao = avaliarCompra(item(), emCentavos(4600), { data: '2026-03-01', aquisicoes: [], saldo: saldoCheio, contexto })
    expect(avaliacao.coberto).toBe(emCentavos(4000))
    expect(avaliacao.parcelaPessoal).toBe(emCentavos(600))
    expect(avaliacao.memoria.limitadoPeloTeto).toBe(true)
  })

  it('dentro do limite cobre tudo', () => {
    const avaliacao = avaliarCompra(item(), emCentavos(3200), { data: '2026-03-01', aquisicoes: [], saldo: saldoCheio, contexto })
    expect(avaliacao.coberto).toBe(emCentavos(3200))
    expect(avaliacao.parcelaPessoal).toBe(0)
    expect(avaliacao.impedimentos).toEqual([])
  })

  it('item bloqueado pelo intervalo não é coberto, e diz até quando', () => {
    const avaliacao = avaliarCompra(item(), emCentavos(3000), {
      data: '2026-03-01', aquisicoes: [aquisicao({ data: '2024-11-20' })], saldo: saldoCheio, contexto,
    })
    expect(avaliacao.coberto).toBe(0)
    expect(avaliacao.parcelaPessoal).toBe(emCentavos(3000))
    expect(avaliacao.impedimentos[0]).toContain('2028')
  })

  /*
    Cabe no limite do item e mesmo assim não cabe no ano — o caso que o saldo
    único esconderia.
  */
  it('o saldo do ano corta antes do limite do item', () => {
    const saldoQuaseGasto = saldoDoAno(orcamento, [aquisicao({ data: '2026-01-05', coberto: emCentavos(3800) })], catalogo, '2026')
    const avaliacao = avaliarCompra(item({ id: 'cadeira', intervaloEmMeses: null }), emCentavos(1000), {
      data: '2026-06-01', aquisicoes: [], saldo: saldoQuaseGasto, contexto,
    })
    expect(avaliacao.coberto).toBe(emCentavos(200))
    expect(avaliacao.parcelaPessoal).toBe(emCentavos(800))
    expect(avaliacao.limitadoPeloSaldo).toBe(true)
  })

  it('limite em percentual do FPE', () => {
    const porPercentual = item({ limite: null, limitePercentual: 50, limiteBase: 'FPE_INTEGRAL' })
    const avaliacao = avaliarCompra(porPercentual, emCentavos(4000), { data: '2026-03-01', aquisicoes: [], saldo: saldoCheio, contexto })
    expect(avaliacao.memoria.tetoAplicado).toBe(emCentavos(3500))
    expect(avaliacao.coberto).toBe(emCentavos(3500))
  })
})
