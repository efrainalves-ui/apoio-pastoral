import { trimestreDaData } from '../goals/areas'
import type { GoalEntryEntity } from '../goals/types'
import type { EvangelismCampaignEntity } from '../evangelism/types'
import { conferirCampanhas } from './campanhas'
import { lancamentosDoTrimestre, METRICAS_DO_RELATORIO, type LancamentoDeMeta } from './metas'
import { leituraDaIgreja, trimestresDoAno } from './painel'
import { compararTrimestres, type RelatorioIntegradoEntity } from './types'

/**
 * Onde os números confirmados do Relatório Integrado chegam, e o que ainda
 * falta conferir ou registrar. Nada aqui grava.
 */

export const ehLancamentoDoRelatorio = (entry: Pick<GoalEntryEntity, 'source' | 'reference' | 'metric'>) =>
  entry.source === 'pdf' && entry.reference.startsWith('Relatório Integrado') && METRICAS_DO_RELATORIO.includes(entry.metric)

const chave = ({ churchId, metric, date, amount }: Pick<LancamentoDeMeta, 'churchId' | 'metric' | 'date' | 'amount'>) => `${churchId}|${metric}|${date}|${amount}`

/**
 * Os trimestres cujos lançamentos nas metas não batem com o que está guardado.
 *
 * É o que recalcula o relatório já importado sem importar de novo: compara o
 * que os relatórios confirmados geram com o que existe nas metas e só devolve
 * o trimestre que diverge. Rodar duas vezes seguidas devolve nada na segunda,
 * e por isso não duplica.
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

/** O valor que vale no ano para um indicador de fotografia: o último trimestre confirmado. */
export function valorVigente(relatorios: readonly RelatorioIntegradoEntity[], churchId: string, indicadorId: string, ano: number): { numero: number; trimestre: string } | null {
  const leitura = leituraDaIgreja(relatorios, churchId, indicadorId, { ano, trimestre: null })
  return leitura.situacao === 'informado' && leitura.numero !== null && leitura.trimestre ? { numero: leitura.numero, trimestre: leitura.trimestre } : null
}

export const UNIDADES_DE_ACAO = 'escola-sabatina--numero-de-unidades-de-acao'
export const PEQUENOS_GRUPOS = 'escola-sabatina--numero-de-pequenos-grupos-da-igreja'

export interface CadastroDaIgreja { unidades: number; pequenosGrupos: number }

export const LIGACOES_COM_CADASTRO: ReadonlyArray<{ indicadorId: string; rotulo: string; campo: keyof CadastroDaIgreja; para: string }> = [
  { indicadorId: UNIDADES_DE_ACAO, rotulo: 'Unidades de Ação', campo: 'unidades', para: '/app/metas/uapg' },
  { indicadorId: PEQUENOS_GRUPOS, rotulo: 'Pequenos Grupos', campo: 'pequenosGrupos', para: '/app/metas/uapg' },
]

export interface DiferencaDeCadastro {
  relatorioId: string
  churchId: string
  indicadorId: string
  rotulo: string
  trimestre: string
  relatorio: number
  cadastro: number
  conferida: boolean
  para: string
}

/**
 * Onde o relatório e o cadastro discordam, nos indicadores de fotografia.
 *
 * O alcançado é o número do relatório; o cadastro aparece ao lado e os dois
 * nunca somam. A diferença vira pendência até o pastor conferir — e volta se
 * qualquer um dos dois números mudar depois.
 */
export function diferencasDeCadastro(
  relatorios: readonly RelatorioIntegradoEntity[],
  igrejas: readonly string[],
  ano: number,
  cadastro: (churchId: string) => CadastroDaIgreja,
): DiferencaDeCadastro[] {
  return igrejas.flatMap((churchId) => LIGACOES_COM_CADASTRO.flatMap(({ indicadorId, rotulo, campo, para }) => {
    const vigente = valorVigente(relatorios, churchId, indicadorId, ano)
    if (!vigente) return []
    const cadastrado = cadastro(churchId)[campo]
    if (cadastrado === vigente.numero) return []
    const relatorio = relatorios.find((item) => item.churchId === churchId && item.trimestre === vigente.trimestre)!
    const feita = relatorio.conferencias?.[indicadorId]
    return [{
      relatorioId: relatorio.id, churchId, indicadorId, rotulo, trimestre: vigente.trimestre, relatorio: vigente.numero, cadastro: cadastrado, para,
      conferida: feita?.relatorio === vigente.numero && feita.cadastro === cadastrado,
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
}

/**
 * Campanhas declaradas no relatório e ainda não cadastradas no Evangelismo.
 *
 * Campanha tem cadastro próprio, então a diferença vira convite para registrar
 * — e só vira registro quando o pastor pedir. As que já foram criadas a partir
 * do relatório contam como cadastradas, com ou sem data, e por isso pedir de
 * novo não duplica.
 */
export function campanhasParaRegistrar(
  relatorios: readonly RelatorioIntegradoEntity[],
  campanhas: readonly EvangelismCampaignEntity[],
  ano: number,
): CampanhasParaRegistrar[] {
  return trimestresDoAno(ano).flatMap((trimestre) => conferirCampanhas(relatorios, campanhas, trimestre).map((linha) => ({
    relatorioId: relatorios.find((relatorio) => relatorio.churchId === linha.churchId && relatorio.trimestre === trimestre)!.id,
    churchId: linha.churchId,
    trimestre,
    declaradas: linha.declaradas,
    cadastradas: linha.cadastradas.length,
    faltam: Math.max(0, linha.declaradas - linha.cadastradas.length),
  })))
}
