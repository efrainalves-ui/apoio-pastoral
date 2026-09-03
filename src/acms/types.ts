/**
 * Relatório ACMS por igreja, lido de uma planilha no próprio aparelho.
 *
 * O que fica guardado são **números e nomes de igreja**, nunca a planilha. O
 * arquivo bruto não é gravado, não sobe para o serviço, não entra em backup e
 * não é usado em teste nenhum: ele é aberto na memória, mostrado em prévia e
 * descartado quando a aba fecha. É a diferença entre importar indicadores e
 * carregar consigo um arquivo cheio de dados de membros.
 */

export const ACMS_INDICATORS = ['sabbathSchool', 'attendance', 'smallGroups', 'uapg', 'bibleStudies', 'evangelism'] as const
export type AcmsIndicator = (typeof ACMS_INDICATORS)[number]

export const ACMS_INDICATOR_LABELS: Record<AcmsIndicator, string> = {
  sabbathSchool: 'Escola Sabatina',
  attendance: 'Presença',
  smallGroups: 'Pequenos Grupos',
  uapg: 'UAPG',
  bibleStudies: 'Estudos bíblicos',
  evangelism: 'Evangelismo',
}

/**
 * Rótulos que a planilha pode usar para cada indicador.
 *
 * A comparação é sem acento e sem caixa, por conter. Um modelo que escreva
 * "Estudos Bíblicos em andamento" continua sendo reconhecido; um que escreva
 * outra coisa não é adivinhado — a importação avisa e não traz nada.
 */
export const ACMS_INDICATOR_ALIASES: Record<AcmsIndicator, string[]> = {
  sabbathSchool: ['escola sabatina', 'es socios', 'socios es', 'membros es'],
  attendance: ['presenca', 'assistencia', 'frequencia'],
  smallGroups: ['pequenos grupos', 'pequeno grupo', 'pg', 'pgs'],
  uapg: ['uapg', 'uapgs', 'unidade de acao'],
  bibleStudies: ['estudos biblicos', 'estudo biblico', 'estudos'],
  evangelism: ['evangelismo', 'evangelistico', 'campanhas'],
}

/** Como a planilha nomeia a igreja. Sem isso não há relatório por igreja. */
export const ACMS_CHURCH_ALIASES = ['igreja', 'congregacao', 'unidade', 'campo']

/**
 * Um ponto estratégico é lido com o rótulo que a própria planilha usa.
 *
 * O aplicativo não inventa nomes para os quatro pontos: ele guarda o texto que
 * estava no cabeçalho. Chutar um nome seria escrever, no relatório do pastor,
 * uma palavra que a Associação não usou.
 */
export const ACMS_STRATEGIC_ALIASES = ['ponto estrategico', 'pontos estrategicos', 'estrategico', 'eixo']
export const ACMS_MAX_STRATEGIC = 4

export interface AcmsStrategicPoint { label: string; value: number }

export interface AcmsChurchRow {
  churchName: string
  indicators: Partial<Record<AcmsIndicator, number>>
  strategicPoints: AcmsStrategicPoint[]
}

/** O que a leitura entendeu do arquivo, antes de qualquer gravação. */
export interface AcmsPreview {
  sheetName: string
  /** Indicadores que a planilha trouxe, na ordem das colunas. */
  recognizedIndicators: AcmsIndicator[]
  strategicLabels: string[]
  rows: AcmsChurchRow[]
  /** Linhas ignoradas por não terem nome de igreja ou número nenhum. */
  ignoredRows: number
}

export interface AcmsReportData {
  /** Período escolhido pelo pastor, no formato `2026-T1`. */
  period: string
  importedAt: string
  sheetName: string
  recognizedIndicators: AcmsIndicator[]
  strategicLabels: string[]
  rows: AcmsChurchRow[]
  createdAt: string
  updatedAt: string
}
export type AcmsReportEntity = AcmsReportData & { id: string }

export interface AcmsTotals {
  churches: number
  indicators: Partial<Record<AcmsIndicator, number>>
  strategicPoints: AcmsStrategicPoint[]
}

/** Totais do distrito. Nomes de igreja entram; nomes de membro nunca existiram. */
export function acmsTotals(rows: AcmsChurchRow[]): AcmsTotals {
  const indicators: Partial<Record<AcmsIndicator, number>> = {}
  for (const indicador of ACMS_INDICATORS) {
    const valores = rows.map((linha) => linha.indicators[indicador]).filter((valor): valor is number => typeof valor === 'number')
    if (valores.length) indicators[indicador] = valores.reduce((total, valor) => total + valor, 0)
  }
  const porRotulo = new Map<string, number>()
  for (const linha of rows) {
    for (const ponto of linha.strategicPoints) porRotulo.set(ponto.label, (porRotulo.get(ponto.label) ?? 0) + ponto.value)
  }
  return {
    churches: rows.length,
    indicators,
    strategicPoints: [...porRotulo.entries()].map(([label, value]) => ({ label, value })),
  }
}

export interface AcmsComparisonLine {
  label: string
  before: number
  after: number
  difference: number
}

/** Compara dois períodos já importados neste aparelho. */
export function compareAcms(antes: AcmsReportData, depois: AcmsReportData): AcmsComparisonLine[] {
  const totaisAntes = acmsTotals(antes.rows)
  const totaisDepois = acmsTotals(depois.rows)
  const linhas: AcmsComparisonLine[] = []
  for (const indicador of ACMS_INDICATORS) {
    const before = totaisAntes.indicators[indicador]
    const after = totaisDepois.indicators[indicador]
    if (before === undefined && after === undefined) continue
    linhas.push({ label: ACMS_INDICATOR_LABELS[indicador], before: before ?? 0, after: after ?? 0, difference: (after ?? 0) - (before ?? 0) })
  }
  const rotulos = new Set([...totaisAntes.strategicPoints, ...totaisDepois.strategicPoints].map(({ label }) => label))
  for (const label of rotulos) {
    const before = totaisAntes.strategicPoints.find((ponto) => ponto.label === label)?.value ?? 0
    const after = totaisDepois.strategicPoints.find((ponto) => ponto.label === label)?.value ?? 0
    linhas.push({ label, before, after, difference: after - before })
  }
  return linhas
}
