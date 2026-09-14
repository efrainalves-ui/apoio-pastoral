import { describe, expect, it } from 'vitest'
import {
  agruparItens, contadorDoMenu, contagensDosBlocos, itensDoBloco, itensDosLembretes, pesquisarItens, situacaoDoItem, type ItemDaCentral,
} from './central'
import { itensDasAreas, type DadosDasAreas } from './origens'
import type { LembreteEntity, MetadadosDeTarefaEntity } from './types'

const FUSO = 'America/Belem'
// 14/09/2026 às 10:00 em Belém.
const AGORA = new Date('2026-09-14T13:00:00.000Z')

function lembrete(id: string, extra: Partial<LembreteEntity> = {}): LembreteEntity {
  return {
    id, titulo: `Lembrete ${id}`, observacao: '', listaId: 'lista-pessoal', data: '', hora: '', fuso: FUSO, prioridade: 'normal', sinalizado: false,
    repeticao: null, notificar: false, relacionado: {}, estado: 'aberto', concluidoEm: null, ocorrencias: {}, createdAt: '', updatedAt: '', ...extra,
  }
}

const LEMBRETES: LembreteEntity[] = [
  lembrete('atrasado', { data: '2026-09-10', prioridade: 'importante' }),
  lembrete('passou-hoje', { data: '2026-09-14', hora: '08:00' }),
  lembrete('hoje-tarde', { data: '2026-09-14', hora: '18:00', sinalizado: true }),
  lembrete('hoje-sem-hora', { data: '2026-09-14' }),
  lembrete('amanha', { data: '2026-09-15', hora: '09:00', prioridade: 'urgente' }),
  lembrete('mes-que-vem', { data: '2026-10-02' }),
  lembrete('sem-data', { sinalizado: true }),
  lembrete('feito', { data: '2026-09-01', estado: 'concluido', concluidoEm: '2026-09-01T12:00:00.000Z' }),
  lembrete('relatorio', { titulo: 'Fazer o relatório mensal', listaId: 'lista-rotinas', data: '2026-09-05', hora: '08:00', repeticao: { frequencia: 'mensal', intervalo: 1, diaDoMes: 5 }, ocorrencias: { '2026-09-05': { estado: 'concluida', concluidaEm: '2026-09-05T11:30:00.000Z' } } }),
]

