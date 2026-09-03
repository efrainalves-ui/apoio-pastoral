import { ArquivoNaoReconhecidoError, readXlsx, type PlanilhaLida } from './xlsx'
import {
  ACMS_CHURCH_ALIASES, ACMS_INDICATOR_ALIASES, ACMS_INDICATORS, ACMS_MAX_STRATEGIC, ACMS_STRATEGIC_ALIASES,
  type AcmsChurchRow, type AcmsIndicator, type AcmsPreview, type AcmsStrategicPoint,
} from './types'

export { ArquivoNaoReconhecidoError } from './xlsx'

/** Sem acento, sem caixa, sem espaço duplo: comparar rótulo é comparar sentido. */
function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/gu, '').toLowerCase().replace(/\s+/gu, ' ').trim()
}

/**
 * O rótulo contém o apelido como **palavra inteira**.
 *
 * Por conter, sem mais nada, `pg` casava dentro de `uapg` — e a coluna de UAPG
 * era engolida pela de Pequenos Grupos e sumia do relatório. Apelido curto
 * precisa de fronteira de palavra; apelido comprido continua funcionando igual.
 */
function combina(texto: string, apelidos: readonly string[]): boolean {
  return apelidos.some((apelido) => new RegExp(`(^|[^a-z0-9])${apelido.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}([^a-z0-9]|$)`, 'u').test(texto))
}

/**
 * Converte o texto de uma célula em número, aceitando o que a planilha traz.
 *
 * `1.234,50` e `1234.5` são o mesmo número escrito de dois jeitos; um relatório
 * gerado em português vem do primeiro jeito com frequência. Texto que não é
 * número devolve `null`, e a coluna simplesmente não entra.
 */
export function numeroDaCelula(texto: string): number | null {
  const limpo = texto.trim().replace(/%$/u, '')
  if (!limpo) return null
  const normalizado = /,\d{1,2}$/u.test(limpo) ? limpo.replace(/\./gu, '').replace(',', '.') : limpo.replace(/,/gu, '')
  if (!/^-?\d+(\.\d+)?$/u.test(normalizado)) return null
  const valor = Number(normalizado)
  return Number.isFinite(valor) ? valor : null
}

interface Cabecalho {
  linha: number
  colunaIgreja: number
  indicadores: Array<{ coluna: number; indicador: AcmsIndicator }>
  estrategicos: Array<{ coluna: number; rotulo: string }>
}

function acharCabecalho(linhas: string[][]): Cabecalho | null {
  for (const [indice, linha] of linhas.entries()) {
    const colunaIgreja = linha.findIndex((celula) => {
      const texto = normalizar(celula)
      return texto.length > 0 && combina(texto, ACMS_CHURCH_ALIASES)
    })
    if (colunaIgreja < 0) continue

    const indicadores: Cabecalho['indicadores'] = []
    const estrategicos: Cabecalho['estrategicos'] = []
    linha.forEach((celula, coluna) => {
      if (coluna === colunaIgreja) return
      const texto = normalizar(celula)
      if (!texto) return
      const indicador = ACMS_INDICATORS.find((chave) => combina(texto, ACMS_INDICATOR_ALIASES[chave]))
      if (indicador && !indicadores.some((item) => item.indicador === indicador)) {
        indicadores.push({ coluna, indicador })
        return
      }
      if (combina(texto, ACMS_STRATEGIC_ALIASES) && estrategicos.length < ACMS_MAX_STRATEGIC) {
        estrategicos.push({ coluna, rotulo: celula.trim() })
      }
    })

    if (indicadores.length || estrategicos.length) return { linha: indice, colunaIgreja, indicadores, estrategicos }
  }
  return null
}

/**
 * Quantas colunas reconhecidas bastam para chamar aquilo de relatório ACMS.
 *
 * Duas é pouco e três já é um padrão. O ponto de recusar cedo é este: uma
 * planilha qualquer com uma coluna "Igreja" não pode virar relatório do
 * distrito por coincidência.
 */
const MINIMO_RECONHECIDO = 3

/**
 * Lê a prévia da planilha. Não grava nada.
 *
 * Quando o formato não é reconhecido, o erro diz o que faltou — em vez de
 * importar meia dúzia de números de origem duvidosa e deixar o pastor
 * descobrir depois, no painel, que os totais não fecham.
 */
export function parseAcmsSheets(planilhas: PlanilhaLida[]): AcmsPreview {
  for (const planilha of planilhas) {
    const cabecalho = acharCabecalho(planilha.linhas)
    if (!cabecalho) continue
    const reconhecidas = cabecalho.indicadores.length + cabecalho.estrategicos.length
    if (reconhecidas < MINIMO_RECONHECIDO) continue

    const rows: AcmsChurchRow[] = []
    let ignoradas = 0
    for (const linha of planilha.linhas.slice(cabecalho.linha + 1)) {
      const churchName = (linha[cabecalho.colunaIgreja] ?? '').trim()
      if (!churchName) { if (linha.some((celula) => celula.trim())) ignoradas += 1; continue }
      // Uma linha de total não é uma igreja, e somar o total junto das igrejas
      // dobraria todos os números do distrito.
      if (/^(total|totais|soma|geral)\b/u.test(normalizar(churchName))) { ignoradas += 1; continue }

      const indicators: AcmsChurchRow['indicators'] = {}
      for (const { coluna, indicador } of cabecalho.indicadores) {
        const valor = numeroDaCelula(linha[coluna] ?? '')
        if (valor !== null) indicators[indicador] = valor
      }
      const strategicPoints: AcmsStrategicPoint[] = []
      for (const { coluna, rotulo } of cabecalho.estrategicos) {
        const valor = numeroDaCelula(linha[coluna] ?? '')
        if (valor !== null) strategicPoints.push({ label: rotulo, value: valor })
      }
      if (!Object.keys(indicators).length && !strategicPoints.length) { ignoradas += 1; continue }
      rows.push({ churchName, indicators, strategicPoints })
    }

    if (!rows.length) {
      throw new ArquivoNaoReconhecidoError('A planilha foi aberta, mas nenhuma linha tinha igreja e número ao mesmo tempo. Nada foi importado.')
    }
    return {
      sheetName: planilha.nome,
      recognizedIndicators: cabecalho.indicadores.map(({ indicador }) => indicador),
      strategicLabels: cabecalho.estrategicos.map(({ rotulo }) => rotulo),
      rows,
      ignoredRows: ignoradas,
    }
  }

  throw new ArquivoNaoReconhecidoError(
    'Este arquivo não tem o formato do relatório ACMS que o aplicativo lê: é preciso uma linha de cabeçalho com uma coluna de igreja e ao menos três colunas reconhecidas (Escola Sabatina, presença, PG, UAPG, estudos bíblicos, evangelismo ou pontos estratégicos). Nada foi importado.',
  )
}

/** Abre o arquivo escolhido e devolve a prévia. O arquivo não é guardado. */
export async function parseAcmsFile(arquivo: ArrayBuffer): Promise<AcmsPreview> {
  return parseAcmsSheets(await readXlsx(arquivo))
}
