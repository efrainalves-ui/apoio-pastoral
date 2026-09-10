import { describe, expect, it } from 'vitest'
import {
  daCompetencia, doMes, fixasEVariaveis, mesesEntre, paraOndeFoi, parcelasDaSerie,
  planejadoVersusRealizado, progressoDaMeta, rendaPorIntegrante, resumoDoMes, taxaDeEconomia, vencimentos,
} from './calculos'
import { emCentavos } from './dinheiro'
import type { Lancamento } from './lancamento'

const HOJE = '2026-09-10'

function lancamento(overrides: Partial<Lancamento> = {}): Lancamento {
  return {
    id: crypto.randomUUID(), natureza: 'saida', descricao: 'Lançamento fictício', valor: emCentavos(100),
    subcategoria: 'alimentacao.supermercado', data: '2026-09-05', competencia: '2026-09', vencimento: '2026-09-05',
    situacao: 'paga', tipo: 'variavel', formaDePagamento: 'pix', contaId: null, cartaoId: null,
    integranteId: null, referenteA: null, recorrencia: 'nenhuma', serieId: null, parcelamento: null,
    observacao: '', createdAt: '2026-09-05T10:00:00.000Z', updatedAt: '2026-09-05T10:00:00.000Z', ...overrides,
  }
}

const entrada = (overrides: Partial<Lancamento> = {}) =>
  lancamento({ natureza: 'entrada', subcategoria: 'remuneracao.salario', situacao: 'recebida', ...overrides })

describe('resumo do mês', () => {
  it('separa o que aconteceu do que ainda vai acontecer', () => {
    const resumo = resumoDoMes([
      entrada({ valor: emCentavos(5000) }),
      entrada({ valor: emCentavos(1200), situacao: 'prevista' }),
      lancamento({ valor: emCentavos(800), situacao: 'paga' }),
      lancamento({ valor: emCentavos(450), situacao: 'pendente' }),
    ])

    expect(resumo.recebido).toBe(emCentavos(5000))
    expect(resumo.aReceber).toBe(emCentavos(1200))
    expect(resumo.pago).toBe(emCentavos(800))
    expect(resumo.comprometido).toBe(emCentavos(450))
    expect(resumo.saldo).toBe(emCentavos(4200))
    expect(resumo.livre).toBe(emCentavos(3750))
  })

  /*
    Saldo e livre respondem perguntas diferentes: um diz o que aconteceu, o
    outro diz com quanto ainda se pode contar. Mostrar só o saldo é o que faz a
    família gastar dinheiro que já tem dono.
  */
  it('livre desconta o que ainda está comprometido; saldo não', () => {
    const resumo = resumoDoMes([entrada({ valor: emCentavos(3000) }), lancamento({ valor: emCentavos(1200), situacao: 'pendente' })])
    expect(resumo.saldo).toBe(emCentavos(3000))
    expect(resumo.livre).toBe(emCentavos(1800))
  })

  it('mês sem nada devolve zero em tudo', () => {
    expect(resumoDoMes([])).toEqual({ recebido: 0, aReceber: 0, pago: 0, comprometido: 0, saldo: 0, livre: 0 })
  })
})

describe('renda por integrante', () => {
  it('soma por pessoa e guarda a família em separado', () => {
    const mapa = rendaPorIntegrante([
      entrada({ valor: emCentavos(4000), integranteId: 'p1' }),
      entrada({ valor: emCentavos(1500), integranteId: 'p2' }),
      entrada({ valor: emCentavos(300), integranteId: null }),
      entrada({ valor: emCentavos(900), integranteId: 'p1', situacao: 'prevista' }),
    ])
    expect(mapa.get('p1')).toBe(emCentavos(4000))
    expect(mapa.get('p2')).toBe(emCentavos(1500))
    expect(mapa.get(null)).toBe(emCentavos(300))
  })
})

describe('para onde o dinheiro foi', () => {
  it('agrupa por categoria, da maior para a menor, com percentual', () => {
    const fatias = paraOndeFoi([
      lancamento({ valor: emCentavos(600), subcategoria: 'alimentacao.supermercado' }),
      lancamento({ valor: emCentavos(200), subcategoria: 'alimentacao.feira' }),
      lancamento({ valor: emCentavos(1200), subcategoria: 'moradia.aluguel' }),
      lancamento({ valor: emCentavos(500), subcategoria: 'moradia.aluguel', situacao: 'pendente' }),
    ])
    expect(fatias.map(({ nome }) => nome)).toEqual(['Moradia', 'Alimentação'])
    expect(fatias[0]!.valor).toBe(emCentavos(1200))
    expect(fatias[1]!.valor).toBe(emCentavos(800))
    expect(fatias[0]!.percentual).toBe(60)
  })
})

describe('fixas e variáveis', () => {
  it('separa e diz o peso das fixas', () => {
    const resultado = fixasEVariaveis([
      lancamento({ valor: emCentavos(1500), tipo: 'fixa' }),
      lancamento({ valor: emCentavos(500), tipo: 'variavel' }),
    ])
    expect(resultado).toEqual({ fixas: emCentavos(1500), variaveis: emCentavos(500), percentualFixas: 75 })
  })
})

describe('taxa de economia', () => {
  it('calcula sobre o que entrou', () => {
    expect(taxaDeEconomia(resumoDoMes([entrada({ valor: emCentavos(5000) }), lancamento({ valor: emCentavos(4000) })]))).toBe(20)
  })

  it('mês sem entrada não vira divisão por zero', () => {
    expect(taxaDeEconomia(resumoDoMes([lancamento({ valor: emCentavos(400) })]))).toBe(0)
  })
})

