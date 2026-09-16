import { describe, expect, it } from 'vitest'
import { IDADE_COM_RENDA, rotuloDaFidelidade, situacaoDeRenda, temRenda } from './rendaPorIdade'
import type { PersonEntity } from './types'

const HOJE = new Date('2026-09-16T12:00:00')

const pessoa = (birthDate: string | null, incomeStatus: PersonEntity['incomeStatus'] = 'unknown', categoria: 'non_tither' | 'non_systematic_tither' | 'tither' = 'non_tither') =>
  ({ birthDate, incomeStatus, fidelity: { category: categoria } }) as Pick<PersonEntity, 'birthDate' | 'incomeStatus' | 'fidelity'>

describe('renda pela idade', () => {
  it('66 anos ainda é renda a confirmar', () => {
    // Faz 67 em 2027: hoje tem 66.
    const seisSeis = pessoa('1960-01-10')
    expect(situacaoDeRenda(seisSeis, HOJE)).toEqual({ status: 'unknown', origem: 'a_confirmar', padraoPelaIdade: false, idade: 66 })
    expect(rotuloDaFidelidade(seisSeis, HOJE)).toBe('Não dizimista')
  })

  it('exatamente 67, no próprio dia do aniversário, já conta como pessoa com renda', () => {
    const noDia = pessoa('1959-09-16')
    expect(situacaoDeRenda(noDia, HOJE)).toMatchObject({ status: 'has_income', origem: 'idade', idade: IDADE_COM_RENDA })
    expect(rotuloDaFidelidade(noDia, HOJE)).toBe('Não dizimista com renda')
  })

  it('acima de 67 também, e o dizimista continua só dizimista', () => {
    expect(temRenda(pessoa('1946-03-02'), HOJE)).toBe('has_income')
    expect(rotuloDaFidelidade(pessoa('1946-03-02', 'unknown', 'non_systematic_tither'), HOJE)).toBe('Dizimista não sistemático com renda')
    // A regra mexe na renda, não na fidelidade: quem devolve o dízimo não vira outra coisa.
    expect(rotuloDaFidelidade(pessoa('1946-03-02', 'unknown', 'tither'), HOJE)).toBe('Dizimista')
  })

  it('sem data de nascimento continua como renda a confirmar', () => {
    expect(situacaoDeRenda(pessoa(null), HOJE)).toEqual({ status: 'unknown', origem: 'sem_data', padraoPelaIdade: false, idade: null })
    expect(rotuloDaFidelidade(pessoa(null), HOJE)).toBe('Não dizimista')
  })

  it('quem completa 67 durante o ano muda sozinho no dia do aniversário', () => {
    const aniversariante = pessoa('1959-11-20')
    // Véspera: ainda 66.
    expect(situacaoDeRenda(aniversariante, new Date('2026-11-19T12:00:00'))).toMatchObject({ status: 'unknown', idade: 66 })
    expect(situacaoDeRenda(aniversariante, new Date('2026-11-20T12:00:00'))).toMatchObject({ status: 'has_income', origem: 'idade', idade: 67 })
    expect(situacaoDeRenda(aniversariante, new Date('2027-02-01T12:00:00'))).toMatchObject({ status: 'has_income', idade: 67 })
  })

  it('a correção do pastor vale acima da idade, e a tela fica sabendo que o padrão era outro', () => {
    const corrigida = pessoa('1946-03-02', 'no_income')
    expect(situacaoDeRenda(corrigida, HOJE)).toMatchObject({ status: 'no_income', origem: 'pastor', padraoPelaIdade: true })
    expect(rotuloDaFidelidade(corrigida, HOJE)).toBe('Não dizimista')
    // Abaixo dos 67 a correção continua sendo só a correção.
    expect(situacaoDeRenda(pessoa('1990-05-05', 'has_income'), HOJE)).toMatchObject({ status: 'has_income', origem: 'pastor', padraoPelaIdade: false })
  })
})
