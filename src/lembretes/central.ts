import { ocorrenciaAberta } from './repeticao'
import { dataNoFuso, instanteNoFuso, somarDias } from './tempo'
import type { LembreteEntity, PrioridadeDoLembrete, RegraDeRepeticao } from './types'

export const AREAS_DA_CENTRAL = {
  visitacao: { rotulo: 'Visitação', descricao: 'Tarefas, retornos e pedidos de oração para revisar' },
  comissoes: { rotulo: 'Comissões', descricao: 'Pendências das reuniões' },
  nomeacoes: { rotulo: 'Nomeações', descricao: 'Tarefas dos processos de nomeação' },
  evangelismo: { rotulo: 'Evangelismo', descricao: 'Tarefas das campanhas' },
  planejamento: { rotulo: 'Planejamento Anual', descricao: 'Metas com prazo' },
  agenda: { rotulo: 'Agenda', descricao: 'Compromissos com lembrete' },
  orcamento: { rotulo: 'Orçamento', descricao: 'Contas a pagar' },
  materiais: { rotulo: 'Materiais', descricao: 'Materiais que precisam ser pedidos' },
} as const
export type AreaDaCentral = keyof typeof AREAS_DA_CENTRAL

export const BLOCOS = ['hoje', 'proximos', 'todos', 'sinalizados', 'urgentes', 'concluidos'] as const
export type BlocoDaCentral = (typeof BLOCOS)[number]
export const BLOCO_LABELS: Record<BlocoDaCentral, string> = { hoje: 'Hoje', proximos: 'Próximos', todos: 'Todos', sinalizados: 'Sinalizados', urgentes: 'Urgentes', concluidos: 'Concluídos' }

/** Um item da Central: um lembrete manual (ou uma ocorrência dele) ou uma tarefa que mora em outra área. */
export interface ItemDaCentral {
  /** Único na Central. Manual: `lembrete:<id>` ou `lembrete:<id>:<data>`. Integrado: a origem. */
  chave: string
  tipo: 'manual' | 'integrado'
  lembreteId: string | null
  /** Data original da ocorrência numa série. */
  ocorrencia: string | null
  /** Identificador estável na área de origem, por exemplo `task:<id>`. */
  origem: string | null
  area: AreaDaCentral | null
  listaId: string | null
  titulo: string
  data: string | null
  hora: string | null
  fuso: string
  prioridade: PrioridadeDoLembrete
  sinalizado: boolean
  concluido: boolean
  concluidoEm: string | null
  repeticao: RegraDeRepeticao | null
  igrejaId: string | null
  pessoaId: string | null
  /** O que o item é na origem: "Tarefa da Visitação", "Retorno de visita"… */
  detalhe: string
  /** Tela da origem; para manual, nulo. */
  link: string | null
  /** A origem tem uma ação de concluir equivalente. */
  podeConcluir: boolean
  notificar: boolean
}

export type SituacaoDoItem = 'atrasado' | 'hoje' | 'amanha' | 'proximos' | 'sem_data' | 'concluido'
export const SITUACAO_LABELS: Record<SituacaoDoItem, string> = { atrasado: 'Atrasados', hoje: 'Hoje', amanha: 'Amanhã', proximos: 'Próximos dias', sem_data: 'Sem data', concluido: 'Concluídos' }
const ORDEM_DAS_SITUACOES: readonly SituacaoDoItem[] = ['atrasado', 'hoje', 'amanha', 'proximos', 'sem_data', 'concluido']

/** O instante do item, quando tem data e horário. */
export function instanteDoItem(item: Pick<ItemDaCentral, 'data' | 'hora' | 'fuso'>): Date | null {
  return item.data && item.hora ? instanteNoFuso(item.data, item.hora, item.fuso) : null
}

