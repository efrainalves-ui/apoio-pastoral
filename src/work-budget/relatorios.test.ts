import { describe, expect, it } from 'vitest'
import { emCentavos } from '../family-budget/dinheiro'
import type { Contracheque } from './contracheque'
import { lancamentoVazio, type LancamentoDoTrabalho } from './lancamento'
import type { AquisicaoLetra, ItemDoCatalogoLetra } from './letra'
import {
  doBolsoPorFamilia, evolucao, noPeriodo, porFamilia, porSituacao,
  porSubcategoria, relatorioDoAno, ultimosMeses,
} from './relatorios'

let sequencia = 0
function lancamento(overrides: Partial<LancamentoDoTrabalho> = {}): LancamentoDoTrabalho {
  sequencia += 1
  return { id: `l${sequencia}`, ...lancamentoVazio('2026-09', '2026-09-03'), subcategoriaId: 'energia', ...overrides }
}

describe('recorte por período', () => {
  /*
    Pelo mês de referência, não pelo mês do gasto: a conta de agosto paga em
    setembro pertence a agosto, e é lá que ela precisa aparecer.
  */
  it('usa a competência, não a data', () => {
    const lancamentos = [
      lancamento({ data: '2026-09-03', competencia: '2026-08', valorPago: emCentavos(100) }),
      lancamento({ data: '2026-09-03', competencia: '2026-09', valorPago: emCentavos(200) }),
    ]
    expect(noPeriodo(lancamentos, { de: '2026-08', ate: '2026-08' })).toHaveLength(1)
    expect(noPeriodo(lancamentos, { de: '2026-08', ate: '2026-09' })).toHaveLength(2)
  })
})

describe('por categoria', () => {
  const lancamentos = [
    lancamento({ subcategoriaId: 'energia', valorPago: emCentavos(400) }),
    lancamento({ subcategoriaId: 'agua', valorPago: emCentavos(100) }),
    lancamento({ subcategoriaId: 'combustivel', valorPago: emCentavos(300) }),
  ]

  it('agrupa por família e ordena do maior para o menor', () => {
    const linhas = porFamilia(lancamentos)
    expect(linhas.map(({ nome }) => nome)).toEqual(['Moradia', 'Veículo'])
    expect(linhas[0]?.valor).toBe(emCentavos(500))
    expect(linhas[0]?.percentual).toBeCloseTo(62.5)
  })

  it('categoria desconhecida não some do relatório', () => {
    const linhas = porFamilia([lancamento({ subcategoriaId: 'inexistente', valorPago: emCentavos(50) })])
    expect(linhas[0]?.nome).toBe('Sem categoria')
  })

  it('a subcategoria sai com o nome completo', () => {
    expect(porSubcategoria(lancamentos)[0]?.nome).toBe('Moradia · Energia elétrica')
  })
})

describe('do bolso', () => {
  /*
    Diferente do pago: o pago inclui o que voltou. Esta é a conta que responde à
    pergunta que o módulo existe para responder.
  */
  it('conta só o que não voltou', () => {
    const linhas = doBolsoPorFamilia([
      lancamento({ subcategoriaId: 'energia', valorPago: emCentavos(400), recebido: emCentavos(120), situacao: 'recebido' }),
      lancamento({ subcategoriaId: 'combustivel', valorPago: emCentavos(300), recebido: emCentavos(300), situacao: 'recebido' }),
    ])
    expect(linhas).toHaveLength(1)
    expect(linhas[0]).toMatchObject({ nome: 'Moradia', valor: emCentavos(280), percentual: 100 })
  })
})

describe('por situação', () => {
  it('conta quantos e quanto em cada etapa', () => {
    const linhas = porSituacao([
      lancamento({ situacao: 'previsto', valorPago: emCentavos(100) }),
      lancamento({ situacao: 'previsto', valorPago: emCentavos(50) }),
      lancamento({ situacao: 'recebido', valorPago: emCentavos(400) }),
    ])
    expect(linhas.find(({ situacao }) => situacao === 'previsto')).toMatchObject({ quantidade: 2, valor: emCentavos(150) })
  })
})

