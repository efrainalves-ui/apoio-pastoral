import { describe, expect, it } from 'vitest'
import { emCentavos } from './dinheiro'
import type { Cartao, Conta, Lancamento, Transferencia } from './lancamento'
import type { Aporte, Meta } from './metas'
import {
  fluxoFuturo, limitesDoPeriodo, noPeriodo, patrimonio, relatorioDeDividas,
  relatorioDeEntradas, relatorioDeMetas, relatorioDeSaidas, relatorioFamiliar,
} from './relatorios'

const HOJE = '2026-09-10'
const carimbos = { createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' }
const nomes = (id: string | null) => id === 'p1' ? 'Pessoa 1' : id === 'p2' ? 'Pessoa 2' : 'Família'

function lancamento(overrides: Partial<Lancamento> = {}): Lancamento {
  return {
    id: crypto.randomUUID(), natureza: 'saida', descricao: 'Fictício', valor: emCentavos(100),
    subcategoria: 'alimentacao.supermercado', data: '2026-09-05', competencia: '2026-09',
    vencimento: '2026-09-05', situacao: 'paga', tipo: 'variavel', formaDePagamento: 'pix',
    contaId: null, cartaoId: null, integranteId: null, referenteA: null, recorrencia: 'nenhuma',
    serieId: null, parcelamento: null, descontadoNaFonte: false, observacao: '', ...carimbos, ...overrides,
  }
}

const entrada = (overrides: Partial<Lancamento> = {}) =>
  lancamento({ natureza: 'entrada', subcategoria: 'remuneracao.salario', situacao: 'recebida', ...overrides })

const conta = (id: string, saldoInicial: number): Conta => ({
  id, nome: `Conta ${id}`, instituicao: '', tipo: 'corrente',
  saldoInicial: emCentavos(saldoInicial), ativa: true, observacao: '', ...carimbos,
})

describe('períodos', () => {
  it('recorta os meses que cada opção pede', () => {
    expect(limitesDoPeriodo('mes', '2026-09')).toEqual(['2026-09', '2026-09'])
    expect(limitesDoPeriodo('anterior', '2026-09')).toEqual(['2026-08', '2026-08'])
    expect(limitesDoPeriodo('tres', '2026-09')).toEqual(['2026-07', '2026-09'])
    expect(limitesDoPeriodo('doze', '2026-09')).toEqual(['2025-10', '2026-09'])
    expect(limitesDoPeriodo('ano', '2026-09')).toEqual(['2026-01', '2026-09'])
  })

  it('filtra pelos limites', () => {
    const lista = [lancamento({ data: '2026-07-10' }), lancamento({ data: '2026-09-05' }), lancamento({ data: '2026-10-01' })]
    expect(noPeriodo(lista, ['2026-07', '2026-09'])).toHaveLength(2)
  })
})

describe('relatório de entradas', () => {
  it('separa por integrante e por categoria', () => {
    const relatorio = relatorioDeEntradas([
      entrada({ valor: emCentavos(5000), integranteId: 'p1' }),
      entrada({ valor: emCentavos(1500), integranteId: 'p2', subcategoria: 'renda-extra.revenda' }),
      entrada({ valor: emCentavos(800), situacao: 'prevista' }),
    ], nomes)

    expect(relatorio.recebido).toBe(emCentavos(6500))
    expect(relatorio.previsto).toBe(emCentavos(800))
    expect(relatorio.porIntegrante[0]).toMatchObject({ nome: 'Pessoa 1', valor: emCentavos(5000) })
    expect(relatorio.porCategoria.map(({ nome }) => nome)).toEqual(['Salário e remuneração', 'Renda extra'])
  })
})

describe('relatório de saídas', () => {
  const contas = [conta('c1', 0)]
  const cartoes: Cartao[] = [{ id: 'k1', nome: 'Cartão fictício', bandeira: '', contaId: null, limite: emCentavos(3000), diaDeFechamento: 20, diaDeVencimento: 28, ativo: true, ...carimbos }]

  it('recorta por categoria, subcategoria, forma, conta e cartão', () => {
    const relatorio = relatorioDeSaidas([
      lancamento({ valor: emCentavos(600), subcategoria: 'alimentacao.supermercado', formaDePagamento: 'credito', cartaoId: 'k1' }),
      lancamento({ valor: emCentavos(200), subcategoria: 'alimentacao.feira', formaDePagamento: 'dinheiro', contaId: 'c1' }),
      lancamento({ valor: emCentavos(1200), subcategoria: 'moradia.aluguel', tipo: 'fixa', contaId: 'c1' }),
      lancamento({ valor: emCentavos(300), situacao: 'pendente' }),
    ], nomes, contas, cartoes)

    expect(relatorio.pagas).toBe(emCentavos(2000))
    expect(relatorio.pendentes).toBe(emCentavos(300))
    expect(relatorio.porCategoria[0]).toMatchObject({ nome: 'Moradia', valor: emCentavos(1200) })
    expect(relatorio.porSubcategoria.map(({ nome }) => nome)).toContain('Supermercado')
    expect(relatorio.porCartao[0]).toMatchObject({ nome: 'Cartão fictício', valor: emCentavos(600) })
    expect(relatorio.porConta[0]).toMatchObject({ nome: 'Conta c1', valor: emCentavos(1400) })
    expect(relatorio.fixas).toBe(emCentavos(1200))
  })

  it('forma de pagamento não informada aparece como tal, e não some', () => {
    const relatorio = relatorioDeSaidas([lancamento({ formaDePagamento: null })], nomes, [], [])
    expect(relatorio.porFormaDePagamento[0]).toMatchObject({ nome: 'Não informada' })
  })
})

describe('relatório de dívidas', () => {
  const parcela = (numero: number, vencimento: string, situacao: Lancamento['situacao'] = 'pendente') =>
    lancamento({ valor: emCentavos(400), situacao, vencimento, data: vencimento, parcelamento: { total: 24, numero, serie: 's1' } })

  /*
    Sem score inventado: o que sai por mês, o que falta e quanto disso pesa
    sobre o que entra. Um número de zero a cem que ninguém sabe calcular não
    ajuda a decidir nada.
  */
  it('conta o que falta, o que sai no mês e o peso sobre a renda', () => {
    const relatorio = relatorioDeDividas([
      entrada({ valor: emCentavos(5000) }),
      parcela(14, '2026-09-20'),
      parcela(15, '2026-10-20'),
      parcela(16, '2026-11-20'),
      parcela(13, '2026-08-20', 'paga'),
    ], '2026-09')

    expect(relatorio.parcelasRestantes).toBe(3)
    expect(relatorio.saldo).toBe(emCentavos(1200))
    expect(relatorio.mensal).toBe(emCentavos(400))
    expect(relatorio.ultimaParcela).toBe('2026-11')
    expect(relatorio.comprometimento).toBe(8)
  })

  it('sem renda o comprometimento não vira divisão por zero', () => {
    expect(relatorioDeDividas([parcela(1, '2026-09-20')], '2026-09').comprometimento).toBe(0)
  })
})

describe('relatório de metas', () => {
  const meta = (id: string, objetivo: number, especie: Meta['especie'] = 'meta'): Meta => ({
    id, especie, nome: `Meta ${id}`, categoria: 'casa', integranteId: null,
    objetivo: emCentavos(objetivo), dataInicial: '2026-01-01', prazo: '2027-01',
    contribuicaoPlanejada: emCentavos(500), contaId: null, mesesDeReserva: 0,
    despesaEssencial: 0, observacao: '', status: 'ativa', ...carimbos,
  })
  const aporte = (metaId: string, valor: number): Aporte => ({
    id: crypto.randomUUID(), metaId, valor: emCentavos(valor), data: '2026-09-05',
    contaId: null, integranteId: null, observacao: '', ...carimbos,
  })

  it('soma o que falta em todas', () => {
    const relatorio = relatorioDeMetas(
      [meta('m1', 12_000), meta('m2', 3000, 'fundo')],
      [aporte('m1', 3200), aporte('m2', 1000)],
    )
    expect(relatorio.total).toBe(emCentavos(15_000))
    expect(relatorio.guardado).toBe(emCentavos(4200))
    expect(relatorio.falta).toBe(emCentavos(10_800))
    expect(relatorio.linhas[0]!.nome).toBe('Meta m1')
  })

  it('meta cancelada sai da conta', () => {
    const cancelada = { ...meta('m3', 9000), status: 'cancelada' as const }
    expect(relatorioDeMetas([cancelada], []).total).toBe(0)
  })
})

describe('patrimônio', () => {
  /*
    A transferência entra aqui — e só aqui. Mudar dinheiro de lugar altera o
    saldo de duas contas sem alterar o patrimônio, e é isso que a soma precisa
    enxergar para não errar.
  */
  it('soma o saldo das contas e desconta o que se deve', () => {
    const transferencia: Transferencia = {
      id: 't1', origemContaId: 'c1', destinoContaId: 'c2', valor: emCentavos(1000),
      data: '2026-09-08', metaId: null, observacao: '', ...carimbos,
    }
    const resultado = patrimonio(
      [conta('c1', 5000), conta('c2', 2000)],
      [entrada({ valor: emCentavos(3000), contaId: 'c1' }), lancamento({ valor: emCentavos(500), contaId: 'c1' })],
      [transferencia],
      { saldo: emCentavos(1200), mensal: 0, parcelasRestantes: 0, ultimaParcela: null, comprometimento: 0 },
    )

    expect(resultado.porConta.find(({ chave }) => chave === 'c1')?.valor).toBe(emCentavos(6500))
    expect(resultado.porConta.find(({ chave }) => chave === 'c2')?.valor).toBe(emCentavos(3000))
    expect(resultado.ativos).toBe(emCentavos(9500))
    expect(resultado.passivos).toBe(emCentavos(1200))
    expect(resultado.liquido).toBe(emCentavos(8300))
  })

  it('a transferência não muda o patrimônio, só onde ele está', () => {
    const contas = [conta('c1', 5000), conta('c2', 0)]
    const semTransferir = patrimonio(contas, [], [], { saldo: 0, mensal: 0, parcelasRestantes: 0, ultimaParcela: null, comprometimento: 0 })
    const transferindo = patrimonio(contas, [], [{
      id: 't1', origemContaId: 'c1', destinoContaId: 'c2', valor: emCentavos(2000),
      data: '2026-09-08', metaId: null, observacao: '', ...carimbos,
    }], { saldo: 0, mensal: 0, parcelasRestantes: 0, ultimaParcela: null, comprometimento: 0 })

    expect(transferindo.liquido).toBe(semTransferir.liquido)
  })
})

describe('fluxo de caixa futuro', () => {
  it('soma o que já está marcado no calendário', () => {
    const fluxo = fluxoFuturo([
      entrada({ valor: emCentavos(5000), situacao: 'prevista', data: '2026-09-20', vencimento: '' }),
      lancamento({ valor: emCentavos(1200), situacao: 'pendente', vencimento: '2026-09-25' }),
      lancamento({ valor: emCentavos(800), situacao: 'pendente', vencimento: '2026-12-25' }),
    ], HOJE, 30)

    expect(fluxo.entradasPrevistas).toBe(emCentavos(5000))
    expect(fluxo.saidasPrevistas).toBe(emCentavos(1200))
    expect(fluxo.saldoProjetado).toBe(emCentavos(3800))
  })

  it('o que já aconteceu não é futuro', () => {
    const fluxo = fluxoFuturo([lancamento({ situacao: 'pendente', vencimento: '2026-09-01' })], HOJE, 30)
    expect(fluxo.saidasPrevistas).toBe(0)
  })
})

describe('relatório familiar', () => {
  it('junta renda, despesa, economia e o peso das dívidas', () => {
    const relatorio = relatorioFamiliar(
      [entrada({ valor: emCentavos(5000) }), lancamento({ valor: emCentavos(3000), tipo: 'fixa' })],
      [{ id: 'a1', metaId: 'm1', valor: emCentavos(700), data: '2026-09-05', contaId: null, integranteId: null, observacao: '', ...carimbos }],
      { saldo: emCentavos(1200), mensal: emCentavos(400), parcelasRestantes: 3, ultimaParcela: '2026-11', comprometimento: 8 },
    )
    expect(relatorio.renda).toBe(emCentavos(5000))
    expect(relatorio.economia).toBe(emCentavos(2000))
    expect(relatorio.taxaDeEconomia).toBe(40)
    expect(relatorio.guardadoEmMetas).toBe(emCentavos(700))
    expect(relatorio.comprometimentoComDividas).toBe(8)
  })
})
