import { describe, expect, it } from 'vitest'
import { emCentavos, somar } from './dinheiro'
import type { Lancamento, LancamentoData } from './lancamento'
import { alcanceDaEdicao, avancarData, gerarOcorrencias, gerarParcelas, parcelasDaCompra } from './series'

function base(overrides: Partial<LancamentoData> = {}): LancamentoData {
  return {
    natureza: 'saida', descricao: 'Energia', valor: emCentavos(230), subcategoria: 'moradia.energia-eletrica',
    data: '2026-09-10', competencia: '2026-09', vencimento: '2026-09-15', situacao: 'pendente',
    tipo: 'fixa', formaDePagamento: 'boleto', contaId: null, cartaoId: null, integranteId: null,
    referenteA: null, recorrencia: 'mensal', serieId: null, parcelamento: null, descontadoNaFonte: false, observacao: '',
    createdAt: '2026-09-01T10:00:00.000Z', updatedAt: '2026-09-01T10:00:00.000Z', ...overrides,
  }
}

const comId = (dados: LancamentoData, id: string): Lancamento => ({ ...dados, id })

describe('avançar data', () => {
  it('anda de mês em mês', () => {
    expect(avancarData('2026-09-10', 'mensal', 1)).toBe('2026-10-10')
    expect(avancarData('2026-09-10', 'mensal', 4)).toBe('2027-01-10')
  })

  /*
    Dia 31 em fevereiro não existe. Uma conta que vence todo dia 31 vence no
    último dia de fevereiro — não em 3 de março, que é o que somar dias daria.
  */
  it('prende no último dia do mês em vez de escorregar para o mês seguinte', () => {
    expect(avancarData('2026-01-31', 'mensal', 1)).toBe('2026-02-28')
    expect(avancarData('2028-01-31', 'mensal', 1)).toBe('2028-02-29')
    expect(avancarData('2026-01-31', 'mensal', 3)).toBe('2026-04-30')
  })

  it('anda de semana e de quinzena em dias', () => {
    expect(avancarData('2026-09-10', 'semanal', 1)).toBe('2026-09-17')
    expect(avancarData('2026-09-10', 'quinzenal', 2)).toBe('2026-10-08')
  })

  it('os prazos longos atravessam o ano', () => {
    expect(avancarData('2026-09-10', 'bimestral', 3)).toBe('2027-03-10')
    expect(avancarData('2026-09-10', 'semestral', 1)).toBe('2027-03-10')
    expect(avancarData('2026-09-10', 'anual', 2)).toBe('2028-09-10')
  })

  it('sem recorrência não anda', () => {
    expect(avancarData('2026-09-10', 'nenhuma', 5)).toBe('2026-09-10')
  })
})

describe('ocorrências de uma série', () => {
  /*
    Nenhuma nasce paga. Uma conta que ainda não chegou não foi paga, e um
    salário que ainda não caiu não entrou — marcar assim faria o mês que vem
    já vir resolvido, e o pastor decidiria sobre dinheiro que não existe.
  */
  it('nascem todas em aberto', () => {
    const ocorrencias = gerarOcorrencias(base({ situacao: 'paga' }), 3, 's1')
    expect(ocorrencias).toHaveLength(3)
    expect(ocorrencias.every(({ situacao }) => situacao === 'pendente')).toBe(true)
  })

  it('entrada recorrente nasce prevista, não recebida', () => {
    const salario = base({ natureza: 'entrada', subcategoria: 'remuneracao.salario', situacao: 'recebida' })
    expect(gerarOcorrencias(salario, 2, 's2').every(({ situacao }) => situacao === 'prevista')).toBe(true)
  })

  it('data, competência e vencimento andam juntos', () => {
    const [primeira, segunda] = gerarOcorrencias(base(), 2, 's3')
    expect(primeira).toMatchObject({ data: '2026-10-10', competencia: '2026-10', vencimento: '2026-10-15' })
    expect(segunda).toMatchObject({ data: '2026-11-10', competencia: '2026-11', vencimento: '2026-11-15' })
  })

  /*
    Salário de agosto recebido em setembro: a competência está atrás da data e
    precisa continuar atrás nas próximas, senão outubro receberia o salário de
    outubro e a defasagem sumiria.
  */
  it('competência defasada continua defasada', () => {
    const salario = base({ natureza: 'entrada', data: '2026-09-05', competencia: '2026-08', vencimento: '' })
    const [primeira, segunda] = gerarOcorrencias(salario, 2, 's4')
    expect(primeira).toMatchObject({ data: '2026-10-05', competencia: '2026-09' })
    expect(segunda).toMatchObject({ data: '2026-11-05', competencia: '2026-10' })
  })

  it('todas carregam a mesma série', () => {
    expect(gerarOcorrencias(base(), 3, 'serie-x').every(({ serieId }) => serieId === 'serie-x')).toBe(true)
  })

  it('sem recorrência não gera nada', () => {
    expect(gerarOcorrencias(base({ recorrencia: 'nenhuma' }), 5, 's5')).toHaveLength(0)
  })
})