describe('evolução', () => {
  it('devolve uma linha por mês pedido, mesmo sem lançamento', () => {
    const linha = evolucao([lancamento({ competencia: '2026-09', valorPago: emCentavos(400) })], ['2026-08', '2026-09'])
    expect(linha[0]).toMatchObject({ competencia: '2026-08', pago: 0 })
    expect(linha[1]).toMatchObject({ competencia: '2026-09', pago: emCentavos(400), doBolso: emCentavos(400) })
  })

  it('os últimos meses atravessam a virada do ano', () => {
    expect(ultimosMeses('2026-02', 4)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02'])
  })
})

describe('relatório do ano', () => {
  const contracheque = (competencia: string): Contracheque => ({
    id: `c-${competencia}`, competencia, dataDePagamento: '', origem: '', conferido: true,
    observacao: '', createdAt: '', updatedAt: '',
    rubricas: [
      { codigo: '001', descricao: '', tipo: 'provento', valor: emCentavos(5600), subcategoriaId: 'subsistencia_basica' },
      { codigo: '101', descricao: '', tipo: 'desconto', valor: emCentavos(600), subcategoriaId: '' },
      { codigo: '900', descricao: '', tipo: 'informativa', valor: emCentavos(5600), subcategoriaId: '' },
    ],
  })

  const itens: ItemDoCatalogoLetra[] = [
    { id: 'notebook', nome: 'Notebook', grupo: '', limite: null, limitePercentual: null, limiteBase: null, intervaloEmMeses: null, ehLivro: false, referencia: '', observacao: '' },
  ]
  const aquisicoes: AquisicaoLetra[] = [
    { id: 'a1', itemId: 'notebook', descricao: '', data: '2026-03-01', valor: emCentavos(4000), coberto: emCentavos(4000), parcelaPessoal: 0, memoria: null, observacao: '', createdAt: '', updatedAt: '' },
  ]

  /*
    O líquido da folha e o que passou pelo bolso são somas separadas de
    propósito: juntá-las diria que o pastor ganhou o que ele adiantou.
  */
  it('separa o que veio pela folha do que passou pelo bolso', () => {
    const relatorio = relatorioDoAno('2026', {
      lancamentos: [lancamento({ competencia: '2026-05', valorPago: emCentavos(400), recebido: emCentavos(120), situacao: 'recebido' })],
      contracheques: [contracheque('2026-05'), contracheque('2026-06'), contracheque('2025-12')],
      orcamentoLetra: { total: emCentavos(6000), reservaDeLivros: emCentavos(2000) },
      itensLetra: itens,
      aquisicoes,
    })
    expect(relatorio.pago).toBe(emCentavos(400))
    expect(relatorio.doBolso).toBe(emCentavos(280))
    // Dois contracheques de 2026; o de 2025 fica de fora.
    expect(relatorio.liquidoDaFolha).toBe(emCentavos(10000))
  })

  it('a base informativa é somada à parte também no ano', () => {
    const relatorio = relatorioDoAno('2026', {
      lancamentos: [], contracheques: [contracheque('2026-05')],
      orcamentoLetra: null, itensLetra: [], aquisicoes: [],
    })
    expect(relatorio.liquidoDaFolha).toBe(emCentavos(5000))
    expect(relatorio.basesInformativas).toBe(emCentavos(5600))
  })

  it('traz o saldo do LETRA do mesmo ano', () => {
    const relatorio = relatorioDoAno('2026', {
      lancamentos: [], contracheques: [],
      orcamentoLetra: { total: emCentavos(6000), reservaDeLivros: emCentavos(2000) },
      itensLetra: itens, aquisicoes,
    })
    expect(relatorio.letra.usadoEmOutros).toBe(emCentavos(4000))
    expect(relatorio.letra.saldoDeOutros).toBe(0)
  })

  it('ano sem nada não quebra', () => {
    expect(relatorioDoAno('2030', { lancamentos: [], contracheques: [], orcamentoLetra: null, itensLetra: [], aquisicoes: [] }))
      .toMatchObject({ pago: 0, doBolso: 0, liquidoDaFolha: 0 })
  })
})
