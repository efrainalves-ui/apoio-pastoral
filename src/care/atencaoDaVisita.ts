import { localDateKey } from '../shared/dates'
import type { FollowUpEntity, TaskEntity, VisitEntity } from './types'

export const ATENCOES = ['urgente', 'atrasada', 'retorno', 'pendente'] as const
export type Atencao = (typeof ATENCOES)[number]

export const ATENCAO_LABELS: Record<Atencao, string> = {
  urgente: 'Urgente',
  atrasada: 'Atrasada',
  retorno: 'Retorno',
  pendente: 'Pendente',
}

/**
 * O que ainda está em aberto para a pessoa desta visita.
 *
 * Uma visita não tem estado: `VisitData.status` é sempre `completed`, porque
 * visita é registro do que já aconteceu. Quem carrega urgência é o que ficou
 * pendente **depois** dela — o acompanhamento marcado e a tarefa de prioridade
 * alta. Por isso a etiqueta da linha não é um campo gravado na visita: é lida
 * do que está aberto agora, e muda sozinha quando o pastor conclui o que devia.
 *
 * A ordem importa: uma pessoa pode ter tarefa urgente e acompanhamento
 * atrasado ao mesmo tempo, e a linha só cabe uma etiqueta. Vence a que pede
 * ação mais cedo.
 */
export function atencaoDaVisita(
  visita: VisitEntity,
  acompanhamentos: readonly FollowUpEntity[],
  tarefas: readonly TaskEntity[],
  hoje = localDateKey(),
): Atencao | null {
  const daPessoa = acompanhamentos.filter((acompanhamento) =>
    acompanhamento.status === 'pending'
    && (acompanhamento.visitId === visita.id
      || (acompanhamento.subjectType === visita.targetType && acompanhamento.subjectId === visita.targetId)))

  const urgente = tarefas.some((tarefa) =>
    tarefa.status === 'pending'
    && tarefa.priority === 'high'
    && ((tarefa.relatedType === 'visit' && tarefa.relatedId === visita.id)
      || (tarefa.relatedType === visita.targetType && tarefa.relatedId === visita.targetId)))
  if (urgente) return 'urgente'

  if (daPessoa.some(({ dueAt }) => Boolean(dueAt) && dueAt < hoje)) return 'atrasada'
  if (daPessoa.some(({ kind }) => kind === 'revisit')) return 'retorno'
  if (daPessoa.length > 0) return 'pendente'
  return null
}

/** Domingo que abre a semana da data dada, em chave local. */
export function inicioDaSemana(hoje = new Date()): string {
  const domingo = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - hoje.getDay())
  return localDateKey(domingo)
}

export interface ResumoDaVisitacao {
  visitas: number
  urgentes: number
  retornos: number
  atrasadas: number
  pendentes: number
  semana: number
}

/**
 * Os números do topo saem da mesma função das etiquetas.
 *
 * Contar por um caminho e etiquetar por outro é como o resumo passa a mentir:
 * a tela diz "12 urgentes" e o pastor conta onze etiquetas vermelhas. Aqui as
 * duas coisas são a mesma leitura.
 */
export function resumoDaVisitacao(
  visitas: readonly VisitEntity[],
  acompanhamentos: readonly FollowUpEntity[],
  tarefas: readonly TaskEntity[],
  hoje = localDateKey(),
): ResumoDaVisitacao {
  const domingo = inicioDaSemana(new Date(`${hoje}T12:00:00`))
  const resumo: ResumoDaVisitacao = { visitas: visitas.length, urgentes: 0, retornos: 0, atrasadas: 0, pendentes: 0, semana: 0 }
  for (const visita of visitas) {
    const atencao = atencaoDaVisita(visita, acompanhamentos, tarefas, hoje)
    if (atencao === 'urgente') resumo.urgentes += 1
    else if (atencao === 'atrasada') resumo.atrasadas += 1
    else if (atencao === 'retorno') resumo.retornos += 1
    else if (atencao === 'pendente') resumo.pendentes += 1
    if ((visita.versions.at(-1)?.startAt ?? '').slice(0, 10) >= domingo) resumo.semana += 1
  }
  return resumo
}