/** Atrasado, hoje, amanhã, próximos dias, sem data ou concluído — do ponto de vista do aparelho. */
export function situacaoDoItem(item: ItemDaCentral, agora: Date, fusoLocal: string): SituacaoDoItem {
  if (item.concluido) return 'concluido'
  if (!item.data) return 'sem_data'
  const hoje = dataNoFuso(agora, fusoLocal)
  const instante = instanteDoItem(item)
  const dataLocal = instante ? dataNoFuso(instante, fusoLocal) : item.data
  if (instante ? instante.getTime() < agora.getTime() : dataLocal < hoje) return 'atrasado'
  if (dataLocal === hoje) return 'hoje'
  if (dataLocal === somarDias(hoje, 1)) return 'amanha'
  return 'proximos'
}

/** Por data; no mesmo dia, primeiro o que não tem horário, depois do mais cedo ao mais tarde. Sem data vai para o fim. */
function ordenar(itens: ItemDaCentral[]): ItemDaCentral[] {
  return itens.sort((a, b) => {
    const porData = (a.data ?? '9999-99-99').localeCompare(b.data ?? '9999-99-99')
    if (porData) return porData
    const porHorario = Number(Boolean(a.hora)) - Number(Boolean(b.hora))
    if (porHorario) return porHorario
    const porInstante = (instanteDoItem(a)?.getTime() ?? 0) - (instanteDoItem(b)?.getTime() ?? 0)
    return porInstante || a.titulo.localeCompare(b.titulo, 'pt-BR')
  })
}

/** Os itens de um bloco, já ordenados. Cada item aparece uma vez. */
export function itensDoBloco(itens: readonly ItemDaCentral[], bloco: BlocoDaCentral, agora: Date, fusoLocal: string): ItemDaCentral[] {
  const unicos = [...new Map(itens.map((item) => [item.chave, item])).values()]
  const situacao = (item: ItemDaCentral) => situacaoDoItem(item, agora, fusoLocal)
  const abertos = unicos.filter((item) => !item.concluido)
  switch (bloco) {
    case 'hoje': return ordenar(abertos.filter((item) => ['atrasado', 'hoje'].includes(situacao(item))))
    case 'proximos': return ordenar(abertos.filter((item) => ['amanha', 'proximos'].includes(situacao(item))))
    case 'todos': return ordenar(abertos)
    case 'sinalizados': return ordenar(abertos.filter((item) => item.sinalizado))
    case 'urgentes': return ordenar(abertos.filter((item) => item.prioridade === 'urgente' || situacao(item) === 'atrasado'))
    case 'concluidos': return unicos.filter((item) => item.concluido).sort((a, b) => (b.concluidoEm ?? '').localeCompare(a.concluidoEm ?? ''))
  }
}

export function contagensDosBlocos(itens: readonly ItemDaCentral[], agora: Date, fusoLocal: string): Record<BlocoDaCentral, number> {
  return Object.fromEntries(BLOCOS.map((bloco) => [bloco, itensDoBloco(itens, bloco, agora, fusoLocal).length])) as Record<BlocoDaCentral, number>
}

/** O número do menu: pendências atrasadas ou de hoje, cada uma contada uma vez. */
export function contadorDoMenu(itens: readonly ItemDaCentral[], agora: Date, fusoLocal: string): number {
  return itensDoBloco(itens, 'hoje', agora, fusoLocal).length
}

export interface GrupoDeItens { situacao: SituacaoDoItem; rotulo: string; itens: ItemDaCentral[] }

/** Atrasados, Hoje, Amanhã, Próximos dias, Sem data e Concluídos — só os grupos com itens. */
export function agruparItens(itens: readonly ItemDaCentral[], agora: Date, fusoLocal: string): GrupoDeItens[] {
  const grupos = new Map<SituacaoDoItem, ItemDaCentral[]>()
  for (const item of new Map(itens.map((i) => [i.chave, i])).values()) {
    const situacao = situacaoDoItem(item, agora, fusoLocal)
    grupos.set(situacao, [...(grupos.get(situacao) ?? []), item])
  }
  return ORDEM_DAS_SITUACOES.filter((situacao) => grupos.has(situacao)).map((situacao) => ({
    situacao, rotulo: SITUACAO_LABELS[situacao],
    itens: situacao === 'concluido' ? grupos.get(situacao)!.sort((a, b) => (b.concluidoEm ?? '').localeCompare(a.concluidoEm ?? '')) : ordenar(grupos.get(situacao)!),
  }))
}

