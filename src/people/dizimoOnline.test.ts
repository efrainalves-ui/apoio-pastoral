import { describe, expect, it } from 'vitest'
import { faixaDoDizimoOnline, minimoParaSistematico, somarComOQueJaExiste, veioDoDizimoOnline, vezesNoDizimoOnline } from './dizimoOnline'
import type { FidelitySnapshot } from './types'

function leitura(overrides: Partial<FidelitySnapshot> = {}): FidelitySnapshot {
  return {
    referenceYear: 2026, months: 5, rangeMin: 5, rangeMax: 5,
    category: 'non_systematic_tither', precision: 'exact',
    updatedAt: '2026-09-01T00:00:00.000Z', importedAt: '2026-09-01T00:00:00.000Z',
    source: 'Relatório de fidelidade', importBatchId: 'lote-ficticio',
    ...overrides,
  }
}

/*
  O relatório de Fidelidade cobre doze meses e chama de sistemático quem
  devolveu de oito a doze vezes. O Dízimo Online cobre o que já correu do ano,
  e a mesma exigência, proporcional, cai junto. Fixar "seis" no código faria o
  relatório de setembro, com nove meses, medir gente com a régua de agosto.
*/
describe('a régua do Dízimo Online acompanha o período', () => {
  it('doze meses exigem oito; oito exigem seis', () => {
    expect(minimoParaSistematico(12)).toBe(8)
    expect(minimoParaSistematico(8)).toBe(6)
  })

  it('um período menor exige menos, na mesma proporção', () => {
    expect(minimoParaSistematico(6)).toBe(4)
    expect(minimoParaSistematico(9)).toBe(6)
    expect(minimoParaSistematico(1)).toBe(1)
  })

  it('classifica pelas faixas que o pastor definiu para oito meses', () => {
    expect(faixaDoDizimoOnline(8, 8)).toBe('tither')
    expect(faixaDoDizimoOnline(6, 8)).toBe('tither')
    expect(faixaDoDizimoOnline(5, 8)).toBe('non_systematic_tither')
    expect(faixaDoDizimoOnline(1, 8)).toBe('non_systematic_tither')
    expect(faixaDoDizimoOnline(0, 8)).toBe('non_tither')
  })
})

describe('somar as duas fontes do mesmo ano', () => {
  const nova = { meses: ['2026-05', '2026-07', '2026-08'], mesesDoPeriodo: 8, referenceYear: 2026, importedAt: '2026-09-12T00:00:00.000Z', importBatchId: 'lote-ficticio' }

  /* Quem devolveu em meses diferentes devolveu em mais meses, não nos mesmos. */
  it('soma os meses das duas e lê na escala de doze', () => {
    const pessoa = { fidelity: leitura({ months: 5 }), fidelityHistory: [] }
    const resultado = somarComOQueJaExiste(pessoa, nova)
    expect(resultado.months).toBe(8)
    expect(resultado.category).toBe('tither')
  })

  it('não passa da escala, por mais que somem', () => {
    const pessoa = { fidelity: leitura({ months: 11 }), fidelityHistory: [] }
    expect(somarComOQueJaExiste(pessoa, nova).months).toBe(12)
  })

  /* Sem leitura anterior, vale a régua do próprio período. */
  it('sozinha, usa a régua do período que o relatório cobre', () => {
    const resultado = somarComOQueJaExiste({ fidelity: null, fidelityHistory: [] }, nova)
    expect(resultado.months).toBe(3)
    expect(resultado.category).toBe('non_systematic_tither')

    const seisMeses = somarComOQueJaExiste({ fidelity: null, fidelityHistory: [] }, { ...nova, meses: ['2026-01','2026-02','2026-03','2026-04','2026-05','2026-06'] })
    expect(seisMeses.category).toBe('tither')
  })

  /* Leitura de outro ano não entra na soma: são períodos diferentes. */
  it('ignora a leitura de outro ano', () => {
    const pessoa = { fidelity: leitura({ referenceYear: 2025, months: 11 }), fidelityHistory: [] }
    expect(somarComOQueJaExiste(pessoa, nova).months).toBe(3)
  })

  /*
    O relatório em faixa diz "de 8 a 12" e não diz quais meses. Somar seria
    inventar: fica valendo a maior das duas faixas, que é o que se pode afirmar.
  */
  it('com faixa em vez de meses exatos, fica a faixa mais alta e não inventa número', () => {
    const pessoa = { fidelity: leitura({ months: null, rangeMin: 8, rangeMax: 12, category: 'tither', precision: 'range' }), fidelityHistory: [] }
    const resultado = somarComOQueJaExiste(pessoa, nova)
    expect(resultado.months).toBeNull()
    expect(resultado.category).toBe('tither')
    expect(resultado.precision).toBe('range')
  })

  it('somar de novo a mesma fonte não empilha em cima de si mesma', () => {
    const primeira = somarComOQueJaExiste({ fidelity: null, fidelityHistory: [] }, nova)
    const segunda = somarComOQueJaExiste({ fidelity: primeira, fidelityHistory: [] }, nova)
    expect(segunda.months).toBe(primeira.months)
  })
})

describe('de onde a leitura veio', () => {
  it('marca a origem e quantas vezes foram', () => {
    const resultado = somarComOQueJaExiste({ fidelity: null, fidelityHistory: [] }, { meses: ['2026-01','2026-02'], mesesDoPeriodo: 8, referenceYear: 2026, importedAt: '2026-09-12T00:00:00.000Z', importBatchId: 'lote-ficticio' })
    expect(veioDoDizimoOnline(resultado)).toBe(true)
    expect(vezesNoDizimoOnline(resultado)).toEqual({ vezes: 2, de: 8 })
  })

  it('leitura do relatório comum não é marcada como do Dízimo Online', () => {
    expect(veioDoDizimoOnline(leitura())).toBe(false)
    expect(vezesNoDizimoOnline(leitura())).toBeNull()
  })
})
