import { describe, expect, it } from 'vitest'
import { emCentavos } from '../family-budget/dinheiro'
import { acharSubcategoria, itensDoLimiteConjunto, nomeCompleto } from './catalogo'
import {
  baseDoCalculo, calcularPrevisto, diferencaDoRecebimento, lancamentoVazio,
  parcelaPessoal, resumoDoTrabalho, type LancamentoDoTrabalhoData,
} from './lancamento'

const contexto = { fpe: emCentavos(7000), percentualDeAudit: 80, valorFixoLocal: 0, outraBase: 0 }

function lancamento(overrides: Partial<LancamentoDoTrabalhoData> = {}): LancamentoDoTrabalhoData {
  return { ...lancamentoVazio('2026-09', '2026-09-03'), ...overrides }
}

describe('catálogo', () => {
  it('encontra a subcategoria e o nome completo', () => {
    expect(acharSubcategoria('energia')?.familia.nome).toBe('Moradia')
    expect(nomeCompleto('energia')).toBe('Moradia · Energia elétrica')
  })

  it('id desconhecido não quebra a tela', () => {
    expect(acharSubcategoria('inexistente')).toBeNull()
    expect(nomeCompleto('inexistente')).toBe('inexistente')
  })

  /*
    Internet e telefone dividem um teto só. Se um dia deixarem de compartilhar a
    chave, o limite conjunto passa a ser concedido duas vezes sem ninguém notar.
  */
  it('internet e telefone dividem o mesmo limite', () => {
    expect(itensDoLimiteConjunto('comunicacao').map(({ id }) => id)).toEqual(['internet', 'telefone'])
  })

  it('sem chave não há limite conjunto', () => {
    expect(itensDoLimiteConjunto('')).toEqual([])
  })
})

describe('base elegível', () => {
  /*
    Uma nota de mercado com combustível e compras pessoais entra inteira como
    paga, mas só o combustível é base elegível.
  */
  it('o recorte elegível manda quando existe', () => {
    expect(baseDoCalculo({ valorPago: emCentavos(300), baseElegivel: emCentavos(120) })).toBe(emCentavos(120))
    expect(baseDoCalculo({ valorPago: emCentavos(300), baseElegivel: 0 })).toBe(emCentavos(300))
  })

  it('o previsto sai do recorte, não do total pago', () => {
    const memoria = calcularPrevisto(
      { valorPago: emCentavos(300), baseElegivel: emCentavos(120) },
      { percentual: 100, base: 'VALOR_DA_DESPESA', teto: null, tetoPercentual: null, tetoBase: null, referencia: '' },
      contexto,
    )
    expect(memoria.valor).toBe(emCentavos(120))
  })
})

describe('parcela pessoal', () => {
  /*
    Enquanto o dinheiro não entra, o valor inteiro está fora do bolso do pastor.
    Descontar o previsto antes da hora mostraria uma folga que não existe.
  */
  it('antes de receber, tudo está fora do bolso', () => {
    expect(parcelaPessoal(lancamento({ valorPago: emCentavos(200), previsto: emCentavos(150), situacao: 'solicitado' }))).toBe(emCentavos(200))
  })

  it('depois de receber, sobra a diferença', () => {
    expect(parcelaPessoal(lancamento({ valorPago: emCentavos(200), recebido: emCentavos(150), situacao: 'recebido' }))).toBe(emCentavos(50))
  })

  it('negado devolve o valor inteiro ao bolso', () => {
    expect(parcelaPessoal(lancamento({ valorPago: emCentavos(200), previsto: emCentavos(150), situacao: 'negado' }))).toBe(emCentavos(200))
  })

  it('recebeu mais do que pagou não vira parcela negativa', () => {
    expect(parcelaPessoal(lancamento({ valorPago: emCentavos(100), recebido: emCentavos(140), situacao: 'recebido' }))).toBe(0)
  })
})

describe('diferença do recebimento', () => {
  it('mostra quanto veio a menos', () => {
    expect(diferencaDoRecebimento({ aprovado: emCentavos(150), recebido: emCentavos(120) })).toBe(emCentavos(-30))
  })

  it('sem os dois números não arbitra diferença', () => {
    expect(diferencaDoRecebimento({ aprovado: emCentavos(150), recebido: null })).toBeNull()
    expect(diferencaDoRecebimento({ aprovado: null, recebido: emCentavos(150) })).toBeNull()
  })
})

describe('resumo do mês', () => {
  const lancamentos = [
    lancamento({ valorPago: emCentavos(400), previsto: emCentavos(120), solicitado: emCentavos(120), aprovado: emCentavos(120), recebido: emCentavos(120), situacao: 'recebido' }),
    lancamento({ valorPago: emCentavos(200), previsto: emCentavos(200), solicitado: emCentavos(200), aprovado: emCentavos(180), recebido: null, situacao: 'aprovado' }),
    lancamento({ valorPago: emCentavos(90), previsto: emCentavos(90), situacao: 'previsto' }),
  ]

  it('soma cada etapa do ciclo separadamente', () => {
    const resumo = resumoDoTrabalho(lancamentos)
    expect(resumo.pago).toBe(emCentavos(690))
    expect(resumo.previsto).toBe(emCentavos(410))
    expect(resumo.aprovado).toBe(emCentavos(300))
    expect(resumo.recebido).toBe(emCentavos(120))
  })

  /*
    Previsto que ninguém solicitou não é crédito contra a instituição. Somá-lo
    em "a receber" faria o pastor contar com dinheiro que não foi pedido.
  */
  it('a receber conta só o que já foi pedido', () => {
    expect(resumoDoTrabalho(lancamentos).aReceber).toBe(emCentavos(180))
  })

  it('do bolso soma o que ainda não voltou', () => {
    // 400 − 120 recebidos = 280; 200 inteiros; 90 inteiros.
    expect(resumoDoTrabalho(lancamentos).doBolso).toBe(emCentavos(570))
  })

  it('conta os pendentes', () => {
    expect(resumoDoTrabalho(lancamentos).pendentes).toBe(2)
  })

  it('mês sem lançamento não quebra', () => {
    expect(resumoDoTrabalho([])).toMatchObject({ pago: 0, aReceber: 0, doBolso: 0, pendentes: 0 })
  })
})
