import { describe, expect, it } from 'vitest'
import { comparativoDeDoadores, contarDoadores, situacaoNoAno, type PessoaComFidelidade } from './doadores'
import type { FidelityCategory, FidelitySnapshot } from '../people/types'

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

describe('quem é doador, e em qual ano', () => {
  it('conta quem devolve, sistemático ou não', () => {
    // Contar só o sistemático esconderia quem começou este ano e ainda não tem
    // regularidade — que é justamente o movimento que a meta acompanha.
    const pessoas = [
      pessoa([], leitura(2026, 'tither')),
      pessoa([], leitura(2026, 'non_systematic_tither')),
      pessoa([], leitura(2026, 'non_tither')),
    ]

    expect(contarDoadores(pessoas, 2026)).toBe(2)
  })

  it('usa a leitura mais recente feita até aquele ano, e não a de hoje', () => {
    // Usar a leitura de hoje para o ano passado faria o número do ano passado
    // mudar sozinho a cada importação nova — e base que se move não compara.
    const convertida = pessoa([leitura(2025, 'non_tither')], leitura(2026, 'tither'))

    expect(situacaoNoAno(convertida, 2025)).toBe('non_tither')
    expect(situacaoNoAno(convertida, 2026)).toBe('tither')
    expect(contarDoadores([convertida], 2025)).toBe(0)
    expect(contarDoadores([convertida], 2026)).toBe(1)
  })

  it('quem ainda não tinha leitura naquele ano não conta como nada', () => {
    const nova = pessoa([], leitura(2026, 'tither'))

    expect(situacaoNoAno(nova, 2025)).toBeUndefined()
    expect(contarDoadores([nova], 2025)).toBe(0)
  })
})

describe('meta de aumento de doadores', () => {
  const distrito = [
    pessoa([leitura(2025, 'tither')], leitura(2026, 'tither')),
    pessoa([leitura(2025, 'tither')], leitura(2026, 'tither')),
    pessoa([leitura(2025, 'non_tither')], leitura(2026, 'tither')),
  ]

  it('traduz a porcentagem em pessoas, arredondando para cima', () => {
    // Pessoa não se divide: dez por cento a mais que dois é 2,2, e a meta só se
    // cumpre em três.
    const comparativo = comparativoDeDoadores(distrito, 2026, 10)

    expect(comparativo).toMatchObject({ anterior: 2, atual: 3, objetivo: 3, percentualAlcancado: 100 })
  })

  it('sem ano anterior, avisa em vez de inventar progresso', () => {
    const semPassado = [pessoa([], leitura(2026, 'tither'))]
    const comparativo = comparativoDeDoadores(semPassado, 2026, 10)

    expect(comparativo.semBaseDeComparacao).toBe(true)
    expect(comparativo.objetivo).toBe(0)
    expect(comparativo.percentualAlcancado).toBe(0)
  })
})
