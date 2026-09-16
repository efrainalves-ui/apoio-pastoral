import type { FidelityCategory, FidelitySnapshot, PersonEntity } from './types'

/*
  Quando as duas leituras são do mesmo período, vale a que reconhece mais.

  Os dois cadastros da mesma pessoa costumam vir da mesma importação, com o mesmo
  carimbo de hora: "a mais recente" não decide nada, e o desempate caía na ordem
  alfabética. Dentro do mesmo período os registros são complementares, não
  contraditórios — o dízimo que caiu num deles foi devolvido pela pessoa —, então
  quem reconhece a entrega prevalece.
*/
const FORCA_DA_CATEGORIA: Record<FidelityCategory, number> = { non_tither: 0, non_systematic_tither: 1, tither: 2 }

/**
 * O grupo a que um cadastro pertence.
 *
 * Quem nunca foi vinculado é um grupo de um só — assim a regra vale para todo
 * mundo e não existe caminho especial para "pessoa normal".
 */
export const grupoDaPessoa = (pessoa: Pick<PersonEntity, 'id' | 'linkedGroupId'>) => pessoa.linkedGroupId ?? pessoa.id

/** A leitura que vale para o grupo: a mais recente entre os cadastros vinculados. */
export function fidelidadeDoGrupo(cadastros: readonly PersonEntity[]): FidelitySnapshot | null {
  return cadastros
    .map(({ fidelity }) => fidelity)
    .filter((leitura): leitura is FidelitySnapshot => Boolean(leitura))
    .sort((esquerda, direita) => (esquerda.referenceYear ?? 0) - (direita.referenceYear ?? 0)
      || esquerda.updatedAt.localeCompare(direita.updatedAt)
      || FORCA_DA_CATEGORIA[esquerda.category] - FORCA_DA_CATEGORIA[direita.category])
    .at(-1) ?? null
}

/**
 * Um registro por pessoa de verdade, com a fidelidade do grupo.
 *
 * Dois cadastros da mesma pessoa contavam duas vezes: ela aparecia como
 * dizimista num total e como não dizimista no outro, e a soma das igrejas ficava
 * maior que o distrito. Depois de vinculados, o grupo entra uma vez só, e a
 * leitura que vale é a mais recente que qualquer um dos cadastros recebeu.
 *
 * O representante é o cadastro mais antigo do grupo — estável, para a lista não
 * dançar a cada leitura nova.
 */
export function umaPorPessoa(pessoas: readonly PersonEntity[]): PersonEntity[] {
  const grupos = new Map<string, PersonEntity[]>()
  for (const pessoa of pessoas) {
    const chave = grupoDaPessoa(pessoa)
    grupos.set(chave, [...(grupos.get(chave) ?? []), pessoa])
  }
  return [...grupos.values()].map((cadastros) => {
    if (cadastros.length === 1) return cadastros[0]!
    const representante = [...cadastros].sort((esquerda, direita) => esquerda.createdAt.localeCompare(direita.createdAt) || esquerda.id.localeCompare(direita.id))[0]!
    const leitura = fidelidadeDoGrupo(cadastros)
    /*
      A situação de renda também é uma só: se o pastor respondeu em qualquer um
      dos cadastros, a resposta vale para a pessoa. "Ainda não avaliada" só
      permanece quando nenhum deles foi avaliado.
    */
    const renda = cadastros.map(({ incomeStatus }) => incomeStatus).find((status) => status !== 'unknown') ?? 'unknown'
    return { ...representante, fidelity: leitura, incomeStatus: renda }
  })
}
