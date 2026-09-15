import { trimestreDaData } from '../goals/areas'
import type { GoalEntryEntity } from '../goals/types'
import type { EvangelismCampaignEntity } from '../evangelism/types'
import { conferirCampanhas, informouSemanaSanta } from './campanhas'
import { lancamentosDoTrimestre, METRICAS_DO_RELATORIO, type LancamentoDeMeta } from './metas'
import { leituraDaIgreja, trimestresDoAno } from './painel'
import { compararTrimestres, type RelatorioIntegradoEntity } from './types'

/**
 * Onde os números do Relatório Integrado chegam, e o que ainda pode ser
 * completado em outro módulo. Nada aqui grava.
 */

export const ehLancamentoDoRelatorio = (entry: Pick<GoalEntryEntity, 'source' | 'reference' | 'metric'>) =>
  entry.source === 'pdf' && entry.reference.startsWith('Relatório Integrado') && METRICAS_DO_RELATORIO.includes(entry.metric)

const chave = ({ churchId, metric, date, amount }: Pick<LancamentoDeMeta, 'churchId' | 'metric' | 'date' | 'amount'>) => `${churchId}|${metric}|${date}|${amount}`

/**
 * Os trimestres cujos lançamentos nas metas não batem com o que está guardado.
 *
 * É o que recalcula o relatório já importado sem importar de novo: compara o
 * que os relatórios geram com o que existe nas metas e só devolve o trimestre
 * que diverge. Rodar duas vezes seguidas devolve nada na segunda, e por isso não
 * duplica.
 */
export function trimestresDesatualizados(
  relatorios: readonly RelatorioIntegradoEntity[],
  entries: readonly GoalEntryEntity[],
): Array<{ trimestre: string; lancamentos: LancamentoDeMeta[] }> {
  const doRelatorio = entries.filter(ehLancamentoDoRelatorio)
  const trimestres = [...new Set([...relatorios.map(({ trimestre }) => trimestre), ...doRelatorio.map(({ date }) => trimestreDaData(date))])].sort(compararTrimestres)
  return trimestres.flatMap((trimestre) => {
    const esperados = lancamentosDoTrimestre(relatorios, trimestre).map(chave).sort()
    const existentes = doRelatorio.filter(({ date }) => trimestreDaData(date) === trimestre).map(chave).sort()
    return esperados.join('\n') === existentes.join('\n') ? [] : [{ trimestre, lancamentos: lancamentosDoTrimestre(relatorios, trimestre) }]
  })
}

/** O valor que vale no ano para um indicador de fotografia: o último trimestre informado. */
export function valorVigente(relatorios: readonly RelatorioIntegradoEntity[], churchId: string, indicadorId: string, ano: number): { numero: number; trimestre: string } | null {
  const leitura = leituraDaIgreja(relatorios, churchId, indicadorId, { ano, trimestre: null })
  return leitura.situacao === 'informado' && leitura.numero !== null && leitura.trimestre ? { numero: leitura.numero, trimestre: leitura.trimestre } : null
}

export const UNIDADES_DE_ACAO = 'escola-sabatina--numero-de-unidades-de-acao'
export const PEQUENOS_GRUPOS = 'escola-sabatina--numero-de-pequenos-grupos-da-igreja'
export const DUPLAS_MISSIONARIAS = 'ministerio-pessoal--numero-de-duplas-missionarias-ministrando-estudos-biblicos'

export interface CadastroDaIgreja { unidades: number; pequenosGrupos: number; duplas: number }

/**
 * Indicadores que têm um cadastro individual em outro módulo.
 *
 * Os três pedem pessoas de verdade — professor, líder, dois integrantes —, e
 * por isso a ação abre o módulo com a igreja escolhida em vez de criar registro
 * com gente inventada. Classes Bíblicas, treinamentos e presença não têm
 * cadastro individual: ficam só com o número oficial do relatório.
 */
export const LIGACOES_COM_CADASTRO: ReadonlyArray<{ indicadorId: string; rotulo: string; campo: keyof CadastroDaIgreja; para: string }> = [
  { indicadorId: UNIDADES_DE_ACAO, rotulo: 'Unidades de Ação', campo: 'unidades', para: '/app/metas/uapg' },
  { indicadorId: PEQUENOS_GRUPOS, rotulo: 'Pequenos Grupos', campo: 'pequenosGrupos', para: '/app/metas/uapg' },
  { indicadorId: DUPLAS_MISSIONARIAS, rotulo: 'Duplas missionárias', campo: 'duplas', para: '/app/metas/missao/duplas' },
]

