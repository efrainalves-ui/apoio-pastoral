import { describe, expect, it } from 'vitest'
import { emCentavos } from './dinheiro'
import { alertasDoOrcamento, compararMeses, evolucao, insightsDoMes, ultimosMeses, variacao } from './insights'
import type { Lancamento } from './lancamento'

function lancamento(overrides: Partial<Lancamento> = {}): Lancamento {
  return {
    id: crypto.randomUUID(), natureza: 'saida', descricao: 'Fictício', valor: emCentavos(100),
    subcategoria: 'alimentacao.supermercado', data: '2026-09-05', competencia: '2026-09',
    vencimento: '2026-09-05', situacao: 'paga', tipo: 'variavel', formaDePagamento: 'pix',
    contaId: null, cartaoId: null, integranteId: null, referenteA: null, recorrencia: 'nenhuma',
    serieId: null, parcelamento: null, descontadoNaFonte: false, observacao: '',
    createdAt: '2026-09-05T10:00:00.000Z', updatedAt: '2026-09-05T10:00:00.000Z', ...overrides,
  }
}

const entrada = (valor: number, data = '2026-09-05') =>
  lancamento({ natureza: 'entrada', subcategoria: 'remuneracao.salario', situacao: 'recebida', valor: emCentavos(valor), data })

describe('variação', () => {
  it('mede a mudança entre dois valores', () => {
    expect(variacao(emCentavos(1000), emCentavos(1120))).toBe(12)
    expect(variacao(emCentavos(1000), emCentavos(920))).toBe(-8)
  })

  /*
    Sem base não há variação. "Subiu 100%" porque no mês passado não havia nada
    é ruído com cara de informação.
  */
  it('sem base anterior não inventa percentual', () => {
    expect(variacao(0, emCentavos(500))).toBeNull()
  })
})

describe('comparação entre meses', () => {
  it('compara entradas, saídas e economia', () => {
    const comparacao = compararMeses(
      [entrada(5000), lancamento({ valor: emCentavos(3000) })],
      [entrada(5000, '2026-08-05'), lancamento({ valor: emCentavos(2500), data: '2026-08-05' })],
    )
    expect(comparacao.entradas).toMatchObject({ atual: emCentavos(5000), variacao: 0 })
    expect(comparacao.saidas).toMatchObject({ atual: emCentavos(3000), variacao: 20 })
    expect(comparacao.economia.atual).toBe(emCentavos(2000))
  })
})

describe('insights', () => {
  it('sem mês anterior não gera nenhum', () => {
    expect(insightsDoMes([entrada(5000), lancamento()], [])).toEqual([])
  })

  it('conta o que subiu e o que caiu', () => {
    const atuais = [
      lancamento({ valor: emCentavos(1430), subcategoria: 'alimentacao.supermercado' }),
      lancamento({ valor: emCentavos(620), subcategoria: 'transporte.combustivel' }),
    ]
    const anteriores = [
      lancamento({ valor: emCentavos(1200), subcategoria: 'alimentacao.supermercado', data: '2026-08-05' }),
      lancamento({ valor: emCentavos(800), subcategoria: 'transporte.combustivel', data: '2026-08-05' }),
    ]

    const insights = insightsDoMes(atuais, anteriores)
    expect(insights.some(({ texto }) => texto.includes('Alimentação') && texto.includes('subiu'))).toBe(true)
    expect(insights.some(({ texto }) => texto.includes('Transporte') && texto.includes('caiu'))).toBe(true)
  })

  /*
    Variação de menos de cinco por cento é oscilação normal de uma casa. Avisar
    sobre ela faz o que importa desaparecer no meio do ruído.
  */
  it('ignora oscilação pequena', () => {
    const atuais = [lancamento({ valor: emCentavos(1020) })]
    const anteriores = [lancamento({ valor: emCentavos(1000), data: '2026-08-05' })]
    expect(insightsDoMes(atuais, anteriores)).toHaveLength(0)
  })

  it('não passa de quatro frases', () => {
    const categorias = ['alimentacao.supermercado', 'transporte.combustivel', 'saude.farmacia', 'lazer.delivery', 'moradia.agua']
    const atuais = categorias.map((subcategoria) => lancamento({ subcategoria, valor: emCentavos(500) }))
    const anteriores = categorias.map((subcategoria) => lancamento({ subcategoria, valor: emCentavos(100), data: '2026-08-05' }))
    expect(insightsDoMes(atuais, anteriores).length).toBeLessThanOrEqual(4)
  })
})

describe('alertas do orçamento', () => {
  it('avisa quando chega perto e quando passa', () => {
    const alertas = alertasDoOrcamento(
      [
        lancamento({ valor: emCentavos(1430), subcategoria: 'alimentacao.supermercado' }),
        lancamento({ valor: emCentavos(680), subcategoria: 'transporte.combustivel' }),
      ],
      { alimentacao: emCentavos(1200), transporte: emCentavos(800) },
    )

    expect(alertas[0]).toMatchObject({ chave: 'alimentacao', grave: true })
    expect(alertas[0]!.texto).toContain('passou do planejado')
    expect(alertas[1]).toMatchObject({ chave: 'transporte', grave: false })
    expect(alertas[1]!.texto).toContain('85%')
  })

  it('categoria dentro do planejado não vira aviso', () => {
    expect(alertasDoOrcamento([lancamento({ valor: emCentavos(400) })], { alimentacao: emCentavos(1200) })).toHaveLength(0)
  })

  it('categoria sem limite não vira aviso', () => {
    expect(alertasDoOrcamento([lancamento({ valor: emCentavos(9999) })], {})).toHaveLength(0)
  })
})

describe('evolução', () => {
  it('devolve um ponto por mês pedido, mesmo vazio', () => {
    const pontos = evolucao(
      [entrada(5000, '2026-09-05'), lancamento({ valor: emCentavos(3000), data: '2026-09-05' })],
      ['2026-07', '2026-08', '2026-09'],
    )
    expect(pontos).toHaveLength(3)
    expect(pontos[0]).toMatchObject({ mes: '2026-07', entradas: 0, saidas: 0 })
    expect(pontos[2]).toMatchObject({ mes: '2026-09', entradas: emCentavos(5000), economia: emCentavos(2000) })
  })

  it('os últimos meses atravessam a virada do ano', () => {
    expect(ultimosMeses('2027-01', 3)).toEqual(['2026-11', '2026-12', '2027-01'])
    expect(ultimosMeses('2026-09', 6)).toHaveLength(6)
  })
})
