import { describe, expect, it } from 'vitest'
import { ArquivoNaoReconhecidoError, numeroDaCelula, parseAcmsSheets } from './parser'
import { acmsTotals, compareAcms, type AcmsReportData } from './types'
import { columnIndex } from './xlsx'

/**
 * Fixtures **inteiramente inventadas**.
 *
 * A planilha real do ACMS nunca entra em teste, nem no repositório, nem na
 * documentação. Estas linhas foram escritas aqui, com igrejas que não existem
 * e números redondos — é o bastante para provar a leitura, e é o único tipo de
 * dado que pode viver em um arquivo versionado.
 */
const cabecalho = ['Igreja', 'Escola Sabatina', 'Presença', 'Pequenos Grupos', 'UAPG', 'Estudos bíblicos', 'Evangelismo', 'Ponto estratégico 1', 'Ponto estratégico 2']
const planilhaFicticia = {
  nome: 'Relatório Fictício',
  linhas: [
    ['Relatório trimestral fictício', '', ''],
    cabecalho,
    ['Central Fictícia', '120', '95', '4', '2', '18', '3', '10', '7'],
    ['Grupo Fictício do Norte', '40', '31', '2', '1', '6', '1', '4', '2'],
    ['Ponto Fictício do Sul', '18', '15', '1', '0', '3', '0', '2', '1'],
    ['Total', '178', '141', '7', '3', '27', '4', '16', '10'],
    ['', '', '', '', '', '', '', '', ''],
  ],
}

describe('leitura de números da planilha', () => {
  it('aceita o número escrito em português e o escrito em inglês', () => {
    expect(numeroDaCelula('1.234,50')).toBe(1234.5)
    expect(numeroDaCelula('1234.5')).toBe(1234.5)
    expect(numeroDaCelula('42')).toBe(42)
    expect(numeroDaCelula('87%')).toBe(87)
  })

  it('devolve nulo para o que não é número', () => {
    for (const texto of ['', '  ', 'sim', 'n/a', '—']) expect(numeroDaCelula(texto)).toBeNull()
  })

  it('converte a referência de coluna em índice', () => {
    expect(columnIndex('A1')).toBe(0)
    expect(columnIndex('C7')).toBe(2)
    expect(columnIndex('AA1')).toBe(26)
  })
})

