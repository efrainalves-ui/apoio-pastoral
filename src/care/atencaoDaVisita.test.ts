import { describe, expect, it } from 'vitest'
import { atencaoDaVisita, inicioDaSemana, resumoDaVisitacao } from './atencaoDaVisita'
import type { FollowUpEntity, TaskEntity, VisitEntity } from './types'

const HOJE = '2026-09-10'

function visita(overrides: Partial<VisitEntity> = {}): VisitEntity {
  return {
    id: 'visita-ficticia', targetType: 'person', targetId: 'pessoa-ficticia', churchId: 'igreja-ficticia',
    scheduledEventId: null, mode: 'full', status: 'completed', currentVersion: 1,
    versions: [{ version: 1, correctedAt: `${HOJE}T10:00:00.000Z`, answers: [], participants: [], reason: 'routine', startAt: `${HOJE}T10:00:00.000Z`, endAt: `${HOJE}T10:30:00.000Z`, notes: '' }],
    createdAt: `${HOJE}T10:00:00.000Z`, updatedAt: `${HOJE}T10:00:00.000Z`, ...overrides,
  }
}

function acompanhamento(overrides: Partial<FollowUpEntity> = {}): FollowUpEntity {
  return {
    id: 'acompanhamento-ficticio', visitId: 'visita-ficticia', subjectType: 'person', subjectId: 'pessoa-ficticia',
    churchId: 'igreja-ficticia', kind: 'call', dueAt: '2026-09-20', status: 'pending', notes: '',
    createdAt: `${HOJE}T10:00:00.000Z`, updatedAt: `${HOJE}T10:00:00.000Z`, ...overrides,
  }
}

function tarefa(overrides: Partial<TaskEntity> = {}): TaskEntity {
  return {
    id: 'tarefa-ficticia', title: 'Tarefa fictícia', description: '', dueAt: '2026-09-20', priority: 'high',
    status: 'pending', churchId: 'igreja-ficticia', relatedType: 'visit', relatedId: 'visita-ficticia',
    reminderMinutes: null, createdAt: `${HOJE}T10:00:00.000Z`, updatedAt: `${HOJE}T10:00:00.000Z`, ...overrides,
  }
}

describe('atenção da visita', () => {
  it('não marca nada quando não sobrou nada em aberto', () => {
    expect(atencaoDaVisita(visita(), [], [], HOJE)).toBeNull()
  })

  it('a tarefa de prioridade alta vence as demais, porque é a que pede ação mais cedo', () => {
    const vencido = acompanhamento({ dueAt: '2026-09-01', kind: 'revisit' })
    expect(atencaoDaVisita(visita(), [vencido], [tarefa()], HOJE)).toBe('urgente')
  })

  it('o acompanhamento vencido vem antes do retorno', () => {
    expect(atencaoDaVisita(visita(), [acompanhamento({ dueAt: '2026-09-01', kind: 'revisit' })], [], HOJE)).toBe('atrasada')
  })

  it('visitar novamente é retorno', () => {
    expect(atencaoDaVisita(visita(), [acompanhamento({ kind: 'revisit' })], [], HOJE)).toBe('retorno')
  })

  it('qualquer outro acompanhamento aberto é pendente', () => {
    expect(atencaoDaVisita(visita(), [acompanhamento({ kind: 'call' })], [], HOJE)).toBe('pendente')
  })

  it('o que já foi concluído ou cancelado não pesa mais', () => {
    expect(atencaoDaVisita(visita(), [acompanhamento({ status: 'completed' })], [tarefa({ status: 'completed' })], HOJE)).toBeNull()
    expect(atencaoDaVisita(visita(), [acompanhamento({ status: 'cancelled' })], [], HOJE)).toBeNull()
  })

  it('alcança o acompanhamento ligado à pessoa mesmo vindo de outra visita', () => {
    const deOutraVisita = acompanhamento({ visitId: 'outra-visita-ficticia', kind: 'revisit' })
    expect(atencaoDaVisita(visita(), [deOutraVisita], [], HOJE)).toBe('retorno')
  })

  it('não confunde a pendência de outra pessoa', () => {
    const deOutraPessoa = acompanhamento({ visitId: 'outra-visita-ficticia', subjectId: 'outra-pessoa-ficticia' })
    expect(atencaoDaVisita(visita(), [deOutraPessoa], [], HOJE)).toBeNull()
    const tarefaDeOutra = tarefa({ relatedType: 'person', relatedId: 'outra-pessoa-ficticia' })
    expect(atencaoDaVisita(visita(), [], [tarefaDeOutra], HOJE)).toBeNull()
  })

  it('tarefa de prioridade normal não é urgência', () => {
    expect(atencaoDaVisita(visita(), [], [tarefa({ priority: 'normal' })], HOJE)).toBeNull()
  })
})

describe('resumo da visitação', () => {
  it('conta pela mesma leitura que etiqueta as linhas', () => {
    const visitas = [
      visita({ id: 'v1', targetId: 'p1' }),
      visita({ id: 'v2', targetId: 'p2' }),
      visita({ id: 'v3', targetId: 'p3' }),
      visita({ id: 'v4', targetId: 'p4' }),
    ]
    const acompanhamentos = [
      acompanhamento({ id: 'a2', visitId: 'v2', subjectId: 'p2', kind: 'revisit' }),
      acompanhamento({ id: 'a3', visitId: 'v3', subjectId: 'p3', dueAt: '2026-08-01' }),
    ]
    const tarefas = [tarefa({ id: 't1', relatedId: 'v1' })]

    expect(resumoDaVisitacao(visitas, acompanhamentos, tarefas, HOJE)).toEqual({
      visitas: 4, urgentes: 1, retornos: 1, atrasadas: 1, pendentes: 0, semana: 4,
    })
  })

  it('conta pendentes e o que caiu nesta semana', () => {
    const daSemana = visita({ id: 'v9', targetId: 'p9' })
    const antiga = visita({ id: 'v8', targetId: 'p8' })
    antiga.versions[0]!.startAt = '2026-08-01T10:00:00.000Z'
    const pendente = acompanhamento({ id: 'a9', visitId: 'v9', subjectId: 'p9', kind: 'call' })

    expect(resumoDaVisitacao([daSemana, antiga], [pendente], [], HOJE)).toEqual({
      visitas: 2, urgentes: 0, retornos: 0, atrasadas: 0, pendentes: 1, semana: 1,
    })
  })
})

describe('início da semana', () => {
  it('volta ao domingo', () => {
    expect(inicioDaSemana(new Date(2026, 8, 10))).toBe('2026-09-06')
    expect(inicioDaSemana(new Date(2026, 8, 6))).toBe('2026-09-06')
  })
})
