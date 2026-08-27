import { afterEach, describe, expect, it, vi } from 'vitest'
import { downloadBudgetCsv, downloadBudgetPdf } from './export'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('relatórios locais do Orçamento Familiar', () => {
  it('aciona downloads locais de PDF e planilha com nomes próprios do módulo', () => {
    vi.useFakeTimers()
    const names: string[] = []
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:relatorio-ficticio'), revokeObjectURL })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { names.push(this.download) })

    downloadBudgetPdf('Orçamento Familiar', ['Resumo fictício'], '2026-08')
    downloadBudgetCsv([['Descrição', 'Valor'], ['Item fictício', '100.00']], '2026-08')

    expect(names).toEqual(['orcamento-familiar-2026-08.pdf', 'orcamento-familiar-2026-08.csv'])
    expect(document.querySelectorAll('a[download]')).toHaveLength(0)
    vi.runAllTimers()
    expect(revokeObjectURL).toHaveBeenCalledTimes(2)
  })
})
