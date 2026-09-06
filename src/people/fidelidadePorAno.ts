import { situacaoNoAno, type PessoaComFidelidade } from '../goals/doadores'

/** Um pastor fica no máximo cinco anos no distrito. */
export const ANOS_DE_FIDELIDADE = 5

export interface FidelidadeDeUmAno {
  ano: number
  dizimistas: number
  naoSistematicos: number
  naoDizimistas: number
  /** Quem já tinha alguma leitura naquele ano. */
  total: number
}

/**
 * A fidelidade do distrito ano a ano.
 *
 * O financeiro e os batismos têm mês a mês porque são eventos datados. A
 * fidelidade não é evento: é uma classificação que vale até a próxima leitura.
 * Por isso a comparação aqui é anual — e é ela que mostra o movimento que
 * importa, que é gente saindo de "não dizimista" para "dizimista", ou o
 * contrário.
 *
 * Serve para duas decisões concretas que o pastor toma o ano inteiro: quem
 * convidar para liderança e onde a visitação faz mais falta.
 */
export function fidelidadePorAno(
  pessoas: readonly PessoaComFidelidade[],
  anoAtual: number,
  quantos = ANOS_DE_FIDELIDADE,
): FidelidadeDeUmAno[] {
  const anos: FidelidadeDeUmAno[] = []
  for (let ano = anoAtual - quantos + 1; ano <= anoAtual; ano += 1) {
    const situacoes = pessoas.map((pessoa) => situacaoNoAno(pessoa, ano))
    const contar = (procurada: string) => situacoes.filter((situacao) => situacao === procurada).length
    const total = situacoes.filter(Boolean).length
    // Ano sem leitura nenhuma não entra: uma coluna zerada leria como "todo
    // mundo deixou de devolver", quando o que houve foi não ter relatório.
    if (total === 0) continue
    anos.push({
      ano,
      dizimistas: contar('tither'),
      naoSistematicos: contar('non_systematic_tither'),
      naoDizimistas: contar('non_tither'),
      total,
    })
  }
  return anos
}
