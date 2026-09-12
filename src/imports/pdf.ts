import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { toBase64Url } from '../crypto/encoding'

const MAX_PDF_SIZE = 20 * 1024 * 1024

export interface PdfLayoutItem { text: string; x: number; y: number }
export interface PdfLayoutPage { width: number; height: number; items: PdfLayoutItem[]; pagina?: number }

interface LayoutRow { y: number; items: PdfLayoutItem[] }

function normalizeLabel(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/gu, '').replace(/[^A-Za-z0-9]+/gu, ' ').trim().toLocaleLowerCase('pt-BR')
}

function layoutRows(page: PdfLayoutPage): LayoutRow[] {
  const rows: LayoutRow[] = []
  for (const item of [...page.items].sort((left, right) => right.y - left.y || left.x - right.x)) {
    const row = rows.find((candidate) => Math.abs(candidate.y - item.y) <= 2)
    if (row) row.items.push(item)
    else rows.push({ y: item.y, items: [item] })
  }
  return rows.sort((left, right) => right.y - left.y).map((row) => ({ ...row, items: row.items.sort((left, right) => left.x - right.x) }))
}

function rowText(items: PdfLayoutItem[], minimumX = Number.NEGATIVE_INFINITY, maximumX = Number.POSITIVE_INFINITY): string {
  return items.filter(({ x }) => x >= minimumX && x < maximumX).map(({ text }) => text.trim()).filter(Boolean).join(' ').replace(/\s+/gu, ' ').trim()
}

function memberLayoutText(pages: PdfLayoutPage[]): string | null {
  const output: string[] = []
  let recognizedPages = 0
  for (const page of pages) {
    const rows = layoutRows(page)
    const header = rows.find(({ items }) => items.some(({ text, x }) => normalizeLabel(text) === 'membros' && x > page.width * 0.72))
    if (!header) continue
    const church = rowText(header.items, 0, page.width * 0.67)
    if (!church) continue
    output.push(`IGREJA: ${church}`)
    recognizedPages += 1
    for (const row of rows) {
      for (const date of row.items.filter(({ text, x }) => /^\d{2}\/\d{2}\/\d{4}$/u.test(text.trim()) && ((x > page.width * 0.32 && x < page.width * 0.46) || (x > page.width * 0.80 && x < page.width * 0.91)))) {
        const columnStart = date.x > page.width * 0.7 ? page.width * 0.47 : page.width * 0.02
        const name = rowText(row.items, columnStart, date.x - 2)
        if (name) output.push(`${name} | ${date.text.trim()}`)
      }
    }
  }
  return recognizedPages > 0 ? output.join('\n') : null
}

function fidelityLayoutText(pages: PdfLayoutPage[]): string | null {
  const output: string[] = []
  let currentChurch = ''
  let currentRange: 'FAIXA_8_12' | 'FAIXA_1_7' | 'CATEGORIA_NAO_DIZIMISTA' | '' = ''
  let recognizedPages = 0
  for (const page of pages) {
    const rows = layoutRows(page)
    if (!rows.some(({ items }) => { const label = normalizeLabel(rowText(items)); return label.includes('fidelidade') && label.includes('igreja') })) continue
    const rightHeaders = rows.filter(({ y }) => y > page.height * 0.88).map(({ items }) => rowText(items, page.width * 0.67)).filter(Boolean)
    const church = rightHeaders[1]
    if (!church) continue
    if (church !== currentChurch) { currentChurch = church; currentRange = '' }
    output.push(`IGREJA: ${church}`)
    recognizedPages += 1
    for (const row of rows) {
      const label = normalizeLabel(rowText(row.items))
      if (label.includes('membros de 8 para 12 transacoes')) { currentRange = 'FAIXA_8_12'; continue }
      if (label.includes('membros de 1 para 7 transacoes')) { currentRange = 'FAIXA_1_7'; continue }
      if (label.includes('membros sem registro')) { currentRange = 'CATEGORIA_NAO_DIZIMISTA'; continue }
      if (!currentRange) continue
      const hasAgeCell = row.items.some(({ text, x }) => /^\d{1,3}$/u.test(text.trim()) && x > page.width * 0.40 && x < page.width * 0.51)
      if (!hasAgeCell) continue
      const name = rowText(row.items, page.width * 0.02, page.width * 0.25)
      if (name) output.push(`${name} | ${currentRange}`)
    }
  }
  return recognizedPages > 0 ? output.join('\n') : null
}

