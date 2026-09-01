import { fidelityCategory } from '../people/types'
import type { ParsedDistrictList, ParsedFidelityRow, ParsedMemberRow } from './types'

export class ImportFormatError extends Error {}

function cleanLines(text: string): string[] {
  return text.replaceAll('\u00a0', ' ').split(/\r?\n/u).map((line) => line.replace(/\s+/gu, ' ').trim()).filter(Boolean)
}

function parseBrazilianDate(value: string): { date: string | null; review: boolean } {
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/u)
  if (!match) return { date: null, review: true }
  const [, day = '', month = '', year = ''] = match
  if (year === '1800') return { date: null, review: true }
  const iso = `${year}-${month}-${day}`
  const parsed = new Date(`${iso}T12:00:00`)
  const valid = !Number.isNaN(parsed.getTime()) && parsed.getUTCFullYear() === Number(year) && parsed.getUTCMonth() + 1 === Number(month) && parsed.getUTCDate() === Number(day)
  return { date: valid ? iso : null, review: !valid }
}

function headerChurch(line: string): string | null {
  const match = line.match(/^(?:IGREJA|UNIDADE|GRUPO|PONTO DE PREGA[CÇ][AÃ]O)\s*[:-]\s*(.+)$/iu)
  return match?.[1] ? normalizePdfChurchName(match[1]) : null
}

/** PDF reports append district and association after the church name. */
export function normalizePdfChurchName(value: string): string {
  return value.split('-')[0]!.trim()
}

