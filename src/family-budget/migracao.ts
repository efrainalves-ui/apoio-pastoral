import { eLegado, lerOAntigo, type LancamentoLegado, type RegistrosAntigos } from './adaptador'
import type { LancamentoData } from './lancamento'

/**
 * A migração definitiva dos lançamentos financeiros antigos.
 *
 * Reescrever cada registro financeiro do pastor num banco cifrado é o passo
 * mais arriscado desta reconstrução. Três decisões o tornam seguro:
 *
 * Nada é apagado. O registro antigo continua exatamente onde está; a migração
 * só acrescenta o equivalente no formato novo e anota o que já passou.
 *
 * O identificador é o mesmo. Rodar de novo reescreve o mesmo registro em vez de
 * criar um segundo — e a migração pode ser interrompida no meio sem deixar
 * rastro duplicado.
 *
 * O que já migrou some da leitura antiga. Sem isso, cada lançamento apareceria
 * duas vezes nas telas e o mês fecharia com o dobro do que aconteceu.
 */

export interface PlanoDeMigracao {
  /** O que ainda precisa ser gravado, já no formato novo. */
  paraGravar: Array<LancamentoData & { id: string }>
  /** Quantos já tinham migrado antes desta rodada. */
  jaMigrados: number
  total: number
}

/** Tira o que só existe para a leitura do formato antigo. */
function semMarcaDeLegado(legado: LancamentoLegado): LancamentoData & { id: string } {
  const { legado: _legado, ...dados } = legado
  void _legado
  return dados
}

export function planoDeMigracao(
  registros: RegistrosAntigos,
  jaMigrados: ReadonlySet<string>,
): PlanoDeMigracao {
  const todos = lerOAntigo(registros)
  const pendentes = todos.filter(({ id }) => !jaMigrados.has(id))
  return {
    paraGravar: pendentes.map(semMarcaDeLegado),
    jaMigrados: todos.length - pendentes.length,
    total: todos.length,
  }
}

/**
 * O que ainda deve ser lido pelo caminho antigo.
 *
 * Depois de migrado, o registro tem um equivalente no formato novo com o mesmo
 * identificador. Continuar lendo os dois somaria o mesmo lançamento duas vezes.
 */
export function aindaLegados(
  legados: readonly LancamentoLegado[],
  jaMigrados: ReadonlySet<string>,
): LancamentoLegado[] {
  return legados.filter(({ id }) => !jaMigrados.has(id))
}

/**
 * Junta o que veio dos dois formatos, sem repetir.
 *
 * Se um identificador existe nos dois lados, o formato novo é o que vale: ele
 * é o que o pastor pode editar, e o antigo é a versão de onde ele veio.
 */
export function unir(
  novos: ReadonlyArray<LancamentoData & { id: string }>,
  legados: readonly LancamentoLegado[],
): Array<(LancamentoData & { id: string }) | LancamentoLegado> {
  const idsNovos = new Set(novos.map(({ id }) => id))
  return [...novos, ...legados.filter(({ id }) => !idsNovos.has(id))]
}

export { eLegado }
