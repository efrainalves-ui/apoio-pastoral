import { describe, expect, it } from 'vitest'
import { emCentavos, somar } from '../family-budget/dinheiro'
import {
  aplicarRegra, emOrdem, faixaDeClimatizacao, ratearLimiteConjunto, resolverBase,
  subsistenciaBasica, vigenteEm, type ContextoDoCalculo, type RegraDeCalculo, type ValorComVigencia,
} from './parametros'

const FPE = emCentavos(7000)

function contexto(overrides: Partial<ContextoDoCalculo> = {}): ContextoDoCalculo {
  return { fpe: FPE, percentualDeAudit: 80, valorDaDespesa: 0, valorFixoLocal: 0, outraBase: 0, ...overrides }
}

function regra(overrides: Partial<RegraDeCalculo> = {}): RegraDeCalculo {
  return { percentual: null, base: 'VALOR_DA_DESPESA', teto: null, tetoPercentual: null, tetoBase: null, referencia: 'Teste', ...overrides }
}

const vigencia = <T>(valor: T, inicio: string, fim = ''): ValorComVigencia<T> => ({ valor, inicio, fim, referencia: '', observacao: '' })

describe('subsistência básica', () => {
  it('é o FPE vezes o Percentual de Audit', () => {
    expect(subsistenciaBasica(emCentavos(7000), 80)).toBe(emCentavos(5600))
    expect(subsistenciaBasica(emCentavos(7500), 76)).toBe(emCentavos(5700))
  })

  /*
    Nulo é uma resposta honesta: significa "ainda não configurado". Estimar o
    Percentual de Audit pelo valor de um contracheque erraria, porque
    complementos e antecipações distorcem o número.
  */
  it('sem parâmetro não inventa número', () => {
    expect(subsistenciaBasica(null, 80)).toBeNull()
    expect(subsistenciaBasica(emCentavos(7000), null)).toBeNull()
  })
})

describe('vigência', () => {
  const historico = [
    vigencia(emCentavos(6500), '2025-01-01', '2025-12-31'),
    vigencia(emCentavos(7000), '2026-01-01', '2026-06-30'),
    vigencia(emCentavos(7400), '2026-07-01'),
  ]

  /*
    Um lançamento de março usa o FPE de março, mesmo que o FPE mude em julho.
    Recalcular o passado em silêncio é o defeito que faz o pastor desconfiar do
    aplicativo inteiro.
  */
  it('devolve o valor que valia na data, e não o mais recente', () => {
    expect(vigenteEm(historico, '2026-03-15')?.valor).toBe(emCentavos(7000))
    expect(vigenteEm(historico, '2026-08-15')?.valor).toBe(emCentavos(7400))
    expect(vigenteEm(historico, '2025-06-01')?.valor).toBe(emCentavos(6500))
  })

  it('antes do primeiro registro não há valor', () => {
    expect(vigenteEm(historico, '2024-12-31')).toBeNull()
  })

  it('o histórico sai do mais recente para o mais antigo', () => {
    expect(emOrdem(historico).map(({ inicio }) => inicio)).toEqual(['2026-07-01', '2026-01-01', '2025-01-01'])
  })
})

describe('base de cálculo', () => {
  /*
    O erro que a base existe para impedir: com FPE de 7.000 e Audit de 80%, um
    teto de 10% do FPE é 700 — e não 560.
  */
  it('dez por cento do FPE não é dez por cento da subsistência', () => {
    const sobreFpe = aplicarRegra(regra({ percentual: 10, base: 'FPE_INTEGRAL' }), contexto())
    const sobreSubsistencia = aplicarRegra(regra({ percentual: 10, base: 'SUBSISTENCIA_BASICA' }), contexto())
    expect(sobreFpe.valor).toBe(emCentavos(700))
    expect(sobreSubsistencia.valor).toBe(emCentavos(560))
  })

  it('resolve cada base configurada', () => {
    const ctx = contexto({ valorDaDespesa: emCentavos(400), valorFixoLocal: emCentavos(150), outraBase: emCentavos(90) })
    expect(resolverBase('FPE_INTEGRAL', ctx)).toBe(FPE)
    expect(resolverBase('SUBSISTENCIA_BASICA', ctx)).toBe(emCentavos(5600))
    expect(resolverBase('VALOR_DA_DESPESA', ctx)).toBe(emCentavos(400))
    expect(resolverBase('VALOR_FIXO_LOCAL', ctx)).toBe(emCentavos(150))
    expect(resolverBase('OUTRA_BASE_CONFIGURAVEL', ctx)).toBe(emCentavos(90))
  })

  it('sem FPE a regra fica pendente em vez de render zero silencioso', () => {
    const memoria = aplicarRegra(regra({ percentual: 10, base: 'FPE_INTEGRAL' }), contexto({ fpe: null, valorDaDespesa: emCentavos(300) }))
    expect(memoria.valor).toBe(0)
    expect(memoria.pendencia).toContain('não configurado')
    expect(memoria.parcelaPessoal).toBe(emCentavos(300))
  })
})

