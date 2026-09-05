import { describe, expect, it } from 'vitest'
import { numeroBrasileiro, parseComparativoDeEntradas, parseMovimentoDeBatismos, RelatorioNaoReconhecidoError, totalDeEntradas } from './acmsRelatorios'

/**
 * Fixtures **inventadas**, com a mesma forma do relatório do ACMS e igrejas que
 * não existem. Nenhum relatório real entra em teste, no repositório ou na
 * documentação — os números aqui foram escolhidos para serem conferíveis de
 * cabeça, não para se parecerem com um distrito.
 */
const movimentoFicticio = [
  'Associação Fictícia do Norte',
  'Análise de Movimentos por Distrito/Igreja',
  'Distrito Fictício',
  'Até ao mês: 9/2026',
  'Distrito / Igreja Responsável Membros Jan Fev Mar Abr Maio Jun Jul Ago Set Out Nov Dez Total Alvo %',
  '3 2 - 12 1 - 14 2 - - - - 34 90 37,8',
  'Central Fictícia - Distrito Fictício 171 I - - - 1 - - - - - - - - 1',
  '37 G',
  'Monte Fictício - Distrito Fictício - - - 1 - - 1 - - - - - 2',
  'Sertão Fictício - Distrito Fictício 114 I - - - 6 - - 8 - - - - - 14',
  'Total da Entidade 3 2 - 12 1 - 14 2 - - - - 34 90 37,8',
].join('\n')

const comparativoFicticio = [
  'Associação Fictícia do Norte',
  'Comparativo de Entradas',
  'Igreja Mês a Mês',
  'Dízimo Oferta',
  'Mês 2025 2026 %% 2025 2026 %%',
  'Position Igreja',
  '1 995 Central Fictícia - Distrito Fictício Janeiro 100,00 150,00 50.00 10,00 20,00 100.00',
  'Fevereiro 200,00 250,00 25.00 20,00 30,00 50.00',
  'Março 300,00 400,00 33.00 30,00 40,00 33.00',
  '9.078,50 8.264,10 -9.00 10.419,29 3.742,21 178.00',
  // A porcentagem do dízimo escorregou para a linha seguinte: a linha da
  // igreja fica com cinco números em vez de seis.
  '2 1.149 Monte Fictício - Distrito Fictício Janeiro 1.000,00 2.000,00 100,00 200,00 100.00',
  '24.00',
  'Fevereiro 500,00 600,00 20.00 50,00 60,00 20.00',
  // Igreja partida entre páginas: o cabeçalho volta e o nome reaparece.
  'Mês 2025 2026 %% 2025 2026 %%',
  '2 1.149 Monte Fictício - Distrito Fictício Fevereiro 500,00 600,00 20.00 50,00 60,00 20.00',
  'Abril 700,00 800,00 14.00 70,00 80,00 14.00',
].join('\n')

describe('leitura de números do relatório', () => {
  it('separa o milhar em português da porcentagem em inglês', () => {
    // O mesmo relatório usa as duas convenções. Confundi-las leria mil como um.
    expect(numeroBrasileiro('1.151,00')).toBe(1151)
    expect(numeroBrasileiro('-20.00')).toBe(-20)
    expect(numeroBrasileiro('950,00')).toBe(950)
    expect(numeroBrasileiro('abc')).toBeNull()
  })
})

describe('Análise de Movimentos', () => {
  it('lê ano, mês de corte e cada igreja com seus doze meses', () => {
    const lido = parseMovimentoDeBatismos(movimentoFicticio)

    expect(lido).toMatchObject({ ano: 2026, ateOMes: 9 })
    expect(lido.igrejas.map(({ nome }) => nome)).toEqual([
      'Central Fictícia - Distrito Fictício',
      'Monte Fictício - Distrito Fictício',
      'Sertão Fictício - Distrito Fictício',
    ])
    expect(lido.igrejas[0]?.meses).toEqual([0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0])
    expect(lido.igrejas[0]?.total).toBe(1)
  })

  it('não conta a linha de resumo do distrito como se fosse igreja', () => {
    // Ela repete os mesmos números; somá-la dobraria o distrito inteiro.
    const lido = parseMovimentoDeBatismos(movimentoFicticio)

    expect(lido.igrejas).toHaveLength(3)
    expect(lido.igrejas.reduce((soma, igreja) => soma + igreja.total, 0)).toBe(17)
  })

  it('lê a igreja cujo par membros/tipo escorregou para a linha de cima', () => {
    // O desenho do PDF às vezes joga "37 G" para a linha anterior. Ler do fim
    // para o começo é o que torna isso indiferente.
    const lido = parseMovimentoDeBatismos(movimentoFicticio)
    const monte = lido.igrejas.find(({ nome }) => nome.startsWith('Monte'))

    expect(monte?.meses[3]).toBe(1)
    expect(monte?.meses[6]).toBe(1)
    expect(monte?.total).toBe(2)
  })

  it('recusa e explica quando o arquivo é outro', () => {
    expect(() => parseMovimentoDeBatismos('Um documento qualquer\nsem nada disso')).toThrow(RelatorioNaoReconhecidoError)
    expect(() => parseMovimentoDeBatismos('Até ao mês: 9/2026\nsó cabeçalho')).toThrow(/Nada foi alterado/u)
  })
})