/**
 * O relatório "Dízimo e Oferta Online", do sistema da Associação.
 *
 * É outra fonte sobre a mesma pergunta — quem devolve o dízimo —, e chega com
 * outro formato: lançamento a lançamento, agrupado por data de capitação, com
 * dízimo e ofertas misturados. Ofertas não entram na fidelidade; só o dízimo.
 *
 * O nome vem cortado na largura da coluna. Não dá para consertar isso aqui: o
 * PDF não guarda o resto. Quem resolve é a revisão manual, adiante.
 */
function dizimoOnlineLayoutText(pages: PdfLayoutPage[]): string | null {
  const saida: string[] = []
  let reconhecidas = 0
  let capitacao = ''
  for (const page of pages) {
    const rows = layoutRows(page)
    const titulo = rows.find(({ items }) => {
      const rotulo = normalizeLabel(rowText(items))
      return rotulo.includes('dizimo') && rotulo.includes('oferta') && rotulo.includes('online')
    })
    const periodo = rows
      .map(({ items }) => rowText(items).match(/(\d{2}\/\d{2}\/\d{4})\s*at[ée]\s*(\d{2}\/\d{2}\/\d{4})/u))
      .find(Boolean)
    if (!titulo && !reconhecidas) continue
    reconhecidas += 1
    if (periodo) saida.push(`PERIODO: ${periodo[1]} ${periodo[2]}`)

    for (let posicao = 0; posicao < rows.length; posicao += 1) {
      const linha = rows[posicao]!
      const texto = rowText(linha.items)
      const cabecalho = texto.match(/Capita[çc][ãa]o:\s*(\d{2}\/\d{2}\/\d{4})/u)
      if (cabecalho) { capitacao = cabecalho[1]!; continue }
      if (normalizeLabel(rowText(linha.items, 0, page.width * 0.10)) !== 'pago') continue

      const igreja = rowText(linha.items, page.width * 0.10, page.width * 0.30)
      const nome = rowText(linha.items, page.width * 0.30, page.width * 0.55)
      const remessa = rowText(linha.items, page.width * 0.55, page.width * 0.70).match(/(\d{2})\/(\d{4})/u)
      // O tipo do lançamento mora na linha de baixo, ao lado da quantidade.
      const abaixo = rows[posicao + 1]
      const tipo = abaixo ? rowText(abaixo.items, page.width * 0.20, page.width * 0.40) : ''
      if (!igreja || !nome || !tipo) continue

      const mes = remessa ? `${remessa[2]}-${remessa[1]}` : capitacao ? `${capitacao.slice(6)}-${capitacao.slice(3, 5)}` : ''
      if (!mes) continue
      const ehDizimo = normalizeLabel(tipo) === 'dizimo'
      saida.push(`${igreja} | ${nome} | ${mes} | ${ehDizimo ? 'DIZIMO' : 'OFERTA'}`)
    }
  }
  return reconhecidas > 0 && saida.some((linha) => linha.includes('| DIZIMO')) ? `DIZIMO_ONLINE\n${saida.join('\n')}` : null
}

/**
 * O Relatório Integrado do trimestre.
 *
 * Cada igreja ocupa exatamente três páginas, e o nome dela é a quarta linha da
 * primeira — abaixo do distrito, do título e do trimestre, que se repetem em
 * todas. A sede escreve "- Sede Anpa"; as demais, "- Anpa".
 *
 * Três formas de resposta convivem: um valor só, a quebra por classe da Escola
 * Sabatina e a quebra por sábado da Secretaria. O traço é preservado como
 * traço: quem decide que "não informado" não é zero é quem lê, não quem extrai.
 */
