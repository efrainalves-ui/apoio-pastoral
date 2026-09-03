import { freeText } from '../reports/redaction'
import { AGENDA_CATEGORY_LABELS, type AgendaEventEntity, type ItineraryItem } from './types'
import { mondayRestItems } from './service'

function latin(value: string): string {
  return value.normalize('NFC').replace(/[\\()]/gu, (character) => `\\${character}`).replace(/[^\x20-\xFF]/gu, '?')
}

function pdfDate(value: string, allDay: boolean): string {
  const date = new Date(value)
  return new Intl.DateTimeFormat('pt-BR', allDay ? { dateStyle: 'short' } : { dateStyle: 'short', timeStyle: 'short' }).format(date)
}

export function itineraryItems(events: AgendaEventEntity[], from: Date, to: Date, selectedIds: Set<string>, churchName?: (id: string | null) => string | undefined): ItineraryItem[] {
  const selected = events.filter((event) => selectedIds.has(event.id) && event.includeInItinerary && new Date(event.startAt) <= to && new Date(event.endAt) >= from).map((event) => ({ id: event.id, title: event.title, category: event.category, startAt: event.startAt, endAt: event.endAt, allDay: event.allDay, churchName: churchName?.(event.churchId), location: event.location, address: event.address }))
  return [...mondayRestItems(from, to), ...selected].sort((a, b) => a.startAt.localeCompare(b.startAt))
}

/**
 * O padrão é sair sem nomes: data, tipo e a igreja bastam para o itinerário.
 *
 * O título é escrito pelo pastor e pode conter o nome de quem será visitado.
 * O local e o endereço também são escritos por ele — "casa da irmã Fulana",
 * a rua e o número de uma família — e saíam sempre, mesmo com a caixa
 * desmarcada. Agora os três seguem a mesma regra; o nome da igreja fica,
 * porque igreja não é pessoa.
 */
export function buildItineraryPdf(items: ItineraryItem[], heading: string, includeNames = false): Uint8Array {
  const rows = [heading, 'Apoio Pastoral · itinerário selecionado', '', ...items.flatMap((item) => {
    const category = item.category === 'rest' ? 'Folga' : AGENDA_CATEGORY_LABELS[item.category]
    const lugar = [item.churchName, freeText(includeNames, item.location), freeText(includeNames, item.address)].filter(Boolean).join(' · ')
    return [`${pdfDate(item.startAt, item.allDay)} · ${category}`, ...(includeNames ? [item.title] : []), lugar, '']
  })]
  const pages: string[][] = []
  for (let index = 0; index < rows.length; index += 42) pages.push(rows.slice(index, index + 42))
  const objects: string[] = []
  const add = (body: string) => { objects.push(body); return objects.length }
  const fontId = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>')
  const pageIds: number[] = []; const pageBodies: Array<{ pageId: number; contentId: number }> = []
  for (const lines of pages) {
    const content = `BT\n/F1 12 Tf\n50 790 Td\n${lines.map((line, index) => `(${latin(line)}) Tj${index < lines.length - 1 ? '\n0 -17 Td' : ''}`).join('\n')}\nET`
    const contentId = add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`)
    const pageId = add('')
    pageIds.push(pageId); pageBodies.push({ pageId, contentId })
  }
  const pagesId = add('')
  for (const { pageId, contentId } of pageBodies) objects[pageId - 1] = `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`
  const catalogId = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`)
  let output = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'; const offsets = [0]
  objects.forEach((body, index) => { offsets.push(output.length); output += `${index + 1} 0 obj\n${body}\nendobj\n` })
  const xref = output.length
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n `).join('\n')}\ntrailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xref}\n%%EOF`
  return Uint8Array.from(output, (character) => character.charCodeAt(0))
}

export function downloadItineraryPdf(items: ItineraryItem[], heading: string, includeNames = false): void {
  const bytes = buildItineraryPdf(items, heading, includeNames)
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes).buffer], { type: 'application/pdf' }))
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = `itinerario-${new Date().toISOString().slice(0, 10)}.pdf`; anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
}
