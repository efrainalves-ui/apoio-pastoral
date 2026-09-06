import { describe, expect, it } from 'vitest'
import { fidelidadePorAno } from './fidelidadePorAno'
import type { PessoaComFidelidade } from '../goals/doadores'
import type { FidelityCategory, FidelitySnapshot } from './types'

function leitura(ano: number, category: FidelityCategory): FidelitySnapshot {
  return {
    months: null, rangeMin: 0, rangeMax: 12, category, precision: 'range',
    updatedAt: `${ano}-06-01T00:00:00.000Z`, importedAt: `${ano}-06-01T00:00:00.000Z`,
    source: 'fixture fictícia', importBatchId: `lote-${ano}`,
  }
}

const pessoa = (historico: FidelitySnapshot[], atual: FidelitySnapshot | null = null): PessoaComFidelidade => ({
  fidelity: atual, fidelityHistory: historico,
})

describe('fidelidade do distrito ano a ano', () => {
  it('conta as três classificações em cada ano com leitura', () => {
    const distrito = [
      pessoa([leitura(2025, 'non_tither')], leitura(2026, 'tither')),
      pessoa([leitura(2025, 'tither')], leitura(2026, 'tither')),
      pessoa([leitura(2025, 'non_systematic_tither')], leitura(2026, 'non_tither')),
    ]

    const anos = fidelidadePorAno(distrito, 2026)

    expect(anos.map(({ ano }) => ano)).toEqual([2025, 2026])
    expect(anos[0]).toMatchObject({ dizimistas: 1, naoSistematicos: 1, naoDizimistas: 1, total: 3 })
    expect(anos[1]).toMatchObject({ dizimistas: 2, naoSistematicos: 0, naoDizimistas: 1, total: 3 })
  })

  it('ano sem leitura nenhuma não vira coluna zerada', () => {
    // Uma coluna de zeros leria como "todo mundo deixou de devolver", quando o
    // que houve foi não existir relatório daquele ano.
    const anos = fidelidadePorAno([pessoa([], leitura(2026, 'tither'))], 2026)

    expect(anos.map(({ ano }) => ano)).toEqual([2026])
  })

  it('não olha mais que cinco anos para trás', () => {
    const antigo = [pessoa([leitura(2019, 'tither')], leitura(2026, 'tither'))]

    expect(fidelidadePorAno(antigo, 2026).map(({ ano }) => ano)).toEqual([2022, 2023, 2024, 2025, 2026])
  })
})