describe('relatório ACMS por igreja', () => {
  it('reconhece o modelo e extrai só indicadores numéricos', () => {
    const previa = parseAcmsSheets([planilhaFicticia])

    expect(previa.sheetName).toBe('Relatório Fictício')
    expect(previa.recognizedIndicators).toEqual(['sabbathSchool', 'attendance', 'smallGroups', 'uapg', 'bibleStudies', 'evangelism'])
    expect(previa.strategicLabels).toEqual(['Ponto estratégico 1', 'Ponto estratégico 2'])
    expect(previa.rows.map(({ churchName }) => churchName)).toEqual(['Central Fictícia', 'Grupo Fictício do Norte', 'Ponto Fictício do Sul'])
    expect(previa.rows[0]?.indicators).toEqual({ sabbathSchool: 120, attendance: 95, smallGroups: 4, uapg: 2, bibleStudies: 18, evangelism: 3 })
  })

  it('não conta a linha de total como se fosse uma igreja', () => {
    // Somar o total junto das igrejas dobraria todos os números do distrito.
    const previa = parseAcmsSheets([planilhaFicticia])

    expect(previa.rows).toHaveLength(3)
    expect(acmsTotals(previa.rows).indicators.sabbathSchool).toBe(178)
  })

  it('lê o rótulo do ponto estratégico da própria planilha', () => {
    // O aplicativo não inventa nome para os pontos: usa o que veio escrito.
    const comOutroRotulo = {
      nome: 'Aba Fictícia',
      linhas: [cabecalho.map((texto) => texto.replace('Ponto estratégico 1', 'Eixo fictício de comunhão')), planilhaFicticia.linhas[2]!],
    }
    const previa = parseAcmsSheets([comOutroRotulo])

    expect(previa.strategicLabels).toContain('Eixo fictício de comunhão')
  })

  it('aceita o cabeçalho escrito de outro jeito, sem acento e com outra caixa', () => {
    const variacao = {
      nome: 'Aba Fictícia',
      linhas: [
        ['CONGREGACAO', 'ESCOLA SABATINA', 'PG', 'ESTUDOS BIBLICOS'],
        ['Central Fictícia', '10', '2', '5'],
      ],
    }
    const previa = parseAcmsSheets([variacao])

    expect(previa.recognizedIndicators).toEqual(['sabbathSchool', 'smallGroups', 'bibleStudies'])
    expect(previa.rows[0]?.indicators).toEqual({ sabbathSchool: 10, smallGroups: 2, bibleStudies: 5 })
  })

  it('procura o cabeçalho em outra aba quando a primeira não serve', () => {
    const previa = parseAcmsSheets([{ nome: 'Capa', linhas: [['Relatório', 'fictício']] }, planilhaFicticia])

    expect(previa.sheetName).toBe('Relatório Fictício')
  })

  it('recusa e explica quando o formato não é reconhecido', () => {
    const outraPlanilha = { nome: 'Aba Fictícia', linhas: [['Nome', 'Telefone'], ['Pessoa Fictícia', '(61) 90000-0000']] }

    expect(() => parseAcmsSheets([outraPlanilha])).toThrow(ArquivoNaoReconhecidoError)
    expect(() => parseAcmsSheets([outraPlanilha])).toThrow(/Nada foi importado/u)
  })

  it('recusa quando há coluna de igreja mas colunas reconhecidas de menos', () => {
    // Uma planilha qualquer com uma coluna "Igreja" não vira relatório do
    // distrito por coincidência.
    const quaseIsso = { nome: 'Aba Fictícia', linhas: [['Igreja', 'Escola Sabatina', 'Observação'], ['Central Fictícia', '10', 'nada']] }

    expect(() => parseAcmsSheets([quaseIsso])).toThrow(ArquivoNaoReconhecidoError)
  })

  it('recusa quando o cabeçalho serve mas nenhuma linha tem igreja e número', () => {
    const semLinhas = { nome: 'Aba Fictícia', linhas: [cabecalho, ['', '', '', '', '', '', '', '', ''], ['Central Fictícia', 'x', 'y', 'z', '', '', '', '', '']] }

    expect(() => parseAcmsSheets([semLinhas])).toThrow(/nenhuma linha tinha igreja e número/u)
  })
})

describe('totais e comparação entre períodos', () => {
  const relatorio = (period: string, sabbathSchool: number, estrategico: number): AcmsReportData => ({
    period, importedAt: '2026-09-30T00:00:00.000Z', sheetName: 'Relatório Fictício',
    recognizedIndicators: ['sabbathSchool'], strategicLabels: ['Ponto estratégico 1'],
    rows: [{ churchName: 'Central Fictícia', indicators: { sabbathSchool }, strategicPoints: [{ label: 'Ponto estratégico 1', value: estrategico }] }],
    createdAt: '2026-09-30T00:00:00.000Z', updatedAt: '2026-09-30T00:00:00.000Z',
  })

  it('soma o distrito sem citar ninguém além das igrejas', () => {
    const totais = acmsTotals(parseAcmsSheets([planilhaFicticia]).rows)

    expect(totais.churches).toBe(3)
    expect(totais.indicators.bibleStudies).toBe(27)
    expect(totais.strategicPoints).toEqual([{ label: 'Ponto estratégico 1', value: 16 }, { label: 'Ponto estratégico 2', value: 10 }])
  })

  it('compara dois períodos importados e mostra a diferença', () => {
    const linhas = compareAcms(relatorio('2026-T1', 100, 5), relatorio('2026-T2', 130, 4))

    expect(linhas).toContainEqual({ label: 'Escola Sabatina', before: 100, after: 130, difference: 30 })
    expect(linhas).toContainEqual({ label: 'Ponto estratégico 1', before: 5, after: 4, difference: -1 })
  })
})
