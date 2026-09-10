import { describe, expect, it } from 'vitest'
import { CATEGORIAS_DE_SAIDA } from '../family-budget/catalogo'
import { emCentavos } from '../family-budget/dinheiro'
import { doBolsoPorCompetencia, espelhoPessoal, SUBCATEGORIA_DO_MINISTERIO } from './integracao'
import { lancamentoVazio, type LancamentoDoTrabalhoData } from './lancamento'

function lancamento(overrides: Partial<LancamentoDoTrabalhoData> = {}): LancamentoDoTrabalhoData {
  return { ...lancamentoVazio('2026-09', '2026-09-03'), subcategoriaId: 'energia', ...overrides }
}

describe('espelho no orçamento pessoal', () => {
  /*
    Uma conta de 400 com 120 de reembolso pesou 280 no bolso. Lançar 400 na
    família contaria de novo o que a instituição devolveu, e o orçamento
    doméstico fecharia com uma despesa que não houve.
  */
  it('atravessa só a parcela pessoal, nunca o valor pago inteiro', () => {
    const espelho = espelhoPessoal(lancamento({ valorPago: emCentavos(400), recebido: emCentavos(120), situacao: 'recebido' }))
    expect(espelho.acao).toBe('criar')
    expect(espelho.dados?.valor).toBe(emCentavos(280))
  })

  it('a subcategoria de destino existe no catálogo da família', () => {
    const codigos = CATEGORIAS_DE_SAIDA.flatMap((categoria) => categoria.subcategorias.map(({ codigo }) => codigo))
    expect(codigos).toContain(SUBCATEGORIA_DO_MINISTERIO)
  })

  it('entra como paga, e não como conta a vencer', () => {
    const espelho = espelhoPessoal(lancamento({ valorPago: emCentavos(400), situacao: 'solicitado' }))
    expect(espelho.dados).toMatchObject({ natureza: 'saida', situacao: 'paga', recorrencia: 'nenhuma', parcelamento: null })
  })

  /*
    Quando o reembolso cai, a parcela pessoal encolhe. O lançamento da família é
    corrigido — somar de novo dobraria a despesa do mês.
  */
  it('já espelhado, atualiza em vez de criar outro', () => {
    const espelho = espelhoPessoal(lancamento({
      valorPago: emCentavos(400), recebido: emCentavos(120), situacao: 'recebido',
      lancamentoPessoalId: 'pessoal-1',
    }))
    expect(espelho.acao).toBe('atualizar')
    expect(espelho.id).toBe('pessoal-1')
    expect(espelho.dados?.valor).toBe(emCentavos(280))
  })

  /*
    Reembolso integral que chega depois deixa o pastor sem parcela pessoal
    nenhuma: o lançamento antigo da família precisa sair, não ficar valendo por
    inércia.
  */
  it('reembolso integral remove o espelho que existia', () => {
    const espelho = espelhoPessoal(lancamento({
      valorPago: emCentavos(400), recebido: emCentavos(400), situacao: 'recebido',
      lancamentoPessoalId: 'pessoal-1',
    }))
    expect(espelho.acao).toBe('remover')
    expect(espelho.id).toBe('pessoal-1')
    expect(espelho.dados).toBeNull()
  })

  it('sem parcela pessoal e sem espelho, não faz nada', () => {
    const espelho = espelhoPessoal(lancamento({ valorPago: emCentavos(400), recebido: emCentavos(400), situacao: 'recebido' }))
    expect(espelho.acao).toBe('nada')
    expect(espelho.dados).toBeNull()
  })

  /*
    Negado é o caso em que tudo pesa no bolso, mesmo tendo havido pedido.
  */
  it('lançamento negado atravessa inteiro', () => {
    expect(espelhoPessoal(lancamento({ valorPago: emCentavos(400), previsto: emCentavos(120), situacao: 'negado' })).dados?.valor).toBe(emCentavos(400))
  })

  it('sem descrição, usa o nome da categoria', () => {
    const espelho = espelhoPessoal(lancamento({ valorPago: emCentavos(400), descricao: '' }))
    expect(espelho.dados?.descricao).toContain('Energia elétrica')
  })

  it('a competência do lançamento é preservada', () => {
    const espelho = espelhoPessoal(lancamento({ valorPago: emCentavos(400), data: '2026-09-03', competencia: '2026-08' }))
    expect(espelho.dados).toMatchObject({ data: '2026-09-03', competencia: '2026-08' })
  })
})

describe('do bolso por competência', () => {
  it('agrupa pelo mês de referência, não pelo mês do gasto', () => {
    const porMes = doBolsoPorCompetencia([
      lancamento({ valorPago: emCentavos(400), data: '2026-09-03', competencia: '2026-08' }),
      lancamento({ valorPago: emCentavos(100), competencia: '2026-09' }),
      lancamento({ valorPago: emCentavos(50), competencia: '2026-09' }),
    ])
    expect(porMes.get('2026-08')).toBe(emCentavos(400))
    expect(porMes.get('2026-09')).toBe(emCentavos(150))
  })

  it('o que foi reembolsado por inteiro não entra', () => {
    const porMes = doBolsoPorCompetencia([lancamento({ valorPago: emCentavos(400), recebido: emCentavos(400), situacao: 'recebido' })])
    expect(porMes.size).toBe(0)
  })
})
