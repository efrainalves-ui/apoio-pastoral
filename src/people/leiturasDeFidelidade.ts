import type { FidelitySnapshot } from './types'

/**
 * O ano a que uma leitura de fidelidade se refere.
 *
 * Antes o ano era o dia da importação, e isso impedia justamente o que a tela
 * promete: enviar o relatório do ano passado para comparar. Mandar o de 2025
 * hoje registraria uma leitura de 2026 e apagaria a de 2026, porque seria a
 * mais recente. Agora o relatório declara o ano que ele cobre.
 *
 * As leituras antigas, gravadas antes desta mudança, continuam valendo pela
 * data de importação — que para elas é a melhor aproximação existente.
 */
export function anoDaLeitura(leitura: FidelitySnapshot): number {
  return leitura.referenceYear ?? new Date(leitura.importedAt || leitura.updatedAt).getFullYear()
}

export function todasAsLeituras(pessoa: {
  fidelity: FidelitySnapshot | null
  fidelityHistory: readonly FidelitySnapshot[]
}): FidelitySnapshot[] {
  return [...pessoa.fidelityHistory, ...(pessoa.fidelity ? [pessoa.fidelity] : [])]
}

/** A leitura daquele ano exato, se existir. */
export function leituraDoAno(
  pessoa: { fidelity: FidelitySnapshot | null; fidelityHistory: readonly FidelitySnapshot[] },
  ano: number,
): FidelitySnapshot | null {
  return todasAsLeituras(pessoa).find((leitura) => anoDaLeitura(leitura) === ano) ?? null
}

export interface FidelidadeMesclada {
  fidelity: FidelitySnapshot
  fidelityHistory: FidelitySnapshot[]
}

/**
 * Encaixa uma leitura nova no histórico da pessoa, pelo ano.
 *
 * Duas regras, e as duas existem por um engano concreto:
 *
 *   - a leitura mais recente é a do maior ano, não a última que chegou. Sem
 *     isso, enviar o relatório de 2025 depois do de 2026 rebaixaria a pessoa à
 *     situação do ano passado;
 *   - reenviar um ano substitui aquele ano, em vez de acumular. O relatório é a
 *     verdade sobre o período que traz, e mandá-lo duas vezes é corrigir, não
 *     registrar duas histórias.
 */
export function mesclarFidelidade(
  pessoa: { fidelity: FidelitySnapshot | null; fidelityHistory: readonly FidelitySnapshot[] },
  nova: FidelitySnapshot,
): FidelidadeMesclada {
  const ano = anoDaLeitura(nova)
  const guardadas = todasAsLeituras(pessoa).filter((leitura) => anoDaLeitura(leitura) !== ano)
  const ordenadas = [...guardadas, nova].sort((esquerda, direita) => anoDaLeitura(esquerda) - anoDaLeitura(direita))
  return { fidelity: ordenadas.at(-1)!, fidelityHistory: ordenadas.slice(0, -1) }
}
