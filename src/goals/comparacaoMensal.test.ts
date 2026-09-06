import { describe, expect, it } from 'vitest'
import { anosComResultado, comparacaoMensal, resumoPorAno, type AreaSources } from './areas'
import type { GoalEntryEntity } from './types'

const lancamento = (ano: number, mes: number, amount: number): GoalEntryEntity => ({
  id: `${ano}-${mes}`, churchId: 'igreja-1', metric: 'baptisms',
  date: `${ano}-${String(mes).padStart(2, '0')}-01`, amount, source: 'pdf', reference: '', createdAt: '',
})

const fontes = (entries: GoalEntryEntity[]): AreaSources => ({ entries, studies: [], uapgs: [], history: [] })

describe('comparação do mesmo período entre dois anos', () => {
  it('compara janeiro-a-agosto com janeiro-a-agosto, e não com o ano inteiro', () => {
    // Era a comparação que a tela fazia, e ela mente: doze meses do ano passado
    // contra oito do ano corrente parece queda enorme e pode ser crescimento.
    const anoPassadoInteiro = Array.from({ length: 12 }, (_, indice) => lancamento(2025, indice + 1, 10))
    const esteAno = [lancamento(2026, 1, 12), lancamento(2026, 8, 12)]

    const comparacao = comparacaoMensal('baptisms', fontes([...anoPassadoInteiro, ...esteAno]), 2026)

    expect(comparacao.ateOMes).toBe(8)
    expect(comparacao.acumuladoAtual).toBe(24)
    // Oito meses do ano passado, não os doze.
    expect(comparacao.acumuladoAnterior).toBe(80)
    expect(comparacao.variacao).toBe(-70)
  })

  it('o período para no último mês com resultado, não no mês do calendário', () => {
    // Um relatório enviado até agosto não diz nada sobre setembro; contar
    // setembro como zero inventaria uma queda que ninguém mediu.
    const comparacao = comparacaoMensal('baptisms', fontes([
      lancamento(2025, 9, 50), lancamento(2026, 3, 7),
    ]), 2026)

    expect(comparacao.ateOMes).toBe(3)
    expect(comparacao.acumuladoAnterior).toBe(0)
  })

  it('devolve os doze meses dos dois anos, lado a lado', () => {
    const comparacao = comparacaoMensal('baptisms', fontes([lancamento(2025, 4, 5), lancamento(2026, 4, 9)]), 2026)

    expect(comparacao.meses).toHaveLength(12)
    expect(comparacao.meses[3]).toEqual({ mes: 4, atual: 9, anterior: 5 })
    expect(comparacao.meses[0]).toEqual({ mes: 1, atual: 0, anterior: 0 })
  })

  it('sem ano anterior, não inventa porcentagem', () => {
    const comparacao = comparacaoMensal('baptisms', fontes([lancamento(2026, 2, 3)]), 2026)

    expect(comparacao.variacao).toBeNull()
    expect(comparacao.acumuladoAnterior).toBe(0)
  })

  it('crescimento aparece como número positivo', () => {
    const comparacao = comparacaoMensal('baptisms', fontes([lancamento(2025, 1, 10), lancamento(2026, 1, 15)]), 2026)

    expect(comparacao.variacao).toBe(50)
  })
})

describe('comparar com anos anteriores', () => {
  it('lista os anos que já têm resultado, do mais recente para o mais antigo', () => {
    // O pastor pode chegar com quatro anos de distrito e enviar os relatórios
    // antigos. Saber quais anos entraram é o que permite escolher.
    const fontesComHistorico = fontes([
      lancamento(2026, 1, 5), lancamento(2025, 1, 10), lancamento(2023, 1, 8),
    ])

    expect(anosComResultado('baptisms', fontesComHistorico, 2026)).toEqual([2025, 2023])
  })

  it('não olha mais que cinco anos para trás', () => {
    // Um pastor fica no máximo cinco anos no distrito; guardar mais é guardar
    // o distrito de outra pessoa.
    const antigo = fontes([lancamento(2026, 1, 5), lancamento(2020, 1, 9)])

    expect(anosComResultado('baptisms', antigo, 2026)).toEqual([])
  })

  it('compara com o ano escolhido, e não só com o anterior', () => {
    const comHistorico = fontes([
      lancamento(2026, 3, 12), lancamento(2025, 3, 10), lancamento(2023, 3, 4),
    ])

    expect(comparacaoMensal('baptisms', comHistorico, 2026, 2023).acumuladoAnterior).toBe(4)
    expect(comparacaoMensal('baptisms', comHistorico, 2026, 2025).acumuladoAnterior).toBe(10)
  })
})

describe('todos os anos de uma vez', () => {
  const quatroAnos = fontes([
    lancamento(2022, 5, 40), lancamento(2022, 11, 57),
    lancamento(2025, 4, 60),
    lancamento(2026, 1, 3), lancamento(2026, 8, 31),
  ])

  it('devolve os doze meses de cada ano, com o total', () => {
    const anos = resumoPorAno('baptisms', quatroAnos, 2026)

    expect(anos.map(({ ano }) => ano)).toEqual([2022, 2025, 2026])
    expect(anos[0]?.meses).toHaveLength(12)
    expect(anos[0]?.total).toBe(97)
    expect(anos[2]?.total).toBe(34)
  })

  it('mostra os meses que ainda não chegaram, zerados', () => {
    // Um ano que termina em agosto não está terminado. Setembro a dezembro
    // zerados dizem que ainda vão acontecer — e é ali que o lançamento manual
    // entra depois.
    const anos = resumoPorAno('baptisms', quatroAnos, 2026)
    const atual = anos.find(({ ano }) => ano === 2026)

    expect(atual?.meses.slice(8)).toEqual([0, 0, 0, 0])
    expect(atual?.meses[0]).toBe(3)
    expect(atual?.meses[7]).toBe(31)
  })

  it('ano sem nenhum resultado não vira linha vazia', () => {
    expect(resumoPorAno('baptisms', quatroAnos, 2026).map(({ ano }) => ano)).not.toContain(2024)
  })
})
