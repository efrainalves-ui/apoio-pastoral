import type {
  ReadingAnnualGoalData, ReadingBookData, ReadingEntity, ReadingGoalData, ReadingGoalRecordData, ReadingGoalReviewData, ReadingSessionData,
} from './types'

type Livro = ReadingEntity<ReadingBookData>
type Sessao = ReadingEntity<ReadingSessionData>
type Meta = ReadingEntity<ReadingGoalRecordData>

export const readingMonth = (value: string | Date) => typeof value === 'string' ? value.slice(0, 7) : `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}`

/** Um número digitado errado não pode deixar total negativo. */
const positivo = (numero: number) => Number.isFinite(numero) && numero > 0 ? numero : 0
const somar = (sessoes: readonly Sessao[], campo: 'pages' | 'minutes') => sessoes.reduce((total, sessao) => total + positivo(sessao[campo]), 0)

export const ehMetaAnual = (meta: ReadingGoalRecordData): meta is ReadingAnnualGoalData => 'tipo' in meta && meta.tipo === 'anual'
export const ehRevisao = (meta: ReadingGoalRecordData): meta is ReadingGoalReviewData => 'tipo' in meta && meta.tipo === 'revisao'
export const ehMetaMensalAntiga = (meta: ReadingGoalRecordData): meta is ReadingGoalData => !('tipo' in meta) && typeof meta.month === 'string'

export function metaDoAno(metas: readonly Meta[], ano: string): ReadingEntity<ReadingAnnualGoalData> | null {
  return metas
    .filter((meta): meta is ReadingEntity<ReadingAnnualGoalData> => ehMetaAnual(meta) && meta.year === ano)
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
    .at(-1) ?? null
}

export interface ProgressoDaMeta { feito: number; meta: number | null; percentual: number | null; faltam: number | null; superadaEm: number | null }

/** O resultado contra a meta, sem esconder o que passou de 100%. */
export function progresso(feito: number, meta: number | null | undefined): ProgressoDaMeta {
  if (!meta || meta <= 0) return { feito, meta: null, percentual: null, faltam: null, superadaEm: null }
  return { feito, meta, percentual: Math.round((feito / meta) * 100), faltam: Math.max(0, meta - feito), superadaEm: feito > meta ? feito - meta : null }
}

/**
 * Livro conta no mês e no ano da conclusão: é um registro só, então editar ou
 * sincronizar não o conta de novo. Reler é outro registro, aberto de propósito.
 */
const concluidoEm = (livro: Livro, prefixo: string) => livro.status === 'completed' && Boolean(livro.completedDate?.startsWith(prefixo))

/** O ano: livros e páginas contra a meta; tempo só como resultado. */
export function resumoAnual(livros: readonly Livro[], sessoes: readonly Sessao[], ano: string, meta: ReadingAnnualGoalData | null) {
  const doAno = sessoes.filter(({ date }) => date.startsWith(ano))
  return {
    livros: progresso(livros.filter((livro) => concluidoEm(livro, ano)).length, meta?.books),
    paginas: progresso(somar(doAno, 'pages'), meta?.pages),
    minutos: somar(doAno, 'minutes'),
  }
}

/**
 * O que foi lido num mês.
 *
 * Páginas e tempo pertencem à data de cada sessão: um livro lido de janeiro a
 * março reparte as páginas pelos três meses, e só conta como concluído no mês
 * em que terminou.
 */
export function relatorioMensal(livros: readonly Livro[], sessoes: readonly Sessao[], mes: string) {
  const doMes = sessoes
    .filter(({ date }) => readingMonth(date) === mes)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
  const concluidos = livros.filter((livro) => concluidoEm(livro, mes))
  const lidos = new Set([...doMes.map(({ bookId }) => bookId), ...concluidos.map(({ id }) => id)])
  return {
    livrosConcluidos: concluidos,
    paginas: somar(doMes, 'pages'),
    minutos: somar(doMes, 'minutes'),
    sessoes: doMes.length,
    dias: new Set(doMes.map(({ date }) => date)).size,
    livrosLidos: livros.filter(({ id }) => lidos.has(id)),
    historico: doMes,
  }
}