describe('Comparativo de Entradas', () => {
  it('lê os dois anos, que é o que permite a meta em porcentagem', () => {
    // Sem isto, comparar com o ano anterior exigiria alguém digitar o ano
    // passado inteiro à mão.
    const lido = parseComparativoDeEntradas(comparativoFicticio)

    expect(lido.anoAnterior).toBe(2025)
    expect(lido.anoAtual).toBe(2026)
  })

  it('junta os meses de cada igreja, inclusive os das linhas seguintes', () => {
    const lido = parseComparativoDeEntradas(comparativoFicticio)
    const central = lido.igrejas.find(({ nome }) => nome.startsWith('Central'))

    expect(central?.meses.map(({ mes }) => mes)).toEqual([1, 2, 3])
    expect(central?.meses[1]).toMatchObject({ dizimoAnterior: 200, dizimoAtual: 250, ofertaAnterior: 20, ofertaAtual: 30 })
  })

  it('lê março, que o acento esconde', () => {
    // `março` sem acento vira `marco`; comparar a forma acentuada com a
    // normalizada fazia março sumir de todas as igrejas, em silêncio.
    const central = parseComparativoDeEntradas(comparativoFicticio).igrejas.find(({ nome }) => nome.startsWith('Central'))

    expect(central?.meses.find(({ mes }) => mes === 3)).toMatchObject({ dizimoAnterior: 300, dizimoAtual: 400 })
  })

  it('lê a linha em que a porcentagem quebrou para a linha seguinte', () => {
    // Contar posições descartava a linha inteira — e, pior, os meses daquela
    // igreja iam parar na igreja anterior, com o dinheiro atribuído a quem não
    // era. O dinheiro é reconhecido pela vírgula; a porcentagem usa ponto.
    const monte = parseComparativoDeEntradas(comparativoFicticio).igrejas.find(({ nome }) => nome.startsWith('Monte'))

    expect(monte?.meses.find(({ mes }) => mes === 1)).toMatchObject({
      dizimoAnterior: 1000, dizimoAtual: 2000, ofertaAnterior: 100, ofertaAtual: 200,
    })
    const central = parseComparativoDeEntradas(comparativoFicticio).igrejas.find(({ nome }) => nome.startsWith('Central'))
    expect(central?.meses).toHaveLength(3)
  })

  it('junta as duas metades de uma igreja partida entre páginas, sem repetir mês', () => {
    // Criar duas entradas com o mesmo nome mostraria a igreja duas vezes na
    // conferência; reler o mesmo mês somaria o dinheiro em dobro.
    const lido = parseComparativoDeEntradas(comparativoFicticio)
    const montes = lido.igrejas.filter(({ nome }) => nome.startsWith('Monte'))

    expect(montes).toHaveLength(1)
    expect(montes[0]?.meses.map(({ mes }) => mes)).toEqual([1, 2, 4])
  })

  it('ignora a linha de total em vez de somá-la como um mês', () => {
    // As linhas de total se quebram de formas diferentes conforme a página.
    // Somar os meses é mais confiável do que adivinhar onde o total começa.
    const lido = parseComparativoDeEntradas(comparativoFicticio)
    const central = lido.igrejas.find(({ nome }) => nome.startsWith('Central'))

    expect(central?.meses).toHaveLength(3)
    expect(totalDeEntradas(central?.meses ?? [], 'anterior')).toBe(660)
    expect(totalDeEntradas(central?.meses ?? [], 'atual')).toBe(890)
  })

  it('separa a posição e o código do ACMS do nome da igreja', () => {
    const lido = parseComparativoDeEntradas(comparativoFicticio)

    expect(lido.igrejas.map(({ nome }) => nome)).toEqual([
      'Central Fictícia - Distrito Fictício',
      'Monte Fictício - Distrito Fictício',
    ])
  })

  it('recusa e explica quando o arquivo é outro', () => {
    expect(() => parseComparativoDeEntradas('Outro documento\nqualquer')).toThrow(RelatorioNaoReconhecidoError)
  })
})