describe('regras com teto', () => {
  it('reembolsa o percentual da despesa e deixa o resto com o pastor', () => {
    const memoria = aplicarRegra(
      regra({ percentual: 75, base: 'VALOR_DA_DESPESA', referencia: 'REA Y 20 15' }),
      contexto({ valorDaDespesa: emCentavos(138) }),
    )
    expect(memoria.valor).toBe(emCentavos(103.5))
    expect(memoria.parcelaPessoal).toBe(emCentavos(34.5))
    expect(memoria.limitadoPeloTeto).toBe(false)
  })

  it('o teto corta e a memória diz que cortou', () => {
    const memoria = aplicarRegra(
      regra({ percentual: 100, base: 'VALOR_DA_DESPESA', teto: emCentavos(150) }),
      contexto({ valorDaDespesa: emCentavos(180) }),
    )
    expect(memoria.valor).toBe(emCentavos(150))
    expect(memoria.parcelaPessoal).toBe(emCentavos(30))
    expect(memoria.limitadoPeloTeto).toBe(true)
  })

  it('teto expresso em percentual do FPE', () => {
    const memoria = aplicarRegra(
      regra({ percentual: 100, base: 'VALOR_DA_DESPESA', tetoPercentual: 10, tetoBase: 'FPE_INTEGRAL' }),
      contexto({ valorDaDespesa: emCentavos(900) }),
    )
    expect(memoria.tetoAplicado).toBe(emCentavos(700))
    expect(memoria.valor).toBe(emCentavos(700))
  })

  /*
    Quando o FPE mudar, é a memória que explica por que o reembolso de março foi
    aquele. Sem ela, o pastor abre um lançamento antigo e vê um número que não
    bate com nenhum parâmetro atual.
  */
  it('a memória guarda o que foi usado', () => {
    const memoria = aplicarRegra(regra({ percentual: 30, base: 'VALOR_DA_DESPESA', referencia: 'Regra local de energia' }), contexto({ valorDaDespesa: emCentavos(400) }))
    expect(memoria).toMatchObject({
      fpeUtilizado: FPE, percentualDeAuditUtilizado: 80,
      base: 'VALOR_DA_DESPESA', percentualAplicado: 30, referencia: 'Regra local de energia',
    })
  })
})

describe('energia com reembolso local de 30%', () => {
  it('conta de 400 rende 120 de reembolso e 280 pessoais', () => {
    const memoria = aplicarRegra(
      regra({ percentual: 30, base: 'VALOR_DA_DESPESA', referencia: 'Condição local: poço, sem conta de água' }),
      contexto({ valorDaDespesa: emCentavos(400) }),
    )
    expect(memoria.valor).toBe(emCentavos(120))
    expect(memoria.parcelaPessoal).toBe(emCentavos(280))
  })
})

describe('faixa de climatização', () => {
  /*
    Não é percentual simples: cobre 75% da parte do gasto entre 6% e 17% do FPE.
    Aplicar 75% sobre o gasto inteiro daria um número bem maior e errado.
  */
  it('cobre só a parte que cai dentro da faixa', () => {
    // 6% de 7.000 = 420; 17% = 1.190. Gasto de 1.000 → faixa de 580 → 75% = 435.
    const memoria = faixaDeClimatizacao(emCentavos(1000), FPE)
    expect(memoria.valor).toBe(emCentavos(435))
    expect(memoria.parcelaPessoal).toBe(emCentavos(565))
  })

  it('gasto abaixo do piso não gera reembolso', () => {
    expect(faixaDeClimatizacao(emCentavos(300), FPE).valor).toBe(0)
  })

  it('o que passa do teto da faixa fica de fora', () => {
    const memoria = faixaDeClimatizacao(emCentavos(2000), FPE)
    // (1.190 − 420) × 75% = 577,50
    expect(memoria.valor).toBe(emCentavos(577.5))
    expect(memoria.limitadoPeloTeto).toBe(true)
  })

  it('sem FPE fica pendente', () => {
    expect(faixaDeClimatizacao(emCentavos(1000), null).pendencia).toContain('não configurado')
  })
})

describe('limite conjunto', () => {
  /*
    Internet e telefone com teto conjunto de 150 rendem 150 no total — não 150
    para cada. O limite se consome uma vez só.
  */
  it('dentro do teto, cada um recebe o que gastou', () => {
    const rateio = ratearLimiteConjunto(
      [{ chave: 'internet', valor: emCentavos(99) }, { chave: 'telefone', valor: emCentavos(51) }],
      emCentavos(150),
    )
    expect(rateio).toEqual([
      { chave: 'internet', coberto: emCentavos(99), pessoal: 0 },
      { chave: 'telefone', coberto: emCentavos(51), pessoal: 0 },
    ])
  })

  it('acima do teto, o excedente vira parcela pessoal', () => {
    const rateio = ratearLimiteConjunto(
      [{ chave: 'internet', valor: emCentavos(120) }, { chave: 'telefone', valor: emCentavos(60) }],
      emCentavos(150),
    )
    expect(somar(rateio.map(({ coberto }) => coberto))).toBe(emCentavos(150))
    expect(somar(rateio.map(({ pessoal }) => pessoal))).toBe(emCentavos(30))
  })

  it('o rateio fecha até o centavo, mesmo com divisão quebrada', () => {
    const rateio = ratearLimiteConjunto(
      [{ chave: 'a', valor: emCentavos(100) }, { chave: 'b', valor: emCentavos(100) }, { chave: 'c', valor: emCentavos(100) }],
      emCentavos(100),
    )
    expect(somar(rateio.map(({ coberto }) => coberto))).toBe(emCentavos(100))
  })
})
