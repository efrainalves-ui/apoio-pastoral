import { describe, expect, it } from 'vitest'
import { acharIgreja, previaDeBatismos, previaFinanceira } from './importacaoAcms'

const igrejas = [
  { id: 'igreja-central', name: 'Central Fictícia' },
  { id: 'igreja-monte', name: 'Monte Fictício' },
]

const movimento = [
  'Até ao mês: 9/2026',
  'Distrito / Igreja Responsável Membros Jan Fev Mar Abr Maio Jun Jul Ago Set Out Nov Dez Total Alvo %',
  'Central Fictícia - Distrito Fictício - Anpa 171 I - - - 1 - - 2 - - - - - 3',
  'Sertão Fictício - Distrito Fictício - Anpa 114 I - - - 6 - - - - - - - - 6',
].join('\n')

const comparativo = [
  'Mês 2025 2026 %% 2025 2026 %%',
  '1 995 Central Fictícia - Distrito Fictício Janeiro 100,00 150,00 50.00 10,00 20,00 100.00',
  'Fevereiro 200,00 250,00 25.00 20,00 30,00 50.00',
  '2 1.149 Monte Fictício - Distrito Fictício Janeiro 1.000,00 2.000,00 100.00 100,00 200,00 100.00',
].join('\n')

describe('a igreja do relatório encontra a igreja do cadastro', () => {
  it('ignora o sufixo de distrito e associação que o ACMS acrescenta', () => {
    // O ACMS escreve "Central Fictícia - Distrito - Anpa"; o cadastro guarda
    // "Central Fictícia". Sem cortar no travessão, nenhuma igreja casaria.
    expect(acharIgreja('Central Fictícia - Distrito Fictício - Anpa', igrejas)?.id).toBe('igreja-central')
  })

  it('não confunde igrejas diferentes', () => {
    expect(acharIgreja('Igreja Que Não Existe - Anpa', igrejas)).toBeUndefined()
  })
})

describe('batismos vindos da Análise de Movimentos', () => {
  it('gera um lançamento por mês com batismo, no ano do relatório', () => {
    const previa = previaDeBatismos(movimento, 'hash-ficticio', igrejas)

    expect(previa.entries).toEqual([
      { churchId: 'igreja-central', metric: 'baptisms', date: '2026-04-01', amount: 1, reference: 'Análise de Movimentos 2026' },
      { churchId: 'igreja-central', metric: 'baptisms', date: '2026-07-01', amount: 2, reference: 'Análise de Movimentos 2026' },
    ])
    expect(previa.periodos).toEqual([{ ano: 2026, meses: [1, 2, 3, 4, 5, 6, 7, 8, 9] }])
  })

  it('avisa quando uma igreja do relatório não está cadastrada', () => {
    // Descartar em silêncio faria o total do distrito ficar menor do que o do
    // ACMS sem ninguém entender por quê — e o pastor confiaria no número errado.
    const previa = previaDeBatismos(movimento, 'hash-ficticio', igrejas)

    expect(previa.errors).toHaveLength(1)
    expect(previa.errors[0]).toContain('Sertão Fictício')
    expect(previa.errors[0]).toContain('ficaram de fora')
  })
})

describe('financeiro vindo do Comparativo de Entradas', () => {
  it('soma dízimo e oferta dos dois anos, mês a mês', () => {
    // O arquivo traz 2025 e 2026 lado a lado. Guardar só o corrente deixava o
    // gráfico com o ano passado zerado — e era o ano passado que o pastor
    // queria comparar.
    const previa = previaFinanceira(comparativo, 'hash-ficticio', igrejas)

    expect(previa.anoAtual).toBe(2026)
    expect(previa.entries).toEqual([
      { churchId: 'igreja-central', metric: 'tithes_offerings', date: '2025-01-01', amount: 110, reference: 'Comparativo de Entradas 2026' },
      { churchId: 'igreja-central', metric: 'tithes_offerings', date: '2026-01-01', amount: 170, reference: 'Comparativo de Entradas 2026' },
      { churchId: 'igreja-central', metric: 'tithes_offerings', date: '2025-02-01', amount: 220, reference: 'Comparativo de Entradas 2026' },
      { churchId: 'igreja-central', metric: 'tithes_offerings', date: '2026-02-01', amount: 280, reference: 'Comparativo de Entradas 2026' },
      { churchId: 'igreja-monte', metric: 'tithes_offerings', date: '2025-01-01', amount: 1100, reference: 'Comparativo de Entradas 2026' },
      { churchId: 'igreja-monte', metric: 'tithes_offerings', date: '2026-01-01', amount: 2200, reference: 'Comparativo de Entradas 2026' },
    ])
  })

  it('cobre os dois anos, para que reenviar substitua os dois', () => {
    // Se o período coberto fosse só o de 2026, reenviar o mesmo arquivo
    // dobraria 2025 a cada vez.
    const previa = previaFinanceira(comparativo, 'hash-ficticio', igrejas)

    expect(previa.periodos).toEqual([{ ano: 2025, meses: [1, 2] }, { ano: 2026, meses: [1, 2] }])
  })

  it('traz o total do ano anterior, que é o que a meta em porcentagem compara', () => {
    // Sem isto, "aumentar 10%" exigiria alguém digitar o ano passado inteiro.
    const previa = previaFinanceira(comparativo, 'hash-ficticio', igrejas)

    expect(previa.anoAnterior).toBe(2025)
    expect(previa.totalDoAnoAnterior).toBe(1430)
  })
})
