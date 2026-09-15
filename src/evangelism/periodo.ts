import { rotuloDoTrimestre } from '../integrated-report/types'
import { localDateKey } from '../shared/dates'
import type { EvangelismCampaignEntity } from './types'

/**
 * Onde a campanha está no tempo, calculado pelo dia de hoje do aparelho.
 *
 * A situação guardada no cadastro ("Em planejamento", "Acontecendo") é a etapa
 * de organização, escolhida à mão, e envelhece: uma campanha "Em planejamento"
 * continua assim depois de começar. Início e fim não envelhecem.
 */
export type SituacaoDoPeriodo = 'proxima' | 'em_andamento' | 'encerrada' | 'concluida' | 'cancelada' | 'sem_data'

export const ROTULOS_DA_SITUACAO: Record<SituacaoDoPeriodo, string> = {
  proxima: 'Próxima', em_andamento: 'Em andamento', encerrada: 'Encerrada', concluida: 'Concluída', cancelada: 'Cancelada', sem_data: 'Data não informada',
}

type CampanhaNoTempo = Pick<EvangelismCampaignEntity, 'startDate' | 'endDate' | 'status'> & Partial<Pick<EvangelismCampaignEntity, 'origemRelatorio'>>

/** O dia de hoje no fuso do aparelho, e não em UTC: às 23h30 em Brasília ainda é hoje. */
export function hojeLocal(agora: Date = new Date()): string {
  return localDateKey(agora)
}

export const fimDaCampanha = ({ startDate, endDate }: Pick<CampanhaNoTempo, 'startDate' | 'endDate'>): string => endDate || startDate

export function situacaoDaCampanha(campanha: CampanhaNoTempo, hoje: string): SituacaoDoPeriodo {
  if (!campanha.startDate) return 'sem_data'
  if (campanha.status === 'cancelled') return 'cancelada'
  if (hoje < campanha.startDate) return 'proxima'
  if (hoje <= fimDaCampanha(campanha)) return 'em_andamento'
  return campanha.status === 'completed' ? 'concluida' : 'encerrada'
}

/** Ano a que a campanha pertence: o do início, ou o do trimestre do relatório quando não há data. */
export function anoDaCampanha(campanha: CampanhaNoTempo): number | null {
  const texto = campanha.startDate || campanha.origemRelatorio?.trimestre || ''
  const ano = Number(texto.slice(0, 4))
  return Number.isInteger(ano) && ano > 0 ? ano : null
}

const MESES = ['jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.']
const partes = (data: string) => ({ ano: data.slice(0, 4), mes: MESES[Number(data.slice(5, 7)) - 1] ?? '', dia: String(Number(data.slice(8, 10))) })

/** `11–20 de set.`, `28 de set.–3 de out.`, `13 de set.`; o ano só aparece quando o período atravessa a virada. */
export function periodoCurto(inicio: string, fim: string = inicio): string {
  const a = partes(inicio); const b = partes(fim || inicio)
  if (inicio === (fim || inicio)) return `${a.dia} de ${a.mes}`
  if (a.ano !== b.ano) return `${a.dia} de ${a.mes} de ${a.ano}–${b.dia} de ${b.mes} de ${b.ano}`
  if (a.mes === b.mes) return `${a.dia}–${b.dia} de ${a.mes}`
  return `${a.dia} de ${a.mes}–${b.dia} de ${b.mes}`
}

/** O que mostrar no lugar das datas: o período, ou "Data não informada" com o trimestre, sem inventar dia. */
export function textoDoPeriodo(campanha: CampanhaNoTempo): string {
  if (campanha.startDate) return periodoCurto(campanha.startDate, fimDaCampanha(campanha))
  return campanha.origemRelatorio ? `Data não informada · ${rotuloDoTrimestre(campanha.origemRelatorio.trimestre)}` : 'Data não informada'
}

/** Meses (1 a 12) do ano em que a campanha acontece. Sem data, nenhum: ela não cai em mês algum. */
export function mesesDaCampanha(campanha: CampanhaNoTempo, ano: number): number[] {
  if (!campanha.startDate) return []
  const inicio = campanha.startDate.slice(0, 7); const fim = fimDaCampanha(campanha).slice(0, 7)
  return Array.from({ length: 12 }, (_, indice) => indice + 1).filter((mes) => {
    const chave = `${ano}-${String(mes).padStart(2, '0')}`
    return chave >= inicio && chave <= fim
  })
}

export function campanhasEmAndamento<T extends CampanhaNoTempo>(campanhas: readonly T[], hoje: string): T[] {
  return campanhas.filter((campanha) => situacaoDaCampanha(campanha, hoje) === 'em_andamento')
    .sort((a, b) => fimDaCampanha(a).localeCompare(fimDaCampanha(b)))
}

/** Só as que ainda vão começar, da mais próxima para a mais distante. Já iniciadas e sem data não entram. */
export function proximasCampanhas<T extends CampanhaNoTempo>(campanhas: readonly T[], hoje: string): T[] {
  return campanhas.filter((campanha) => situacaoDaCampanha(campanha, hoje) === 'proxima')
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
}

export function campanhasSemData<T extends CampanhaNoTempo>(campanhas: readonly T[]): T[] {
  return campanhas.filter(({ startDate }) => !startDate)
}

/** "Campanha do distrito" quando envolve mais de uma igreja ou nenhuma; o nome da igreja quando é só dela. */
export function alcanceDaCampanha(churchIds: readonly string[], nomeDaIgreja: (id: string) => string | undefined): string {
  return churchIds.length === 1 ? nomeDaIgreja(churchIds[0]!) ?? 'Igreja' : 'Campanha do distrito'
}
