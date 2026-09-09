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

/**
 * O texto do aviso, sem nada do que a tarefa diz.
 *
 * A notificação aparece na tela travada, à vista de quem estiver perto. O
 * título de uma tarefa pastoral é justamente o que não pode aparecer ali:
 * "Conversar com Fulano sobre a separação" resolve-se abrindo o aplicativo, e
 * não por cima do ombro de quem carrega o celular.
 */
export function textoDoAviso(tarefas: readonly TarefaComLembrete[]): { titulo: string; corpo: string } {
  if (tarefas.length === 1) return { titulo: 'Apoio Pastoral', corpo: 'Você tem uma tarefa pastoral pendente.' }
  return { titulo: 'Apoio Pastoral', corpo: `Você tem ${tarefas.length} tarefas pastorais pendentes.` }
}
