/**
 * Quais tarefas já pedem aviso.
 *
 * A tarefa anotada só serve se lembrar de si mesma. O pastor escolhe o dia e a
 * hora; a partir daí é o aplicativo que precisa falar, e não ele que precisa
 * lembrar de abrir a lista.
 *
 * O aviso sai uma vez por tarefa e por aparelho: guardar isso no cofre faria
 * cada celular repetir o aviso do outro na próxima sincronização.
 */
export interface TarefaComLembrete {
  id: string
  title: string
  dueAt: string
  status: string
  remindAt?: string | null
}

export function lembretesVencidos(
  tarefas: readonly TarefaComLembrete[],
  agora: Date,
  jaAvisados: ReadonlySet<string>,
): TarefaComLembrete[] {
  const instante = agora.getTime()
  return tarefas.filter((tarefa) => {
    if (tarefa.status !== 'pending' || !tarefa.remindAt) return false
    if (jaAvisados.has(tarefa.id)) return false
    const quando = new Date(tarefa.remindAt).getTime()
    return Number.isFinite(quando) && quando <= instante
  })
}

/** O texto do aviso, sem nome de ninguém: a notificação aparece na tela travada. */
export function textoDoAviso(tarefas: readonly TarefaComLembrete[]): { titulo: string; corpo: string } {
  if (tarefas.length === 1) return { titulo: 'Apoio Pastoral', corpo: tarefas[0]!.title }
  return { titulo: 'Apoio Pastoral', corpo: `${tarefas.length} tarefas para fazer` }
}