export interface CadastroParaCompletar {
  churchId: string
  indicadorId: string
  rotulo: string
  trimestre: string
  relatorio: number
  cadastro: number
  faltam: number
  /** O módulo, já com a igreja escolhida. */
  para: string
}

/**
 * Onde o relatório informa mais do que o cadastro tem.
 *
 * O número do relatório já vale como está; aqui só aparece o que pode ser
 * completado. Cadastro maior que o relatório não vira ação: não há o que criar.
 */
export function cadastrosParaCompletar(
  relatorios: readonly RelatorioIntegradoEntity[],
  igrejas: readonly string[],
  ano: number,
  cadastro: (churchId: string) => CadastroDaIgreja,
): CadastroParaCompletar[] {
  return igrejas.flatMap((churchId) => LIGACOES_COM_CADASTRO.flatMap(({ indicadorId, rotulo, campo, para }) => {
    const vigente = valorVigente(relatorios, churchId, indicadorId, ano)
    if (!vigente) return []
    const cadastrado = cadastro(churchId)[campo]
    if (vigente.numero <= cadastrado) return []
    return [{
      churchId, indicadorId, rotulo, trimestre: vigente.trimestre, relatorio: vigente.numero, cadastro: cadastrado,
      faltam: vigente.numero - cadastrado, para: `${para}?igreja=${encodeURIComponent(churchId)}`,
    }]
  }))
}

export interface CampanhasParaRegistrar {
  relatorioId: string
  churchId: string
  trimestre: string
  declaradas: number
  cadastradas: number
  faltam: number
  /** As cadastradas que não nasceram do relatório — com data, pelo formulário. */
  cadastradasSemOrigem: number
  /** O relatório traz Semana Santa naquele trimestre e ela ainda não está cadastrada. */
  semanaSanta: boolean
}

/**
 * Campanhas informadas no relatório e ainda não cadastradas no Evangelismo.
 *
 * As que já foram criadas a partir do relatório contam como cadastradas, com ou
 * sem data, e por isso pedir de novo não duplica.
 */
export function campanhasParaRegistrar(
  relatorios: readonly RelatorioIntegradoEntity[],
  campanhas: readonly EvangelismCampaignEntity[],
  ano: number,
): CampanhasParaRegistrar[] {
  return trimestresDoAno(ano).flatMap((trimestre) => conferirCampanhas(relatorios, campanhas, trimestre).map((linha) => {
    const relatorio = relatorios.find((item) => item.churchId === linha.churchId && item.trimestre === trimestre)!
    return {
      relatorioId: relatorio.id,
      churchId: linha.churchId,
      trimestre,
      declaradas: linha.declaradas,
      cadastradas: linha.cadastradas.length,
      faltam: Math.max(0, linha.declaradas - linha.cadastradas.length),
      cadastradasSemOrigem: linha.cadastradas.filter(({ origemRelatorio }) => !(origemRelatorio?.churchId === linha.churchId && origemRelatorio.trimestre === trimestre)).length,
      semanaSanta: informouSemanaSanta(relatorio) && !linha.cadastradas.some(({ objective }) => objective === 'holy_week'),
    }
  }))
}

export interface AcoesDaIgreja {
  churchId: string
  campanhas: CampanhasParaRegistrar[]
  cadastros: CadastroParaCompletar[]
  campanhasFaltando: number
  cadastrosFaltando: number
}

/** As ações de cadastro agrupadas por igreja, da que tem mais para completar à que tem menos. */
export function acoesPorIgreja(campanhas: readonly CampanhasParaRegistrar[], cadastros: readonly CadastroParaCompletar[]): AcoesDaIgreja[] {
  const igrejas = [...new Set([...campanhas.map(({ churchId }) => churchId), ...cadastros.map(({ churchId }) => churchId)])]
  return igrejas
    .map((churchId) => {
      const suas = campanhas.filter((linha) => linha.churchId === churchId && linha.faltam > 0)
      const seus = cadastros.filter((linha) => linha.churchId === churchId)
      return {
        churchId, campanhas: suas, cadastros: seus,
        campanhasFaltando: suas.reduce((soma, { faltam }) => soma + faltam, 0),
        cadastrosFaltando: seus.reduce((soma, { faltam }) => soma + faltam, 0),
      }
    })
    .filter(({ campanhas: suas, cadastros: seus }) => suas.length + seus.length > 0)
    .sort((a, b) => (b.campanhasFaltando + b.cadastrosFaltando) - (a.campanhasFaltando + a.cadastrosFaltando))
}