describe('parcelas', () => {
  it('somam exatamente o total da compra', () => {
    const parcelas = gerarParcelas(base({ vencimento: '2026-09-20' }), { total: emCentavos(100), parcelas: 3, jaPagas: 0 }, 'c1')
    expect(parcelas.map(({ valor }) => valor)).toEqual([3334, 3333, 3333])
    expect(somar(parcelas.map(({ valor }) => valor))).toBe(emCentavos(100))
  })

  it('numeram e vencem de mês em mês', () => {
    const parcelas = gerarParcelas(base({ vencimento: '2026-09-20' }), { total: emCentavos(4800), parcelas: 12, jaPagas: 0 }, 'c2')
    expect(parcelas).toHaveLength(12)
    expect(parcelas[0]).toMatchObject({ vencimento: '2026-09-20', parcelamento: { total: 12, numero: 1, serie: 'c2' } })
    expect(parcelas[3]).toMatchObject({ vencimento: '2026-12-20', parcelamento: { total: 12, numero: 4, serie: 'c2' } })
    expect(parcelas[0]!.valor).toBe(emCentavos(400))
  })

  /*
    A dívida que começou antes do aplicativo: 24 no total, 13 já pagas lá atrás,
    11 restantes. Só as 11 são gravadas, mas a numeração continua sendo 14 de 24
    — o pastor reconhece a dívida dele, não uma renumerada do zero.
  */
  it('a dívida que começou antes entra só com o que falta, sem renumerar', () => {
    const parcelas = gerarParcelas(base(), { total: emCentavos(9600), parcelas: 24, jaPagas: 13 }, 'c3')
    expect(parcelas).toHaveLength(11)
    expect(parcelas[0]!.parcelamento).toMatchObject({ total: 24, numero: 14 })
    expect(parcelas.at(-1)!.parcelamento).toMatchObject({ total: 24, numero: 24 })
  })

  it('nenhuma parcela nasce paga', () => {
    const parcelas = gerarParcelas(base({ situacao: 'paga' }), { total: emCentavos(1200), parcelas: 6, jaPagas: 0 }, 'c4')
    expect(parcelas.every(({ situacao }) => situacao === 'pendente')).toBe(true)
  })

  it('parcela não é recorrência', () => {
    const parcelas = gerarParcelas(base(), { total: emCentavos(1200), parcelas: 3, jaPagas: 0 }, 'c5')
    expect(parcelas.every(({ recorrencia, serieId }) => recorrencia === 'nenhuma' && serieId === null)).toBe(true)
  })

  it('dívida já quitada não gera parcela', () => {
    expect(gerarParcelas(base(), { total: emCentavos(1000), parcelas: 10, jaPagas: 10 }, 'c6')).toHaveLength(0)
  })

  it('acha as parcelas da mesma compra, em ordem', () => {
    const parcelas = gerarParcelas(base(), { total: emCentavos(1200), parcelas: 3, jaPagas: 0 }, 'c7')
      .map((dados, indice) => comId(dados, `p${3 - indice}`))
    const ordenadas = parcelasDaCompra([...parcelas].reverse(), 'c7')
    expect(ordenadas.map(({ parcelamento }) => parcelamento?.numero)).toEqual([1, 2, 3])
  })
})

describe('alcance da edição', () => {
  const serie = ['2026-08-10', '2026-09-10', '2026-10-10', '2026-11-10']
    .map((data, indice) => comId(base({ data, serieId: 's9' }), `o${indice}`))
  const alvo = serie[1]!

  it('somente esta não toca nas outras', () => {
    expect(alcanceDaEdicao(serie, alvo, 'somente_esta').map(({ id }) => id)).toEqual(['o1'])
  })

  /*
    "Esta e as próximas" olha a data, não a ordem de criação: agosto veio no
    valor que veio, e mudar isso reescreveria o passado.
  */
  it('esta e as próximas deixa o passado como está', () => {
    expect(alcanceDaEdicao(serie, alvo, 'esta_e_proximas').map(({ id }) => id)).toEqual(['o1', 'o2', 'o3'])
  })

  it('série inteira alcança tudo', () => {
    expect(alcanceDaEdicao(serie, alvo, 'serie_inteira')).toHaveLength(4)
  })

  it('lançamento fora de série se edita sozinho, qualquer que seja o escopo', () => {
    const solto = comId(base({ recorrencia: 'nenhuma' }), 'solto')
    expect(alcanceDaEdicao([...serie, solto], solto, 'serie_inteira')).toEqual([solto])
  })
})
