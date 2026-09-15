import { localDateKey } from '../shared/dates'
import type { FollowUpEntity, VisitEntity } from './types'

/** Janela do resumo da tela inicial, em dias corridos contando hoje. */
export const DIAS_DO_RESUMO = 30

/** O dia em que a visita aconteceu: o início da versão vigente, e não a data em que foi digitada. */
export function diaDaVisita(visit: Pick<VisitEntity, 'versions' | 'currentVersion' | 'createdAt'>): string {
  const versao = visit.versions.find(({ version }) => version === visit.currentVersion) ?? visit.versions.at(-1)
  return (versao?.startAt || visit.createdAt).slice(0, 10)
}

export interface ResumoDeVisitacaoNoInicio {
  realizadas: number
  /** Pessoas e famílias diferentes visitadas na janela. */
  visitados: number
  acompanhamentosPendentes: number
  /** Só quando há visita anterior à janela: sem histórico, comparar com zero enganaria. */
  tendencia: { anterior: number; diferenca: number; percentual: number | null } | null
}

/**
 * Três números de visitação para a tela inicial, tirados do que já está
 * registrado — as perguntas e as porcentagens continuam na página de Visitação.
 */
export function resumoDeVisitacaoNoInicio(visits: readonly VisitEntity[], followUps: readonly FollowUpEntity[], hoje = new Date()): ResumoDeVisitacaoNoInicio {
  const dia = (diasAtras: number) => localDateKey(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - diasAtras))
  const fim = dia(0)
  const inicio = dia(DIAS_DO_RESUMO - 1)
  const inicioAnterior = dia(DIAS_DO_RESUMO * 2 - 1)
  const comDia = visits.map((visit) => ({ visit, data: diaDaVisita(visit) }))
  const atuais = comDia.filter(({ data }) => data >= inicio && data <= fim)
  const anteriores = comDia.filter(({ data }) => data >= inicioAnterior && data < inicio)
  const temHistorico = comDia.some(({ data }) => data < inicio)
  const diferenca = atuais.length - anteriores.length
  return {
    realizadas: atuais.length,
    visitados: new Set(atuais.map(({ visit }) => visit.targetId ? `${visit.targetType}:${visit.targetId}` : `casamento:${visit.casamentoId ?? visit.id}`)).size,
    acompanhamentosPendentes: followUps.filter(({ status }) => status === 'pending').length,
    tendencia: temHistorico
      ? { anterior: anteriores.length, diferenca, percentual: anteriores.length > 0 ? Math.round((diferenca / anteriores.length) * 1000) / 10 : null }
      : null,
  }
}
