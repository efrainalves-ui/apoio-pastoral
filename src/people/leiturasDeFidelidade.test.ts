import { describe, expect, it } from 'vitest'
import { anoDaLeitura, leituraDoAno, mesclarFidelidade } from './leiturasDeFidelidade'
import { situacaoNoAno } from '../goals/doadores'
import type { FidelityCategory, FidelitySnapshot } from './types'

function leitura(ano: number, category: FidelityCategory): FidelitySnapshot {
  return {
    referenceYear: ano,
    months: null, rangeMin: 0, rangeMax: 0, category, precision: 'category_only',
    updatedAt: '2026-09-07T12:00:00.000Z', importedAt: '2026-09-07T12:00:00.000Z',
    source: `PDF local de fidelidade ${ano}`, importBatchId: '',
  }
}

// Sem a chave, e não com ela vazia: é assim que as leituras antigas estão
// gravadas, e é o caso que o código precisa aguentar.
function leituraAntiga(): FidelitySnapshot {
  const base = { ...leitura(2026, 'tither'), importedAt: '2024-03-01T00:00:00.000Z' }
  delete base.referenceYear
  return base
}

describe('o ano de uma leitura de fidelidade', () => {
  it('é o ano que o relatório declara', () => {
    expect(anoDaLeitura(leitura(2025, 'tither'))).toBe(2025)
  })

  it('nas leituras antigas, continua sendo a data da importação', () => {
    // Elas foram gravadas antes de existir a pergunta. Ignorá-las apagaria o
    // histórico que o pastor já tinha.
    expect(anoDaLeitura(leituraAntiga())).toBe(2024)
  })
})

describe('encaixar uma leitura no histórico', () => {
  it('deixa como atual a do maior ano, não a última que chegou', () => {
    // Este era o defeito: enviar o relatório de 2025 depois do de 2026
    // rebaixava todo mundo à situação do ano passado.
    const pessoa = { fidelity: leitura(2026, 'tither'), fidelityHistory: [] }
    const depois = mesclarFidelidade(pessoa, leitura(2025, 'non_tither'))

    expect(depois.fidelity.referenceYear).toBe(2026)
    expect(depois.fidelity.category).toBe('tither')
    expect(depois.fidelityHistory.map(anoDaLeitura)).toEqual([2025])
  })

  it('reenviar um ano corrige aquele ano, em vez de acumular', () => {
    const pessoa = { fidelity: leitura(2026, 'non_tither'), fidelityHistory: [leitura(2025, 'tither')] }
    const depois = mesclarFidelidade(pessoa, leitura(2025, 'non_systematic_tither'))

    expect(depois.fidelityHistory).toHaveLength(1)
    expect(leituraDoAno(depois, 2025)?.category).toBe('non_systematic_tither')
    expect(depois.fidelity.referenceYear).toBe(2026)
  })

  it('a situação de cada ano passa a ser a do relatório daquele ano', () => {
    const pessoa = mesclarFidelidade(
      mesclarFidelidade({ fidelity: null, fidelityHistory: [] }, leitura(2026, 'tither')),
      leitura(2025, 'non_tither'),
    )

    expect(situacaoNoAno(pessoa, 2025)).toBe('non_tither')
    expect(situacaoNoAno(pessoa, 2026)).toBe('tither')
  })
})
