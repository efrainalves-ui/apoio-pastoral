import type { AgendaEventEntity } from '../agenda/types'
import { FOLLOW_UP_LABELS, type FollowUpEntity, type PrayerRequestEntity, type TaskEntity } from '../care/types'
import type { CommissionEntity, CommissionTaskData } from '../commissions/types'
import type { AnnualGoalEntity, EvangelismCampaignEntity } from '../evangelism/types'
import type { BudgetBillData } from '../family-budget/types'
import type { MaterialNeedEntity } from '../materials/types'
import type { BibleStudyEntity } from '../missionary/types'
import type { NominationProcessEntity } from '../nominations/types'
import type { AreaDaCentral, ItemDaCentral } from './central'
import { dataNoFuso, horaNoFuso } from './tempo'
import type { MetadadosDeTarefaEntity, PrioridadeDoLembrete } from './types'

/** O que as áreas já guardam. A Central só lê: nada disto é copiado. */
export interface DadosDasAreas {
  tarefas: readonly TaskEntity[]
  acompanhamentos: readonly FollowUpEntity[]
  pedidos: readonly PrayerRequestEntity[]
  tarefasDeComissao: ReadonlyArray<CommissionEntity<CommissionTaskData>>
  processos: readonly NominationProcessEntity[]
  campanhas: readonly EvangelismCampaignEntity[]
  metas: readonly AnnualGoalEntity[]
  eventos: readonly AgendaEventEntity[]
  contas: ReadonlyArray<BudgetBillData & { id: string }>
  necessidades: readonly MaterialNeedEntity[]
  estudos: readonly BibleStudyEntity[]
}

const deAlta = (prioridade: string | undefined): PrioridadeDoLembrete => prioridade === 'urgent' ? 'urgente' : prioridade === 'high' ? 'importante' : 'normal'

interface Base {
  origem: string; area: AreaDaCentral; titulo: string; detalhe: string; link: string
  data: string | null; hora?: string | null; prioridade?: PrioridadeDoLembrete; concluido: boolean; concluidoEm?: string | null
  igrejaId?: string | null; pessoaId?: string | null; podeConcluir: boolean; notificar?: boolean
}

function item(base: Base, fuso: string): ItemDaCentral {
  return {
    chave: base.origem, tipo: 'integrado', lembreteId: null, ocorrencia: null, origem: base.origem, area: base.area, listaId: null,
    titulo: base.titulo, data: base.data || null, hora: base.hora || null, fuso, prioridade: base.prioridade ?? 'normal', sinalizado: false,
    concluido: base.concluido, concluidoEm: base.concluidoEm ?? null, repeticao: null, igrejaId: base.igrejaId ?? null, pessoaId: base.pessoaId ?? null,
    detalhe: base.detalhe, link: base.link, podeConcluir: base.podeConcluir, notificar: base.notificar ?? false,
  }
}

/**
 * As tarefas de todas as áreas, como itens da Central.
 *
 * Cada item tem como chave o identificador estável da origem; o que a Central
 * acrescenta (bandeira, prioridade, adiamento, lista) vem dos metadados ligados
 * a essa chave. Mudou na origem, muda aqui na próxima leitura; sumiu na origem,
 * some aqui.
 */