describe('blocos da Central', () => {
  const itens = itensDosLembretes(LEMBRETES)

  it('Hoje separa atrasados e tarefas do dia; a hora que já passou conta como atrasada', () => {
    const grupos = agruparItens(itensDoBloco(itens, 'hoje', AGORA, FUSO), AGORA, FUSO)
    expect(grupos.map(({ rotulo, itens: doGrupo }) => [rotulo, doGrupo.map(({ lembreteId }) => lembreteId)])).toEqual([
      ['Atrasados', ['atrasado', 'passou-hoje']],
      ['Hoje', ['hoje-sem-hora', 'hoje-tarde']],
    ])
  })

  it('Próximos em ordem cronológica, e a ocorrência seguinte da rotina já aparece', () => {
    expect(itensDoBloco(itens, 'proximos', AGORA, FUSO).map(({ chave }) => chave)).toEqual(['lembrete:amanha', 'lembrete:mes-que-vem', 'lembrete:relatorio:2026-10-05'])
  })

  it('Todos não inclui concluídos; tarefa sem data aparece em Todos e não em Hoje nem Próximos', () => {
    const todos = itensDoBloco(itens, 'todos', AGORA, FUSO).map(({ chave }) => chave)
    expect(todos).toContain('lembrete:sem-data')
    expect(todos).not.toContain('lembrete:feito')
    expect(itensDoBloco(itens, 'hoje', AGORA, FUSO).map(({ chave }) => chave)).not.toContain('lembrete:sem-data')
    expect(itensDoBloco(itens, 'proximos', AGORA, FUSO).map(({ chave }) => chave)).not.toContain('lembrete:sem-data')
  })

  it('Urgentes: prioridade urgente e vencidos, sem duplicar', () => {
    const urgente = { ...itens.find(({ chave }) => chave === 'lembrete:atrasado')!, prioridade: 'urgente' as const }
    const comDuplicado = [...itens.filter(({ chave }) => chave !== 'lembrete:atrasado'), urgente, urgente]
    expect(itensDoBloco(comDuplicado, 'urgentes', AGORA, FUSO).map(({ chave }) => chave)).toEqual(['lembrete:atrasado', 'lembrete:passou-hoje', 'lembrete:amanha'])
  })

  it('Sinalizados independe da prioridade e da data', () => {
    expect(itensDoBloco(itens, 'sinalizados', AGORA, FUSO).map(({ chave }) => chave)).toEqual(['lembrete:hoje-tarde', 'lembrete:sem-data'])
  })

  it('Concluídos guarda o histórico, inclusive a ocorrência concluída da rotina, sem concluir a série', () => {
    expect(itensDoBloco(itens, 'concluidos', AGORA, FUSO).map(({ chave }) => chave)).toEqual(['lembrete:relatorio:2026-09-05', 'lembrete:feito'])
    expect(itens.find(({ chave }) => chave === 'lembrete:relatorio:2026-10-05')?.concluido).toBe(false)
  })

  it('contagens e contador do menu: atrasados e de hoje, cada um uma vez', () => {
    expect(contagensDosBlocos([...itens, ...itens], AGORA, FUSO)).toEqual({ hoje: 4, proximos: 3, todos: 8, sinalizados: 2, urgentes: 3, concluidos: 2 })
    expect(contadorDoMenu([...itens, ...itens], AGORA, FUSO)).toBe(4)
  })

  it('situação perto da meia-noite: 23:59 de hoje ainda é hoje; 00:01 de amanhã é amanhã', () => {
    const quase = itensDosLembretes([lembrete('x', { data: '2026-09-14', hora: '23:59' }), lembrete('y', { data: '2026-09-15', hora: '00:01' })])
    const noite = new Date('2026-09-15T02:58:00.000Z') // 23:58 em Belém
    expect(quase.map((item) => situacaoDoItem(item, noite, FUSO))).toEqual(['hoje', 'amanha'])
  })

  it('só esta ocorrência alterada: muda a data e o título dela e não os das outras', () => {
    const serie = lembrete('rotina', { titulo: 'Enviar o itinerário aos irmãos', data: '2026-09-20', hora: '09:00', repeticao: { frequencia: 'mensal', intervalo: 1, diaDoMes: 20 }, ocorrencias: { '2026-09-20': { alteracao: { data: '2026-09-21', titulo: 'Enviar o itinerário (atrasado)' } } } })
    const [aberta] = itensDosLembretes([serie])
    expect(aberta).toMatchObject({ ocorrencia: '2026-09-20', data: '2026-09-21', titulo: 'Enviar o itinerário (atrasado)' })
    const depois = itensDosLembretes([{ ...serie, ocorrencias: { ...serie.ocorrencias, '2026-09-20': { ...serie.ocorrencias['2026-09-20'], estado: 'concluida' } } }])
    expect(depois.find(({ concluido }) => !concluido)).toMatchObject({ ocorrencia: '2026-10-20', data: '2026-10-20', titulo: 'Enviar o itinerário aos irmãos' })
  })
})

describe('pesquisa', () => {
  it('encontra por título, lista, área e igreja, sem ligar para acento', () => {
    const itens = itensDosLembretes([lembrete('a', { titulo: 'Relatório mensal', listaId: 'lista-rotinas' }), lembrete('b', { titulo: 'Comprar pão', relacionado: { churchId: 'igreja-a' } })])
    const contexto = { nomeDaLista: (id: string) => ({ 'lista-rotinas': 'Rotinas', 'lista-pessoal': 'Pessoal' } as Record<string, string>)[id], nomeDaIgreja: (id: string) => (id === 'igreja-a' ? 'Igreja Central de Curuçá' : undefined) }
    expect(pesquisarItens(itens, 'RELATORIO', contexto).map(({ lembreteId }) => lembreteId)).toEqual(['a'])
    expect(pesquisarItens(itens, 'rotinas', contexto).map(({ lembreteId }) => lembreteId)).toEqual(['a'])
    expect(pesquisarItens(itens, 'curuca', contexto).map(({ lembreteId }) => lembreteId)).toEqual(['b'])
  })
})

