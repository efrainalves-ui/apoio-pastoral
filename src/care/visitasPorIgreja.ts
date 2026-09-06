import type { VisitEntity } from './types'

export interface IgrejaVisitada {
  churchId: string
  nome: string
  visitas: VisitEntity[]
  /** Quantas pessoas foram visitadas, contando cada uma uma vez só. */
  pessoas: number
}

export interface VisitasAgrupadas {
  igrejas: IgrejaVisitada[]
  /** Pessoas distintas visitadas no distrito inteiro. */
  pessoasNoDistrito: number
}

function presentesDaVisita(visita: VisitEntity): string[] {
  const versao = visita.versions.at(-1)
  if (!versao) return []
  return versao.participants
    .filter(({ present }) => present)
    .map((participante) => participante.personId ?? participante.id)
}

/**
 * As visitas separadas por igreja, com quantas pessoas foram visitadas.
 *
 * Uma lista corrida de visitas responde "o que aconteceu"; o pastor precisa de
 * "onde ainda não fui". Separar por igreja mostra a igreja esquecida, que é
 * justamente a que a lista corrida escondia no meio das outras.
 *
 * A contagem é de **pessoas distintas**, não de visitas: visitar a mesma pessoa
 * três vezes é cuidado, não alcance, e somar as três daria a impressão de um
 * distrito mais coberto do que ele está.
 */
export function agruparVisitasPorIgreja(
  visitas: readonly VisitEntity[],
  igrejas: readonly { id: string; name: string }[],
): VisitasAgrupadas {
  const porIgreja = new Map<string, VisitEntity[]>()
  for (const visita of visitas) {
    const atual = porIgreja.get(visita.churchId) ?? []
    atual.push(visita)
    porIgreja.set(visita.churchId, atual)
  }

  const nomes = new Map(igrejas.map((igreja) => [igreja.id, igreja.name]))
  const resultado: IgrejaVisitada[] = [...porIgreja.entries()].map(([churchId, doGrupo]) => ({
    churchId,
    nome: nomes.get(churchId) ?? 'Sem igreja vinculada',
    visitas: [...doGrupo].sort((esquerda, direita) => (direita.versions.at(-1)?.startAt ?? '').localeCompare(esquerda.versions.at(-1)?.startAt ?? '')),
    pessoas: new Set(doGrupo.flatMap(presentesDaVisita)).size,
  })).sort((esquerda, direita) => esquerda.nome.localeCompare(direita.nome, 'pt-BR'))

  return {
    igrejas: resultado,
    pessoasNoDistrito: new Set(visitas.flatMap(presentesDaVisita)).size,
  }
}
