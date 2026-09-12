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

/**
 * Lê o PDF e devolve, junto das pessoas, **as linhas que não viraram ninguém**.
 *
 * Antes essa segunda informação era adivinhada depois, remontando cada linha e
 * comparando com o que tinha sido lido. A remontagem escrevia a data como
 * `12-05-1990` e o que fora lido guardava `1990-05-12`: as duas nunca batiam, e
 * cada membro importado com sucesso era anunciado como linha não reconhecida.
 * Adivinhar o que já se sabe é como se erra sem perceber; aqui o próprio laço
 * marca a linha que produziu alguém.
 */
function lerMembros(text: string): { rows: ParsedMemberRow[]; naoAproveitadas: string[] } {
  const lines = cleanLines(text)
  if (lines.length === 0) throw new ImportFormatError('O PDF está vazio ou não contém texto selecionável. Se for escaneado, gere uma versão com OCR.')
  const rows: ParsedMemberRow[] = []
  const naoAproveitadas: string[] = []
  let currentChurch = ''
  for (const line of lines) {
    const header = headerChurch(line)
    if (header) { currentChurch = header; continue }
    const separated = line.split(/\s*[;|\t]\s*/u)
    if (separated.length >= 2 && /^\d{2}\/\d{2}\/\d{4}$/u.test(separated.at(-1) ?? '')) {
      const explicitChurch = separated.length >= 3
      const churchName = explicitChurch ? normalizePdfChurchName(separated[0]!) : currentChurch
      const name = explicitChurch ? separated.slice(1, -1).join(' ') : separated.slice(0, -1).join(' ')
      if (!churchName) { naoAproveitadas.push(line); continue }
      const parsed = parseBrazilianDate(separated.at(-1)!)
      rows.push({ churchName, name: name.trim(), birthDate: parsed.date, needsReview: parsed.review || /\d/u.test(name) })
      continue
    }
    if (!currentChurch) { naoAproveitadas.push(line); continue }
    const matches = [...line.matchAll(/([A-Za-zÀ-ÖØ-öø-ÿ'´`.-][A-Za-zÀ-ÖØ-öø-ÿ0-9'´`.\- ]{2,}?)\s+(\d{2}\/\d{2}\/\d{4})(?=\s{2,}|$)/gu)]
    if (matches.length === 0) { naoAproveitadas.push(line); continue }
    for (const match of matches) {
      const name = match[1]!.trim(); const parsed = parseBrazilianDate(match[2]!)
      rows.push({ churchName: currentChurch, name, birthDate: parsed.date, needsReview: parsed.review || /\d/u.test(name) })
    }
  }
  if (rows.length === 0) throw new ImportFormatError('O formato do PDF não foi reconhecido. Nenhuma pessoa será alterada.')
  return { rows, naoAproveitadas }
}

export function parseMemberText(text: string): ParsedMemberRow[] {
  return lerMembros(text).rows
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

/** Quantas linhas não reconhecidas a tela mostra. O resto entra só na contagem. */
export const AMOSTRA_NAO_RECONHECIDA = 30

export function parseDistrictListText(text: string): ParsedDistrictList {
  const lines = cleanLines(text)
  const districtName = lines.map((line) => line.match(/^(?:DISTRITO|NOME DO DISTRITO)\s*[:-]\s*(.+)$/iu)?.[1]?.trim() ?? null).find(Boolean) ?? null
  const { rows, naoAproveitadas } = lerMembros(text)
  // Linha sem uma letra sequer é numeração de página ou risco de tabela: não é
  // informação perdida, e anunciá-la só faria o aviso perder credibilidade.
  const naoReconhecidas = naoAproveitadas.filter((line) => /[A-Za-zÀ-ÖØ-öø-ÿ]/u.test(line))
  // O corte é da amostra que vai à tela, nunca da contagem. Cortar antes de
  // contar fazia o limite virar a resposta: um arquivo com 200 linhas perdidas
  // anunciava exatamente 30, e quem lia concluía que eram só os cabeçalhos.
  return { districtName, rows, unparsedLines: naoReconhecidas.slice(0, AMOSTRA_NAO_RECONHECIDA), unparsedCount: naoReconhecidas.length }
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

/**
 * Uma pessoa no relatório "Dízimo e Oferta Online", já somada.
 *
 * `meses` são os meses **distintos** em que houve dízimo. Duas devoluções no
 * mesmo mês contam uma vez: a pergunta é em quantos meses a pessoa devolveu,
 * não quantas vezes. Ofertas não entram — a fidelidade olha o dízimo.
 */
export interface LinhaDoDizimoOnline {
  churchName: string
  name: string
  meses: string[]
}

export interface DizimoOnlineLido {
  /** Primeiro e último mês que o relatório cobre, em `AAAA-MM`. */
  periodo: { de: string; ate: string } | null
  /** Quantos meses o período abrange. É a escala em que as faixas são lidas. */
  mesesDoPeriodo: number
  linhas: LinhaDoDizimoOnline[]
  ofertasIgnoradas: number
}

export function ehDizimoOnline(text: string): boolean {
  return cleanLines(text)[0] === 'DIZIMO_ONLINE'
}

function mesDaData(valor: string): string {
  const [, mes, ano] = valor.split('/')
  return `${ano}-${mes}`
}

function distanciaEmMeses(de: string, ate: string): number {
  const [anoDe, mesDe] = de.split('-').map(Number)
  const [anoAte, mesAte] = ate.split('-').map(Number)
  return (anoAte! - anoDe!) * 12 + (mesAte! - mesDe!) + 1
}

export function parseDizimoOnlineText(text: string): DizimoOnlineLido {
  const lines = cleanLines(text)
  if (lines.length === 0) throw new ImportFormatError('O PDF está vazio ou não contém texto selecionável. Se for escaneado, gere uma versão com OCR.')

  let periodo: DizimoOnlineLido['periodo'] = null
  let ofertasIgnoradas = 0
  const porPessoa = new Map<string, LinhaDoDizimoOnline>()

  for (const line of lines) {
    if (line === 'DIZIMO_ONLINE') continue
    const faixa = line.match(/^PERIODO:\s*(\d{2}\/\d{2}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})$/u)
    if (faixa) { periodo ??= { de: mesDaData(faixa[1]!), ate: mesDaData(faixa[2]!) }; continue }

    const partes = line.split(/\s*\|\s*/u)
    if (partes.length !== 4) continue
    const [igreja, nome, mes, tipo] = partes as [string, string, string, string]
    if (tipo !== 'DIZIMO') { ofertasIgnoradas += 1; continue }
    if (!/^\d{4}-\d{2}$/u.test(mes)) continue

    const churchName = normalizePdfChurchName(igreja)
    const chave = `${churchName}|${nome.trim().toLocaleLowerCase('pt-BR')}`
    const atual = porPessoa.get(chave) ?? { churchName, name: nome.trim(), meses: [] }
    if (!atual.meses.includes(mes)) atual.meses.push(mes)
    porPessoa.set(chave, atual)
  }

  if (!porPessoa.size) throw new ImportFormatError('Nenhum dízimo foi encontrado neste PDF. Confira se é o relatório "Dízimo e Oferta Online".')

  return {
    periodo,
    mesesDoPeriodo: periodo ? distanciaEmMeses(periodo.de, periodo.ate) : 12,
    linhas: [...porPessoa.values()].map((linha) => ({ ...linha, meses: [...linha.meses].sort() })),
    ofertasIgnoradas,
  }
}
