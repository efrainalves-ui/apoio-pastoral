import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { toBase64Url } from '../crypto/encoding'

const MAX_PDF_SIZE = 20 * 1024 * 1024

export interface PdfLayoutItem { text: string; x: number; y: number }
export interface PdfLayoutPage { width: number; height: number; items: PdfLayoutItem[] }

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

export function normalizePdfLayout(pages: PdfLayoutPage[]): string {
  return memberLayoutText(pages) ?? fidelityLayoutText(pages) ?? pages.map((page) => layoutRows(page).map(({ items }) => rowText(items)).join('\n')).join('\n')
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
      pages.push({ width: viewport.width, height: viewport.height, items })
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
