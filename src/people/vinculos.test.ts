import { describe, expect, it } from 'vitest'
import { fidelityCareSummary } from './fidelitySummary'
import type { FidelitySnapshot, PersonEntity } from './types'
import { fidelidadeDoGrupo, grupoDaPessoa, umaPorPessoa } from './vinculos'

const leitura = (category: FidelitySnapshot['category'], referenceYear: number, updatedAt: string): FidelitySnapshot =>
  ({ referenceYear, months: null, rangeMin: 0, rangeMax: 0, category, precision: 'category_only', updatedAt, importedAt: updatedAt, source: 'Teste fictício', importBatchId: '' })

const pessoa = (id: string, extra: Partial<PersonEntity> = {}) => ({
  id, name: `Pessoa Fictícia ${id}`, birthDate: null, currentChurchId: 'central', incomeStatus: 'unknown',
  fidelity: null, fidelityHistory: [], history: [], nameVariants: [], createdAt: `2026-01-0${id.length}T10:00:00Z`, updatedAt: '',
  ...extra,
}) as unknown as PersonEntity

describe('cadastros vinculados contam como uma pessoa', () => {
  it('sem vínculo, cada cadastro é o seu próprio grupo', () => {
    const sozinha = pessoa('a')
    expect(grupoDaPessoa(sozinha)).toBe('a')
    expect(umaPorPessoa([sozinha, pessoa('b')])).toHaveLength(2)
  })

  it('dois cadastros vinculados viram um só, com a leitura mais recente', () => {
    const antiga = pessoa('a', { linkedGroupId: 'grupo-1', fidelity: leitura('non_tither', 2025, '2025-03-01T10:00:00Z'), createdAt: '2020-01-01T10:00:00Z' })
    const nova = pessoa('b', { linkedGroupId: 'grupo-1', fidelity: leitura('tither', 2026, '2026-03-01T10:00:00Z'), createdAt: '2024-01-01T10:00:00Z' })

    const colapsada = umaPorPessoa([antiga, nova])
    expect(colapsada).toHaveLength(1)
    // O representante é o cadastro mais antigo, e a leitura é a mais recente do grupo.
    expect(colapsada[0]?.id).toBe('a')
    expect(colapsada[0]?.fidelity?.category).toBe('tither')
    expect(fidelidadeDoGrupo([antiga, nova])?.referenceYear).toBe(2026)
  })

  it('mesma importação nos dois cadastros: vale a leitura que reconhece o dízimo', () => {
    /*
      O caso real: os dois vieram do mesmo PDF, com o mesmo carimbo de hora, e só
      um foi reconhecido como dizimista. Sem desempate, quem decidia era a ordem
      alfabética — e a pessoa continuava na fila de avaliação depois de vinculada.
    */
    const mesmaHora = '2026-03-01T10:00:00Z'
    const reconhecida = pessoa('a', { linkedGroupId: 'grupo-1', fidelity: leitura('tither', 2026, mesmaHora) })
    const naoReconhecida = pessoa('b', { linkedGroupId: 'grupo-1', fidelity: leitura('non_systematic_tither', 2026, mesmaHora) })

    expect(fidelidadeDoGrupo([reconhecida, naoReconhecida])?.category).toBe('tither')
    expect(fidelidadeDoGrupo([naoReconhecida, reconhecida])?.category).toBe('tither')
    expect(fidelityCareSummary([reconhecida, naoReconhecida])).toEqual({ faithful: 1, followingUp: 0, toEvaluate: 0 })

    // Mas um ano mais novo continua mandando, mesmo dizendo menos.
    const anoNovo = pessoa('c', { linkedGroupId: 'grupo-1', fidelity: leitura('non_tither', 2027, '2027-03-01T10:00:00Z') })
    expect(fidelidadeDoGrupo([reconhecida, anoNovo])?.category).toBe('non_tither')
  })

  it('a renda respondida em um cadastro vale para a pessoa', () => {
    const semResposta = pessoa('a', { linkedGroupId: 'grupo-1', fidelity: leitura('non_tither', 2026, '2026-01-01T10:00:00Z') })
    const comResposta = pessoa('b', { linkedGroupId: 'grupo-1', incomeStatus: 'no_income' })
    expect(umaPorPessoa([semResposta, comResposta])[0]?.incomeStatus).toBe('no_income')
  })

  it('os totais não contam a mesma pessoa duas vezes', () => {
    /*
      O caso real: um nome com uma letra trocada virou dois cadastros, e só um
      recebeu a leitura. Antes do vínculo ela contava duas vezes — uma como
      dizimista e outra a avaliar. Depois, conta uma.
    */
    const comLeitura = pessoa('a', { fidelity: leitura('tither', 2026, '2026-03-01T10:00:00Z') })
    const duplicada = pessoa('b')
    expect(fidelityCareSummary([comLeitura, duplicada])).toEqual({ faithful: 1, followingUp: 0, toEvaluate: 0 })

    const vinculadas = [
      { ...comLeitura, linkedGroupId: 'grupo-1' },
      { ...duplicada, linkedGroupId: 'grupo-1' },
    ]
    expect(fidelityCareSummary(vinculadas)).toEqual({ faithful: 1, followingUp: 0, toEvaluate: 0 })
    expect(umaPorPessoa(vinculadas)).toHaveLength(1)
  })

  it('uma pessoa a avaliar vinculada a outra sem leitura continua sendo uma a avaliar', () => {
    const aAvaliar = pessoa('a', { linkedGroupId: 'grupo-2', fidelity: leitura('non_tither', 2026, '2026-03-01T10:00:00Z') })
    const vazia = pessoa('b', { linkedGroupId: 'grupo-2' })
    expect(fidelityCareSummary([aAvaliar, vazia])).toEqual({ faithful: 0, followingUp: 0, toEvaluate: 1 })
  })
})
