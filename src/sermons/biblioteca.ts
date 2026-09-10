import type { AgendaEventEntity } from '../agenda/types'
import type { ChurchEntity } from '../district/types'
import { lastPreaching, listPreachings } from './preachings'
import type { SermonEntity } from './types'

export interface HistoricoDoSermao {
  /** Quantas vezes já foi pregado — as pregações futuras não contam. */
  vezes: number
  ultimoLugar: string
  ultimaData: string
}

/**
 * Onde e quantas vezes cada sermão foi pregado.
 *
 * O histórico não é campo do sermão: ele mora na agenda, nos compromissos de
 * categoria "pregação" que apontam para o esboço. Percorrer a agenda inteira
 * uma vez por linha da lista custaria caro com um acervo grande, então isto
 * varre os eventos uma vez só e devolve o mapa pronto.
 */
export function historicosPorSermao(
  sermons: readonly SermonEntity[],
  eventos: readonly AgendaEventEntity[],
  igrejas: readonly ChurchEntity[],
  agora = new Date(),
): Map<string, HistoricoDoSermao> {
  const pregacoes = eventos.filter(({ category }) => category === 'preaching')
  const mapa = new Map<string, HistoricoDoSermao>()
  for (const sermon of sermons) {
    const doSermao = listPreachings([...pregacoes], [...igrejas], sermon.id, agora)
    const feitas = doSermao.filter(({ scheduled }) => !scheduled)
    const ultima = lastPreaching(feitas)
    mapa.set(sermon.id, { vezes: feitas.length, ultimoLugar: ultima?.place ?? '', ultimaData: ultima?.date ?? '' })
  }
  return mapa
}

export const FILTROS_DA_BIBLIOTECA = ['todos', 'ready', 'draft', 'nunca', 'archived'] as const
export type FiltroDaBiblioteca = (typeof FILTROS_DA_BIBLIOTECA)[number]

export const FILTRO_LABELS: Record<FiltroDaBiblioteca, string> = {
  todos: 'Todos', ready: 'Prontos', draft: 'Rascunhos', nunca: 'Nunca pregados', archived: 'Arquivados',
}

export function contarPorFiltro(
  sermons: readonly SermonEntity[],
  historicos: Map<string, HistoricoDoSermao>,
): Record<FiltroDaBiblioteca, number> {
  return {
    todos: sermons.length,
    ready: sermons.filter(({ status }) => status === 'ready').length,
    draft: sermons.filter(({ status }) => status === 'draft').length,
    archived: sermons.filter(({ status }) => status === 'archived').length,
    nunca: sermons.filter(({ id }) => (historicos.get(id)?.vezes ?? 0) === 0).length,
  }
}

export function passaNoFiltro(
  sermon: SermonEntity,
  filtro: FiltroDaBiblioteca,
  historicos: Map<string, HistoricoDoSermao>,
): boolean {
  if (filtro === 'todos') return true
  if (filtro === 'nunca') return (historicos.get(sermon.id)?.vezes ?? 0) === 0
  return sermon.status === filtro
}

export const ORDENACOES = ['recentes', 'antigos', 'titulo', 'pregados', 'nunca'] as const
export type Ordenacao = (typeof ORDENACOES)[number]

export const ORDENACAO_LABELS: Record<Ordenacao, string> = {
  recentes: 'Mais recentes', antigos: 'Mais antigos', titulo: 'Título A–Z',
  pregados: 'Mais pregados', nunca: 'Nunca pregados primeiro',
}

export function ordenar(
  sermons: readonly SermonEntity[],
  ordenacao: Ordenacao,
  historicos: Map<string, HistoricoDoSermao>,
): SermonEntity[] {
  const vezes = (sermon: SermonEntity) => historicos.get(sermon.id)?.vezes ?? 0
  const lista = [...sermons]
  switch (ordenacao) {
    case 'antigos': return lista.sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
    case 'titulo': return lista.sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'))
    case 'pregados': return lista.sort((a, b) => vezes(b) - vezes(a) || b.updatedAt.localeCompare(a.updatedAt))
    case 'nunca': return lista.sort((a, b) => vezes(a) - vezes(b) || b.updatedAt.localeCompare(a.updatedAt))
    default: return lista.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }
}
