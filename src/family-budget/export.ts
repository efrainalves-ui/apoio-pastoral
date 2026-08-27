import { buildLocalReportPdf } from '../reports/localPdf'

function download(bytes: BlobPart[], type: string, name: string) {
  const url = URL.createObjectURL(new Blob(bytes, { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.hidden = true
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export function downloadBudgetPdf(title: string, lines: string[], month: string) {
  download([new Uint8Array(buildLocalReportPdf(title, lines)).buffer], 'application/pdf', `orcamento-familiar-${month}.pdf`)
}

export function downloadBudgetCsv(rows: string[][], month: string) {
  const csv = rows.map((row) => row.map((cell) => `"${cell.replace(/"/gu, '""')}"`).join(';')).join('\n')
  download([`\uFEFF${csv}`], 'text/csv;charset=utf-8', `orcamento-familiar-${month}.csv`)
}
