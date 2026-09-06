import type { FidelityCategory, FidelitySnapshot } from '../people/types'

/**
 * Quantas pessoas do distrito devolvem, e como isso mudou de um ano para o
 * outro.
 *
 * A meta financeira tem duas metades. Uma é dinheiro — quanto entrou. A outra é
 * gente: quantos passaram a devolver. Elas contam histórias diferentes, e a
 * segunda é a que diz se o crescimento veio de mais pessoas participando ou de
 * poucas dando mais. Por isso as duas vivem na mesma área.
 *
 * Doador aqui é quem devolve, sistemático ou não. Contar só o dizimista
 * sistemático esconderia justamente quem começou este ano e ainda não tem
 * regularidade — que é a pessoa cujo movimento a meta existe para acompanhar.
 */
export interface PessoaComFidelidade {
  fidelity: FidelitySnapshot | null
  fidelityHistory: readonly FidelitySnapshot[]
}

function ehDoador(categoria: FidelityCategory | undefined): boolean {
  return categoria === 'tither' || categoria === 'non_systematic_tither'
}

function anoDe(snapshot: FidelitySnapshot): number {
  return new Date(snapshot.importedAt || snapshot.updatedAt).getFullYear()
}

/**
 * A situação da pessoa no fim de um ano: a leitura mais recente feita **até**
 * aquele ano.
 *
 * Usar a leitura de hoje para todos os anos faria o número do ano passado mudar
 * sozinho a cada nova importação — e uma comparação cuja base se move não
 * compara nada.
 */
export function situacaoNoAno(pessoa: PessoaComFidelidade, ano: number): FidelityCategory | undefined {
  const leituras = [...pessoa.fidelityHistory, ...(pessoa.fidelity ? [pessoa.fidelity] : [])]
    .filter((leitura) => Number.isFinite(anoDe(leitura)) && anoDe(leitura) <= ano)
    .sort((esquerda, direita) => anoDe(esquerda) - anoDe(direita))
  return leituras.at(-1)?.category
}

export function contarDoadores(pessoas: readonly PessoaComFidelidade[], ano: number): number {
  return pessoas.filter((pessoa) => ehDoador(situacaoNoAno(pessoa, ano))).length
}

export interface ComparativoDeDoadores {
  atual: number
  anterior: number
  temAnterior: boolean
  /** Alvo em pessoas, traduzido da porcentagem combinada. */
  objetivo: number
  percentualAlcancado: number
  semBaseDeComparacao: boolean
}

/**
 * O progresso da meta de doadores, com a mesma regra da meta financeira: a meta
 * é combinada em porcentagem e traduzida em número na hora de medir.
 *
 * O objetivo é arredondado para cima porque pessoa não se divide: dez por cento
 * a mais que sete são 7,7, e a meta só se cumpre em oito.
 */
export function comparativoDeDoadores(
  pessoas: readonly PessoaComFidelidade[],
  ano: number,
  aumentoDesejado: number,
): ComparativoDeDoadores {
  const atual = contarDoadores(pessoas, ano)
  const anterior = contarDoadores(pessoas, ano - 1)
  const temAnterior = anterior > 0
  const objetivo = temAnterior ? Math.ceil(anterior * (1 + aumentoDesejado / 100)) : 0
  return {
    atual,
    anterior,
    temAnterior,
    objetivo,
    percentualAlcancado: objetivo > 0 ? Math.min(100, Math.round((atual / objetivo) * 100)) : 0,
    semBaseDeComparacao: !temAnterior,
  }
}
