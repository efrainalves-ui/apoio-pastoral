import { describe, expect, it } from 'vitest'
import { crescimentoDaMeta, type AreaSources } from './areas'
import type { GoalEntity } from './types'

const lancamento = (ano: number, mes: number, amount: number) => ({
  id: `${ano}-${mes}`, churchId: 'igreja-1', metric: 'tithes' as const,
  date: `${ano}-${String(mes).padStart(2, '0')}-01`, amount, source: 'pdf' as const, reference: '', createdAt: '',
})

const fontes = (anterior: number[], atual: number[]): AreaSources => ({
  studies: [], uapgs: [], history: [],
  entries: [
    ...anterior.map((valor, indice) => lancamento(2025, indice + 1, valor)),
    ...atual.map((valor, indice) => lancamento(2026, indice + 1, valor)),
  ].filter(({ amount }) => amount > 0),
})

const meta = (target: number): GoalEntity[] => [{
  id: 'meta-1', churchId: null, year: 2026, metric: 'tithes', target, targetKind: 'percent', createdAt: '', updatedAt: '',
}]

describe('a meta de crescimento medida em porcentagem', () => {
  it('diz quanto se cresceu e quantos pontos faltam para o alvo', () => {
    // Os números reais do distrito: 477.424 em 2025 e 517.096 em 2026, de
    // janeiro a agosto, contra uma meta de trinta por cento.
    const crescimento = crescimentoDaMeta('tithes', meta(30), fontes([477424], [517096]), 2026)

    expect(crescimento.alvo).toBe(30)
    expect(crescimento.alcancado).toBeCloseTo(8.31, 1)
    expect(crescimento.falta).toBeCloseTo(21.69, 1)
    expect(crescimento.percentDaMeta).toBe(28)
  })

  it('corta o ano anterior no mês em que o atual parou', () => {
    // Oito meses contra doze inventariam uma queda que não existe.
    const crescimento = crescimentoDaMeta('tithes', meta(10), fontes([100, 100, 100, 100], [110, 110]), 2026)

    expect(crescimento.ateOMes).toBe(2)
    expect(crescimento.anterior).toBe(200)
    expect(crescimento.alcancado).toBeCloseTo(10)
  })

  it('sem ano anterior não inventa progresso', () => {
    const crescimento = crescimentoDaMeta('tithes', meta(30), fontes([], [517096]), 2026)

    expect(crescimento.alcancado).toBeNull()
    expect(crescimento.falta).toBe(30)
    expect(crescimento.percentDaMeta).toBe(0)
  })

  it('queda aparece como negativa, e a barra não recua para trás', () => {
    const crescimento = crescimentoDaMeta('tithes', meta(30), fontes([200], [150]), 2026)

    expect(crescimento.alcancado).toBeCloseTo(-25)
    expect(crescimento.falta).toBeCloseTo(55)
    expect(crescimento.percentDaMeta).toBe(0)
  })
})