export const semAcento = (texto: string) => texto.normalize('NFD').replace(/[̀-ͯ]/gu, '').toLocaleLowerCase('pt-BR').trim()

/** Pesquisa por título, lista, área de origem e igreja, sem ligar para acento e maiúscula. */
export function pesquisarItens(
  itens: readonly ItemDaCentral[], termo: string,
  contexto: { nomeDaLista: (id: string) => string | undefined; nomeDaIgreja: (id: string) => string | undefined },
): ItemDaCentral[] {
  const alvo = semAcento(termo)
  if (!alvo) return [...itens]
  return itens.filter((item) => [
    item.titulo, item.detalhe,
    item.listaId ? contexto.nomeDaLista(item.listaId) : '',
    item.area ? AREAS_DA_CENTRAL[item.area].rotulo : '',
    item.igrejaId ? contexto.nomeDaIgreja(item.igrejaId) : '',
  ].some((texto) => semAcento(texto ?? '').includes(alvo)))
}

/**
 * Os itens dos lembretes manuais.
 *
 * Lembrete simples: um item. Série: a ocorrência aberta (com o que foi alterado
 * só nela) e, no histórico, cada ocorrência concluída — cada uma com a sua
 * chave, para nenhuma se confundir com outra.
 */
export function itensDosLembretes(lembretes: readonly LembreteEntity[]): ItemDaCentral[] {
  const itens: ItemDaCentral[] = []
  for (const lembrete of lembretes) {
    const base: ItemDaCentral = {
      chave: `lembrete:${lembrete.id}`, tipo: 'manual', lembreteId: lembrete.id, ocorrencia: null, origem: null, area: null,
      listaId: lembrete.listaId, titulo: lembrete.titulo, data: lembrete.data || null, hora: lembrete.hora || null, fuso: lembrete.fuso,
      prioridade: lembrete.prioridade, sinalizado: lembrete.sinalizado, concluido: lembrete.estado === 'concluido', concluidoEm: lembrete.concluidoEm,
      repeticao: lembrete.repeticao, igrejaId: lembrete.relacionado.churchId ?? null, pessoaId: lembrete.relacionado.personId ?? null,
      detalhe: '', link: null, podeConcluir: true, notificar: lembrete.notificar,
    }
    if (!lembrete.repeticao || !lembrete.data) { itens.push(base); continue }

    for (const [data, registro] of Object.entries(lembrete.ocorrencias)) {
      if (registro.estado !== 'concluida') continue
      const alteracao = registro.alteracao ?? {}
      itens.push({ ...base, chave: `lembrete:${lembrete.id}:${data}`, ocorrencia: data, titulo: alteracao.titulo ?? base.titulo, data: alteracao.data ?? data, hora: alteracao.hora ?? base.hora, concluido: true, concluidoEm: registro.concluidaEm ?? null })
    }
    const aberta = ocorrenciaAberta(lembrete)
    if (!aberta) continue
    const alteracao = lembrete.ocorrencias[aberta]?.alteracao ?? {}
    itens.push({
      ...base, chave: `lembrete:${lembrete.id}:${aberta}`, ocorrencia: aberta, concluido: false, concluidoEm: null,
      titulo: alteracao.titulo ?? base.titulo, data: alteracao.data ?? aberta, hora: alteracao.hora ?? base.hora,
      prioridade: alteracao.prioridade ?? base.prioridade, sinalizado: alteracao.sinalizado ?? base.sinalizado,
    })
  }
  return itens
}