export function parseMemberText(text: string): ParsedMemberRow[] {
  const lines = cleanLines(text)
  if (lines.length === 0) throw new ImportFormatError('O PDF está vazio ou não contém texto selecionável. Se for escaneado, gere uma versão com OCR.')
  const rows: ParsedMemberRow[] = []
  let currentChurch = ''
  for (const line of lines) {
    const header = headerChurch(line)
    if (header) { currentChurch = header; continue }
    const separated = line.split(/\s*[;|\t]\s*/u)
    if (separated.length >= 2 && /^\d{2}\/\d{2}\/\d{4}$/u.test(separated.at(-1) ?? '')) {
      const explicitChurch = separated.length >= 3
      const churchName = explicitChurch ? normalizePdfChurchName(separated[0]!) : currentChurch
      const name = explicitChurch ? separated.slice(1, -1).join(' ') : separated.slice(0, -1).join(' ')
      if (!churchName) continue
      const parsed = parseBrazilianDate(separated.at(-1)!)
      rows.push({ churchName, name: name.trim(), birthDate: parsed.date, needsReview: parsed.review || /\d/u.test(name) })
      continue
    }
    if (!currentChurch) continue
    const matches = [...line.matchAll(/([A-Za-zÀ-ÖØ-öø-ÿ'´`.-][A-Za-zÀ-ÖØ-öø-ÿ0-9'´`.\- ]{2,}?)\s+(\d{2}\/\d{2}\/\d{4})(?=\s{2,}|$)/gu)]
    for (const match of matches) {
      const name = match[1]!.trim(); const parsed = parseBrazilianDate(match[2]!)
      rows.push({ churchName: currentChurch, name, birthDate: parsed.date, needsReview: parsed.review || /\d/u.test(name) })
    }
  }
  if (rows.length === 0) throw new ImportFormatError('O formato do PDF não foi reconhecido. Nenhuma pessoa será alterada.')
  return rows
}

/**
 * Lista colada ou vinda de um .docx, para uma igreja escolhida na tela. Aceita
 * "Nome; 01/02/1990", "Nome 01/02/1990", "Nome, 1990-02-01" ou só o nome —
 * quem digita a lista não deve precisar acertar um formato exato.
 */
export function parsePastedMemberList(text: string, churchName: string): ParsedMemberRow[] {
  const igreja = churchName.trim()
  if (!igreja) throw new ImportFormatError('Escolha a igreja desta lista antes de conferir.')

  const rows: ParsedMemberRow[] = []
  for (const line of cleanLines(text)) {
    const semSeparador = line.replace(/\s*[;,|\t]\s*/gu, ' ').trim()
    if (!semSeparador) continue

    const comData = /^(.*?)[\s]+(\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2})$/u.exec(semSeparador)
    const nome = (comData ? comData[1] ?? '' : semSeparador).trim()
    if (!/\p{L}{2,}/u.test(nome)) continue

    let birthDate: string | null = null
    let review = false
    if (comData) {
      const bruto = comData[2]!
      if (bruto.includes('/')) {
        const parsed = parseBrazilianDate(bruto)
        birthDate = parsed.date
        review = parsed.review
      } else {
        const data = new Date(`${bruto}T00:00:00`)
        birthDate = Number.isNaN(data.getTime()) ? null : bruto
        review = birthDate === null
      }
    }

    rows.push({ churchName: igreja, name: nome, birthDate, needsReview: review || /\d/u.test(nome) })
  }

  if (rows.length === 0) throw new ImportFormatError('Nenhum nome foi reconhecido na lista. Nenhuma pessoa será alterada.')
  return rows
}

export function parseDistrictListText(text: string): ParsedDistrictList {
  const lines = cleanLines(text)
  const districtName = lines.map((line) => line.match(/^(?:DISTRITO|NOME DO DISTRITO)\s*[:-]\s*(.+)$/iu)?.[1]?.trim() ?? null).find(Boolean) ?? null
  const rows = parseMemberText(text)
  const recognized = new Set(rows.map(({ name, birthDate }) => `${name}|${birthDate ?? ''}`))
  const unparsedLines = lines.filter((line) => !/^(?:DISTRITO|NOME DO DISTRITO|IGREJA|UNIDADE|GRUPO|PONTO DE PREGA[CÇ][AÃ]O)\s*[:-]/iu.test(line) && !recognized.has(line.replace(/\s*[;|\t]\s*/gu, '|').replace(/\//gu, '-')) && /[A-Za-zÀ-ÖØ-öø-ÿ]/u.test(line)).slice(0, 30)
  return { districtName, rows, unparsedLines }
}

export function parseFidelityText(text: string): ParsedFidelityRow[] {
  const lines = cleanLines(text)
  if (lines.length === 0) throw new ImportFormatError('O PDF está vazio ou não contém texto selecionável. Se for escaneado, gere uma versão com OCR.')
  const rows: ParsedFidelityRow[] = []
  let currentChurch = ''
  for (const line of lines) {
    const header = headerChurch(line)
    if (header) { currentChurch = header; continue }
    const separated = line.split(/\s*[;|\t]\s*/u)
    const last = separated.at(-1) ?? ''
    const range = last === 'FAIXA_8_12' ? '8-12' : last === 'FAIXA_1_7' ? '1-7' : null
    if (range) {
      const churchName = separated.length >= 3 ? normalizePdfChurchName(separated[0]!) : currentChurch
      const name = separated.length >= 3 ? separated.slice(1, -1).join(' ') : separated.slice(0, -1).join(' ')
      if (churchName && name) rows.push({ churchName, name: name.trim(), months: null, range, category: range === '8-12' ? 'tither' : 'non_systematic_tither' })
      continue
    }
    const category = last === 'CATEGORIA_DIZIMISTA' || last === 'CATEGORIA_SISTEMATICO'
      ? 'tither'
      : last === 'CATEGORIA_DIZIMISTA_NAO_SISTEMATICO' || last === 'CATEGORIA_NAO_SISTEMATICO'
        ? 'non_systematic_tither'
        : last === 'CATEGORIA_NAO_DIZIMISTA' || last === 'CATEGORIA_SEM_REGISTRO'
          ? 'non_tither'
          : null
    if (category) {
      const churchName = separated.length >= 3 ? normalizePdfChurchName(separated[0]!) : currentChurch
      const name = separated.length >= 3 ? separated.slice(1, -1).join(' ') : separated.slice(0, -1).join(' ')
      if (churchName && name) rows.push({ churchName, name: name.trim(), months: null, category })
      continue
    }
    if (/^\d{1,2}$/u.test(last)) {
      const months = Number(last)
      const churchName = separated.length >= 3 ? normalizePdfChurchName(separated[0]!) : currentChurch
      const name = separated.length >= 3 ? separated.slice(1, -1).join(' ') : separated.slice(0, -1).join(' ')
      if (churchName && name && months >= 0 && months <= 12) rows.push({ churchName, name: name.trim(), months, category: fidelityCategory(months) })
      continue
    }
    if (!currentChurch) continue
    const match = line.match(/^(.+?)\s+(\d{1,2})$/u)
    if (match && Number(match[2]) <= 12) { const months = Number(match[2]); rows.push({ churchName: currentChurch, name: match[1]!.trim(), months, category: fidelityCategory(months) }) }
  }
  if (rows.length === 0) throw new ImportFormatError('O formato do PDF de fidelidade não foi reconhecido. Nenhuma informação será alterada.')
  return rows
}