export function itensDasAreas(dados: DadosDasAreas, metadados: ReadonlyMap<string, MetadadosDeTarefaEntity>, agora: Date, fuso: string): ItemDaCentral[] {
  const itens: ItemDaCentral[] = []
  const incluir = (base: Base) => itens.push(item(base, fuso))

  for (const tarefa of dados.tarefas) {
    if (tarefa.status === 'cancelled') continue
    const data = tarefa.dueAt.slice(0, 10)
    const hora = tarefa.remindAt && tarefa.remindAt.slice(0, 10) === data ? tarefa.remindAt.slice(11, 16) : null
    incluir({
      origem: `task:${tarefa.id}`, area: 'visitacao', titulo: tarefa.title, detalhe: 'Tarefa da Visitação', link: '/app/visitacao?aba=tarefas',
      data, hora, prioridade: tarefa.priority === 'high' ? 'importante' : 'normal', concluido: tarefa.status === 'completed',
      concluidoEm: tarefa.status === 'completed' ? tarefa.updatedAt : null, igrejaId: tarefa.churchId,
      pessoaId: tarefa.relatedType === 'person' ? tarefa.relatedId : null, podeConcluir: true, notificar: Boolean(tarefa.remindAt),
    })
  }

  for (const retorno of dados.acompanhamentos) {
    if (retorno.status === 'cancelled') continue
    incluir({
      origem: `follow_up:${retorno.id}`, area: 'visitacao', titulo: FOLLOW_UP_LABELS[retorno.kind], detalhe: 'Acompanhamento de visita',
      link: retorno.visitId ? `/app/visitas/${retorno.visitId}` : '/app/visitacao?aba=acompanhamentos', data: retorno.dueAt.slice(0, 10),
      concluido: retorno.status === 'completed', concluidoEm: retorno.status === 'completed' ? retorno.updatedAt : null,
      igrejaId: retorno.churchId, pessoaId: retorno.subjectType === 'person' ? retorno.subjectId : null, podeConcluir: true,
    })
  }

  for (const pedido of dados.pedidos) {
    if ((pedido.status !== 'active' && pedido.status !== 'needs_follow_up') || !pedido.reviewAt) continue
    incluir({
      origem: `prayer_request:${pedido.id}`, area: 'visitacao', titulo: 'Revisar pedido de oração', detalhe: 'Pedido de oração',
      link: '/app/visitacao?aba=oracao', data: pedido.reviewAt.slice(0, 10), concluido: false, igrejaId: pedido.churchId, podeConcluir: false,
    })
  }

  for (const tarefa of dados.tarefasDeComissao) {
    if (tarefa.status === 'cancelled') continue
    incluir({
      origem: `commission_task:${tarefa.id}`, area: 'comissoes', titulo: tarefa.title, detalhe: 'Pendência de comissão', link: `/app/comissoes/${tarefa.meetingId}`,
      data: tarefa.dueDate || null, concluido: tarefa.status === 'completed', concluidoEm: tarefa.status === 'completed' ? tarefa.updatedAt : null,
      igrejaId: tarefa.churchId, podeConcluir: true,
    })
  }

  for (const processo of dados.processos) {
    if (processo.status === 'archived') continue
    for (const tarefa of processo.tasks ?? []) {
      if (tarefa.status === 'cancelled') continue
      incluir({
        origem: `nomination_task:${processo.id}:${tarefa.id}`, area: 'nomeacoes', titulo: tarefa.title, detalhe: 'Tarefa de nomeações',
        link: `/app/comissoes/nomeacoes/${processo.id}`, data: tarefa.dueDate || null, concluido: tarefa.status === 'completed',
        igrejaId: processo.churchId, podeConcluir: true,
      })
    }
  }

  for (const campanha of dados.campanhas) {
    if (campanha.status === 'cancelled') continue
    for (const tarefa of campanha.tasks ?? []) {
      incluir({
        origem: `evangelism_task:${campanha.id}:${tarefa.id}`, area: 'evangelismo', titulo: tarefa.title, detalhe: 'Tarefa de campanha',
        link: `/app/evangelismo/${campanha.id}`, data: tarefa.dueDate || null, prioridade: deAlta(tarefa.priority),
        concluido: tarefa.status === 'completed', podeConcluir: false,
      })
    }
  }

  // O estudo em si não é tarefa. Só o próximo passo escrito nele, com ou sem data.
  for (const estudo of dados.estudos) {
    const passo = estudo.followUp?.trim()
    if (!passo) continue
    incluir({
      origem: `bible_study:${estudo.id}`, area: 'estudos', titulo: passo, detalhe: 'Próximo passo do estudo bíblico', link: '/app/metas/bible_studies',
      data: null, concluido: false, igrejaId: estudo.churchId, podeConcluir: false,
    })
  }

  for (const meta of dados.metas) {
    if (meta.status === 'cancelled' || !meta.dueDate) continue
    incluir({
      origem: `annual_goal:${meta.id}`, area: 'planejamento', titulo: meta.title, detalhe: 'Meta do Planejamento Anual', link: `/app/planejamento/${meta.id}`,
      data: meta.dueDate.slice(0, 10), prioridade: deAlta(meta.priority), concluido: meta.status === 'completed', podeConcluir: false,
    })
  }

  for (const evento of dados.eventos) {
    if (evento.reminderMinutes === null || evento.reminderMinutes === undefined) continue
    const fim = new Date(evento.endAt)
    if (Number.isNaN(fim.getTime()) || fim.getTime() < agora.getTime()) continue
    const inicio = new Date(evento.startAt)
    incluir({
      origem: `agenda_event:${evento.id}`, area: 'agenda', titulo: evento.title, detalhe: 'Compromisso da Agenda', link: `/app/agenda/${evento.id}/editar`,
      data: dataNoFuso(inicio, fuso), hora: evento.allDay ? null : horaNoFuso(inicio, fuso), concluido: false, igrejaId: evento.churchId,
      podeConcluir: false, notificar: true,
    })
  }

  for (const conta of dados.contas) {
    incluir({
      origem: `bill:${conta.id}`, area: 'orcamento', titulo: `Pagar ${conta.name}`, detalhe: 'Conta a pagar', link: '/app/orcamento/contas',
      data: conta.dueDate || null, concluido: conta.status === 'paid', podeConcluir: false,
    })
  }

  for (const necessidade of dados.necessidades) {
    // Necessidade de prioridade alta já abriu uma tarefa da Visitação: contar as duas seria contar duas vezes.
    if (necessidade.status !== 'to_request' || necessidade.taskId) continue
    incluir({
      origem: `material_need:${necessidade.id}`, area: 'materiais', titulo: `Pedir ${necessidade.item}`, detalhe: 'Material a pedir', link: '/app/materiais',
      data: null, prioridade: necessidade.priority === 'high' ? 'importante' : 'normal', concluido: false, podeConcluir: false,
    })
  }

  return itens.map((integrado) => {
    const meta = metadados.get(integrado.chave)
    if (!meta) return integrado
    return {
      ...integrado,
      sinalizado: meta.sinalizado,
      prioridade: meta.prioridade ?? integrado.prioridade,
      listaId: meta.listaId,
      ...(meta.adiadaPara && !integrado.concluido ? { data: meta.adiadaPara.data, hora: meta.adiadaPara.hora || null } : {}),
    }
  })
}