describe('tarefas das áreas', () => {
  const vazio: DadosDasAreas = { tarefas: [], acompanhamentos: [], pedidos: [], tarefasDeComissao: [], processos: [], campanhas: [], metas: [], eventos: [], contas: [], necessidades: [] }
  const tarefa = { id: 't1', title: 'Ligar para a família', description: '', dueAt: '2026-09-14', priority: 'high', status: 'pending', churchId: 'igreja-a', relatedType: null, relatedId: null, reminderMinutes: null, remindAt: '2026-09-14T15:00', createdAt: '', updatedAt: '' } as const

  it('a tarefa da origem vira um item com chave estável, sem cópia; mudar na origem muda o item', () => {
    const [item] = itensDasAreas({ ...vazio, tarefas: [tarefa] }, new Map(), AGORA, FUSO)
    expect(item).toMatchObject({ chave: 'task:t1', origem: 'task:t1', area: 'visitacao', titulo: 'Ligar para a família', data: '2026-09-14', hora: '15:00', prioridade: 'importante', link: '/app/visitacao?aba=tarefas', podeConcluir: true })
    const [depois] = itensDasAreas({ ...vazio, tarefas: [{ ...tarefa, title: 'Ligar para a família amanhã', status: 'completed', updatedAt: '2026-09-14T14:00:00.000Z' }] }, new Map(), AGORA, FUSO)
    expect(depois).toMatchObject({ titulo: 'Ligar para a família amanhã', concluido: true })
    expect(itensDasAreas({ ...vazio, tarefas: [] }, new Map(), AGORA, FUSO)).toEqual([])
  })

  it('metadados só acrescentam bandeira, prioridade, adiamento e lista', () => {
    const meta: MetadadosDeTarefaEntity = { id: 'm', origem: 'task:t1', sinalizado: true, prioridade: 'urgente', adiadaPara: { data: '2026-09-16', hora: '09:00' }, listaId: 'lista-pessoal', createdAt: '', updatedAt: '' }
    const [item] = itensDasAreas({ ...vazio, tarefas: [tarefa] }, new Map([['task:t1', meta]]), AGORA, FUSO)
    expect(item).toMatchObject({ sinalizado: true, prioridade: 'urgente', data: '2026-09-16', hora: '09:00', listaId: 'lista-pessoal', titulo: 'Ligar para a família' })
  })

  it('necessidade de material que já abriu tarefa não conta duas vezes; compromisso passado sai; origem sem conclusão abre a tela', () => {
    const dados: DadosDasAreas = {
      ...vazio,
      tarefas: [tarefa],
      necessidades: [
        { id: 'n1', item: 'Hinários', quantity: 10, unit: 'unit', priority: 'high', reason: '', notes: '', status: 'to_request', stockMaterialId: null, taskId: 't1', createdAt: '', updatedAt: '' },
        { id: 'n2', item: 'Lições', quantity: 20, unit: 'unit', priority: 'normal', reason: '', notes: '', status: 'to_request', stockMaterialId: null, taskId: null, createdAt: '', updatedAt: '' },
      ] as unknown as DadosDasAreas['necessidades'],
      eventos: [
        { id: 'e1', title: 'Visita marcada', startAt: '2026-09-14T16:00', endAt: '2026-09-14T17:00', reminderMinutes: 15, churchId: null, allDay: false },
        { id: 'e2', title: 'Compromisso de ontem', startAt: '2026-09-13T16:00', endAt: '2026-09-13T17:00', reminderMinutes: 15, churchId: null, allDay: false },
        { id: 'e3', title: 'Sem lembrete', startAt: '2026-09-15T16:00', endAt: '2026-09-15T17:00', reminderMinutes: null, churchId: null, allDay: false },
      ] as unknown as DadosDasAreas['eventos'],
    }
    const chaves = itensDasAreas(dados, new Map(), AGORA, FUSO).map(({ chave }) => chave)
    expect(chaves).toEqual(['task:t1', 'agenda_event:e1', 'material_need:n2'])
    const material = itensDasAreas(dados, new Map(), AGORA, FUSO).find(({ chave }) => chave === 'material_need:n2')!
    expect(material).toMatchObject({ podeConcluir: false, link: '/app/materiais', data: null })
  })

  it('manuais e integrados juntos não se confundem', () => {
    const tudo: ItemDaCentral[] = [...itensDosLembretes([lembrete('a', { data: '2026-09-14' })]), ...itensDasAreas({ ...vazio, tarefas: [tarefa] }, new Map(), AGORA, FUSO)]
    expect(new Set(tudo.map(({ chave }) => chave)).size).toBe(2)
    expect(contadorDoMenu(tudo, AGORA, FUSO)).toBe(2)
  })
})