function relatorioIntegradoLayoutText(pages: PdfLayoutPage[]): string | null {
  const saida: string[] = []
  let igreja = ''
  let classes: string[] | null = null
  let reconhecidas = 0

  for (const page of pages) {
    const rows = layoutRows(page)
    const topo = rows.slice(0, 4).map(({ items }) => rowText(items))
    if (!topo.some((linha) => normalizeLabel(linha).includes('relatorio integrado'))) continue
    reconhecidas += 1

    const trimestre = topo.map((linha) => linha.match(/^(\d)\s*Trimestre-(\d{4})$/u)).find(Boolean)
    if (trimestre) saida.push(`TRIMESTRE|${trimestre[2]}-${trimestre[1]}`)

    if ((page.pagina ?? 0) % 3 === 1 || (!igreja && topo[3])) {
      const cabecalho = topo[3] ?? ''
      if (/Anpa$/u.test(cabecalho)) {
        igreja = cabecalho.replace(/\s*-\s*(Sede\s+)?Anpa$/u, '').trim()
        saida.push(`IGREJA|${page.pagina ?? 0}|${igreja}`)
        classes = null
      }
    }

    for (const row of rows) {
      const celulas = row.items.map(({ text }) => text.trim()).filter(Boolean)
      if (!celulas.length) continue
      const plano = celulas.join(' ')
      // O título é uma linha inteira, não um trecho: "As respostas do relatório
      // integrado foram analisadas na Comissão Diretiva?" é pergunta, não título.
      if (plano.includes('PAGE:') || normalizeLabel(plano) === 'relatorio integrado') continue
      if (topo.includes(plano)) continue

      if (celulas[0] === 'Bebês' || celulas[0] === 'Infantis') {
        if (celulas.at(-1) === 'Total') { classes = celulas; continue }
      }
      // "Segundo Sábado | Sétimo Sábado" é cabeçalho de coluna da Secretaria, e
      // não uma pergunta: sem isto o primeiro vira rótulo e o segundo, resposta.
      if (celulas.length === 2 && normalizeLabel(celulas[0] ?? '').endsWith('sabado') && normalizeLabel(celulas[1] ?? '').endsWith('sabado')) continue
      if (celulas.length < 2) continue

      const [rotulo, ...valores] = celulas as [string, ...string[]]
      if (rotulo.includes('|')) continue
      if (classes && valores.length === classes.length) {
        saida.push(`C|${page.pagina ?? 0}|${rotulo}|${valores.join(';')}|${classes.join(',')}`)
      } else if (valores.length === 2) {
        saida.push(`S|${page.pagina ?? 0}|${rotulo}|${valores.join(';')}`)
      } else if (valores.length === 1) {
        saida.push(`V|${page.pagina ?? 0}|${rotulo}|${valores[0]}`)
      }
    }
  }
  return reconhecidas > 0 && saida.some((linha) => linha.startsWith('IGREJA|'))
    ? `RELATORIO_INTEGRADO\n${saida.join('\n')}`
    : null
}

export function normalizePdfLayout(pages: PdfLayoutPage[]): string {
  return memberLayoutText(pages) ?? relatorioIntegradoLayoutText(pages) ?? dizimoOnlineLayoutText(pages) ?? fidelityLayoutText(pages) ?? pages.map((page) => layoutRows(page).map(({ items }) => rowText(items)).join('\n')).join('\n')
}

export function validatePdfFile(file: Pick<File, 'name' | 'size' | 'type'>): void {
  if (!file.name.toLocaleLowerCase('pt-BR').endsWith('.pdf') || (file.type && file.type !== 'application/pdf')) throw new Error('Selecione um arquivo PDF válido.')
  if (file.size === 0) throw new Error('O PDF está vazio.')
  if (file.size > MAX_PDF_SIZE) throw new Error('O PDF excede o limite local de 20 MB.')
}

export async function pdfHash(bytes: ArrayBuffer): Promise<string> {
  return toBase64Url(await crypto.subtle.digest('SHA-256', bytes))
}

export async function extractPdfText(bytes: ArrayBuffer): Promise<string> {
  try {
    const { GlobalWorkerOptions, getDocument } = await import('pdfjs-dist')
    GlobalWorkerOptions.workerSrc = pdfWorkerUrl
    const loadingTask = getDocument({ data: new Uint8Array(bytes) })
    const document = await loadingTask.promise
    const pages: PdfLayoutPage[] = []
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber)
      const content = await page.getTextContent()
      const viewport = page.getViewport({ scale: 1 })
      const items: PdfLayoutItem[] = []
      for (const item of content.items) {
        const textItem = item as unknown as { str?: unknown; transform?: unknown }
        if (typeof textItem.str !== 'string' || !Array.isArray(textItem.transform)) continue
        const x: unknown = textItem.transform[4]; const y: unknown = textItem.transform[5]
        if (typeof x !== 'number' || typeof y !== 'number') continue
        items.push({ text: textItem.str, x, y })
      }
      // O número da página vai junto: o Relatório Integrado agrupa por igreja a
      // cada três páginas, e a conferência precisa dizer de onde o valor veio.
      pages.push({ width: viewport.width, height: viewport.height, items, pagina: pageNumber })
      page.cleanup()
    }
    await loadingTask.destroy()
    const text = normalizePdfLayout(pages)
    if (!text.trim()) throw new Error('O PDF parece escaneado e não contém texto selecionável. Gere uma versão com OCR.')
    return text
  } catch (error) {
    if (error instanceof Error && (error.message.includes('OCR') || error.message.includes('texto selecionável'))) throw error
    throw new Error('Não foi possível ler este PDF. Verifique se o arquivo não está vazio, corrompido ou protegido por senha.', { cause: error })
  }
}