describe('vencimentos', () => {
  it('põe o atrasado antes do que ainda vai vencer', () => {
    const lista = vencimentos([
      lancamento({ descricao: 'Internet', situacao: 'pendente', vencimento: '2026-09-12' }),
      lancamento({ descricao: 'Energia', situacao: 'pendente', vencimento: '2026-09-03' }),
      lancamento({ descricao: 'Escola', situacao: 'pendente', vencimento: '2026-09-10' }),
      lancamento({ descricao: 'Paga', situacao: 'paga', vencimento: '2026-09-01' }),
    ], HOJE)

    expect(lista.map(({ lancamento: item }) => item.descricao)).toEqual(['Energia', 'Escola', 'Internet'])
    expect(lista[0]).toMatchObject({ situacao: 'atrasada', dias: -7 })
    expect(lista[1]).toMatchObject({ situacao: 'pendente', dias: 0 })
    expect(lista[2]).toMatchObject({ situacao: 'pendente', dias: 2 })
  })

  it('o que já foi pago não vence', () => {
    expect(vencimentos([lancamento({ situacao: 'paga', vencimento: '2026-01-01' })], HOJE)).toHaveLength(0)
  })
})

describe('planejado x realizado', () => {
  it('mostra o estouro passando de cem por cento', () => {
    const linhas = planejadoVersusRealizado(
      [lancamento({ valor: emCentavos(1430), subcategoria: 'alimentacao.supermercado' })],
      { alimentacao: emCentavos(1200), transporte: emCentavos(800) },
    )
    const alimentacao = linhas.find(({ categoria }) => categoria === 'alimentacao')
    expect(alimentacao).toMatchObject({ planejado: emCentavos(1200), realizado: emCentavos(1430) })
    expect(alimentacao!.percentual).toBeGreaterThan(100)
    // Categoria planejada e não usada continua na lista, com zero.
    expect(linhas.find(({ categoria }) => categoria === 'transporte')?.realizado).toBe(0)
  })

  it('categoria gasta sem planejamento também aparece', () => {
    const linhas = planejadoVersusRealizado([lancamento({ valor: emCentavos(300), subcategoria: 'lazer.delivery' })], {})
    expect(linhas.find(({ categoria }) => categoria === 'lazer')?.planejado).toBe(0)
  })
})

describe('progresso da meta', () => {
  it('diz quanto falta e quanto guardar por mês', () => {
    const progresso = progressoDaMeta(emCentavos(12_000), emCentavos(3200), '2027-07', HOJE)
    expect(progresso.falta).toBe(emCentavos(8800))
    expect(progresso.mesesRestantes).toBe(10)
    expect(progresso.porMes).toBe(emCentavos(880))
    expect(progresso.percentual).toBeCloseTo(26.7, 1)
  })

  it('meta já alcançada não devolve falta negativa', () => {
    expect(progressoDaMeta(emCentavos(1000), emCentavos(1500), null, HOJE).falta).toBe(0)
  })

  it('prazo vencido não vira contribuição negativa', () => {
    expect(progressoDaMeta(emCentavos(1000), 0, '2026-01', HOJE).porMes).toBeNull()
  })
})

describe('parcelas', () => {
  /*
    A dívida que começou antes do aplicativo: 24 parcelas no total, 13 já pagas
    lá atrás, 11 restantes. Não dá para obrigar a cadastrar as treze primeiras.
  */
  it('aguenta a série que começou fora do aplicativo', () => {
    const serie = Array.from({ length: 11 }, (_, indice) => lancamento({
      valor: emCentavos(400), situacao: 'pendente',
      parcelamento: { total: 24, numero: 14 + indice, serie: 's1' },
    }))
    expect(parcelasDaSerie(serie)).toEqual({
      total: 24, pagas: 0, restantes: 24, valorDaParcela: emCentavos(400), saldo: emCentavos(9600),
    })
  })

  it('conta as pagas da própria série', () => {
    const serie = [
      lancamento({ valor: emCentavos(400), situacao: 'paga', parcelamento: { total: 12, numero: 1, serie: 's2' } }),
      lancamento({ valor: emCentavos(400), situacao: 'paga', parcelamento: { total: 12, numero: 2, serie: 's2' } }),
      lancamento({ valor: emCentavos(400), situacao: 'pendente', parcelamento: { total: 12, numero: 3, serie: 's2' } }),
    ]
    expect(parcelasDaSerie(serie)).toMatchObject({ total: 12, pagas: 2, restantes: 10, saldo: emCentavos(4000) })
  })

  it('sem parcelamento não devolve série', () => {
    expect(parcelasDaSerie([lancamento()])).toBeNull()
  })
})

describe('mês e competência', () => {
  /*
    Salário de agosto recebido em setembro: a data é de setembro, a competência
    é de agosto. Sem isso o relatório de agosto mostra a casa sem renda.
  */
  it('são recortes diferentes do mesmo lançamento', () => {
    const salario = entrada({ data: '2026-09-05', competencia: '2026-08' })
    expect(doMes([salario], '2026-09')).toHaveLength(1)
    expect(doMes([salario], '2026-08')).toHaveLength(0)
    expect(daCompetencia([salario], '2026-08')).toHaveLength(1)
    expect(daCompetencia([salario], '2026-09')).toHaveLength(0)
  })
})

describe('meses entre', () => {
  it('atravessa o ano', () => {
    expect(mesesEntre('2026-09', '2027-07')).toBe(10)
    expect(mesesEntre('2026-09', '2026-09')).toBe(0)
    expect(mesesEntre('2026-09', '2026-01')).toBe(-8)
  })
})