/** Progresso anual acumulado até o mês escolhido: de janeiro até ele, no mesmo ano. */
export function acumuladoAteOMes(livros: readonly Livro[], sessoes: readonly Sessao[], mes: string) {
  const ano = mes.slice(0, 4)
  const dentro = (data: string) => data.startsWith(ano) && data.slice(0, 7) <= mes
  const doPeriodo = sessoes.filter(({ date }) => dentro(date))
  return {
    livros: livros.filter((livro) => livro.status === 'completed' && Boolean(livro.completedDate) && dentro(livro.completedDate!)).length,
    paginas: somar(doPeriodo, 'pages'),
    minutos: somar(doPeriodo, 'minutes'),
  }
}

/**
 * Os doze meses do ano, como resultado.
 *
 * Cada mês traz os mesmos números do relatório daquele mês — livros concluídos,
 * páginas e tempo das sessões —, sem contar nada por outro caminho. `temRegistro`
 * separa o mês que teve leitura do mês que ficou vazio, para a tela destacar um
 * e recolher o outro.
 */
export function mesesDoAno(livros: readonly Livro[], sessoes: readonly Sessao[], ano: string) {
  return Array.from({ length: 12 }, (_, indice) => {
    const mes = `${ano}-${String(indice + 1).padStart(2, '0')}`
    const relatorio = relatorioMensal(livros, sessoes, mes)
    const numeros = { livros: relatorio.livrosConcluidos.length, paginas: relatorio.paginas, minutos: relatorio.minutos }
    return { mes, ...numeros, temRegistro: numeros.livros > 0 || numeros.paginas > 0 || numeros.minutos > 0 }
  })
}

export function formatarTempo(minutos: number): string {
  const total = Math.round(positivo(minutos))
  const horas = Math.floor(total / 60)
  const resto = total % 60
  return horas && resto ? `${horas}h ${resto}min` : horas ? `${horas}h` : `${resto}min`
}

export const metasMensaisAntigas = (metas: readonly Meta[]) => metas.filter((meta): meta is ReadingEntity<ReadingGoalData> => ehMetaMensalAntiga(meta))

/** A revisão só aparece para quem tem meta mensal antiga e ainda não decidiu. */
export const revisaoPendente = (metas: readonly Meta[]) => metasMensaisAntigas(metas).length > 0 && !metas.some(ehRevisao)

/**
 * Como ficaria a meta anual somando as mensais, para o pastor ver antes de escolher.
 *
 * Páginas somam os meses. Livros já eram do ano nas metas antigas — somar doze
 * vezes a mesma meta inventaria um alvo impossível —, então vale a última
 * escrita naquele ano. Minutos ficam de fora: tempo não é meta. Ano que já tem
 * meta anual não é tocado.
 */
export function propostaDeSoma(metas: readonly Meta[]): Array<{ year: string; books: number | null; pages: number | null }> {
  const antigas = metasMensaisAntigas(metas)
  return [...new Set(antigas.map(({ month }) => month.slice(0, 4)))].sort()
    .filter((ano) => !metaDoAno(metas, ano))
    .map((ano) => {
      const doAno = antigas.filter(({ month }) => month.startsWith(ano)).sort((a, b) => a.month.localeCompare(b.month))
      const livros = doAno.filter(({ books }) => positivo(books) > 0).at(-1)?.books ?? 0
      const paginas = doAno.reduce((total, meta) => total + positivo(meta.pages), 0)
      return { year: ano, books: livros || null, pages: paginas || null }
    })
    .filter(({ books, pages }) => books !== null || pages !== null)
}

export function bookProgress(book: Livro) { return book.totalPages && book.totalPages > 0 ? Math.min(100, Math.round(book.pagesRead / book.totalPages * 100)) : null }

/**
 * A leitura que já aconteceu.
 *
 * O pastor registra em setembro um livro que leu em fevereiro, e quer que ele
 * conte em fevereiro. Páginas e minutos vêm **só das sessões** — é de lá que os
 * totais do mês e do ano saem —, então o registro retroativo abre a sessão na
 * data da leitura.
 */
export function sessaoDoRegistroRetroativo(
  livro: { startDate: string; completedDate: string | null; pagesRead: number },
  minutos: number,
  bookId: string,
): { bookId: string; date: string; pages: number; minutes: number; notes: string } | null {
  if (minutos <= 0 && livro.pagesRead <= 0) return null
  const data = livro.completedDate || livro.startDate
  if (!data) return null
  return { bookId, date: data, pages: Math.max(0, livro.pagesRead), minutes: Math.max(0, minutos), notes: '' }
}

/** A conclusão não pode ser antes do começo. */
export function datasCoerentes(startDate: string, completedDate: string | null): boolean {
  if (!completedDate || !startDate) return true
  return completedDate >= startDate
}
