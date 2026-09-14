import { GoalsService } from '../goals/service'
import { esquecerMetasGuardadas } from '../goals/useGoalSources'
import { trimestresDesatualizados } from './ligacoes'
import { mesesDoTrimestre, METRICAS_DO_RELATORIO } from './metas'
import type { RelatorioIntegradoEntity } from './types'

/**
 * Leva às metas o que está confirmado nos relatórios guardados.
 *
 * Só regrava o trimestre que diverge, substituindo o que o relatório lançou
 * antes: o relatório já importado é recalculado sem novo envio e sem duplicar.
 */
export async function sincronizarMetas(
  accountId: string,
  key: CryptoKey,
  relatorios: readonly RelatorioIntegradoEntity[],
  metas: GoalsService = new GoalsService(),
): Promise<string[]> {
  const desatualizados = trimestresDesatualizados(relatorios, await metas.listEntries(accountId, key))
  for (const { trimestre, lancamentos } of desatualizados) {
    const { ano, meses } = mesesDoTrimestre(trimestre)
    await metas.replaceReportEntries(accountId, key, METRICAS_DO_RELATORIO, [{ ano, meses }], lancamentos)
  }
  if (desatualizados.length) esquecerMetasGuardadas()
  return desatualizados.map(({ trimestre }) => trimestre)
}
