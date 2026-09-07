import { describe, expect, it } from 'vitest'
import { lembretesVencidos, textoDoAviso, type TarefaComLembrete } from './lembretes'

const tarefa = (id: string, remindAt: string | null, status = 'pending'): TarefaComLembrete =>
  ({ id, title: `Tarefa ${id}`, dueAt: '2026-09-10T12:00:00.000Z', status, ...(remindAt ? { remindAt } : {}) })

const agora = new Date('2026-09-08T09:00:00.000Z')

describe('quais tarefas já pedem aviso', () => {
  it('avisa a que chegou a hora e cala a que ainda não chegou', () => {
    const vencidos = lembretesVencidos([
      tarefa('a', '2026-09-08T08:59:00.000Z'),
      tarefa('b', '2026-09-08T09:30:00.000Z'),
    ], agora, new Set())

    expect(vencidos.map(({ id }) => id)).toEqual(['a'])
  })

  it('não avisa tarefa sem hora marcada nem tarefa concluída', () => {
    const vencidos = lembretesVencidos([
      tarefa('sem-hora', null),
      tarefa('feita', '2026-09-01T08:00:00.000Z', 'completed'),
    ], agora, new Set())

    expect(vencidos).toHaveLength(0)
  })

  it('não repete o aviso já dado', () => {
    // Sem isto o aviso voltaria a cada verificação, de minuto em minuto.
    const vencidos = lembretesVencidos([tarefa('a', '2026-09-08T08:00:00.000Z')], agora, new Set(['a']))

    expect(vencidos).toHaveLength(0)
  })
})

describe('o texto do aviso', () => {
  it('com uma tarefa, mostra o título', () => {
    expect(textoDoAviso([tarefa('a', '2026-09-08T08:00:00.000Z')]).corpo).toBe('Tarefa a')
  })

  it('com várias, mostra só a contagem', () => {
    // A notificação aparece na tela travada, à vista de quem estiver perto.
    expect(textoDoAviso([tarefa('a', null), tarefa('b', null)]).corpo).toBe('2 tarefas para fazer')
  })
})
