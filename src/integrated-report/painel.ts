import { CATALOGO_DO_RELATORIO, indicadorPorId, type ClasseDaEscolaSabatina } from './catalogo'
import { lancamentosDoTrimestre } from './metas'
import { numeroDoValor } from './service'
import { compararTrimestres, type RelatorioIntegradoEntity, type ValorDoIndicador } from './types'

/**
 * O que a página do Relatório Integrado mostra, calculado a partir do que está
 * guardado. Nada aqui grava.
 *
 * Um período é um trimestre do ano ou o ano completo (`trimestre` nulo). Nos
 * indicadores que somam, o ano é a soma dos trimestres; nos que são fotografia
 * — Escola Sabatina, Pequenos Grupos, Unidades de Ação —, o ano vale o último
 * trimestre confirmado de cada igreja.
 */
export interface Periodo { ano: number; trimestre: number | null }

export const rotuloCurtoDoTrimestre = (trimestre: string) => `${trimestre.split('-')[1]}º tri`
export const trimestresDoAno = (ano: number) => [1, 2, 3, 4].map((numero) => `${ano}-${numero}`)
const doAno = (relatorio: RelatorioIntegradoEntity, ano: number) => relatorio.trimestre.startsWith(`${ano}-`)

/** Anos com relatório, do mais recente ao mais antigo; o ano corrente sempre entra. */
export function anosDosRelatorios(relatorios: readonly RelatorioIntegradoEntity[], anoCorrente: number): number[] {
  return [...new Set([anoCorrente, ...relatorios.map(({ trimestre }) => Number(trimestre.slice(0, 4)))])].sort((a, b) => b - a)
}

/**
 * Os estados de um número, que a tela nunca confunde.
 *
 * `informado` inclui o zero. `nao_respondido` é traço, ou pergunta sem resposta
 * num relatório entregue. `sem_relatorio` é a igreja que não entregou. `aguardando`
 * é o valor que destoou e espera confirmação. `recusado` foi visto e rejeitado.
 */
export type Situacao = 'informado' | 'nao_respondido' | 'sem_relatorio' | 'aguardando' | 'recusado'

export const ROTULO_DA_SITUACAO: Record<Situacao, string> = {
  informado: 'Informado', nao_respondido: 'Não respondido', sem_relatorio: 'Sem relatório', aguardando: 'Aguardando confirmação', recusado: 'Recusado',
}

export interface Leitura {
  situacao: Situacao
  numero: number | null
  valor: ValorDoIndicador | null
  /** Trimestre de onde o número veio, quando é um só. */
  trimestre: string | null
}

const vazia = (situacao: Situacao): Leitura => ({ situacao, numero: null, valor: null, trimestre: null })

function leituraDoTrimestre(relatorio: RelatorioIntegradoEntity | undefined, indicadorId: string): Leitura {
  if (!relatorio) return vazia('sem_relatorio')
  const valor = relatorio.valores[indicadorId]
  if (valor) return { situacao: 'informado', numero: numeroDoValor(valor), valor, trimestre: relatorio.trimestre }
  const pendente = relatorio.pendentes?.[indicadorId]
  if (pendente) return { situacao: 'aguardando', numero: numeroDoValor(pendente), valor: pendente, trimestre: relatorio.trimestre }
  if (relatorio.recusados?.includes(indicadorId)) return { ...vazia('recusado'), trimestre: relatorio.trimestre }
  return { ...vazia('nao_respondido'), trimestre: relatorio.trimestre }
}

export function leituraDaIgreja(
  relatorios: readonly RelatorioIntegradoEntity[],
  churchId: string,
  indicadorId: string,
  periodo: Periodo,
): Leitura {
  const daIgreja = relatorios.filter((relatorio) => relatorio.churchId === churchId && doAno(relatorio, periodo.ano))
  if (periodo.trimestre !== null) {
    return leituraDoTrimestre(daIgreja.find(({ trimestre }) => trimestre === `${periodo.ano}-${periodo.trimestre}`), indicadorId)
  }
  if (!daIgreja.length) return vazia('sem_relatorio')
  const leituras = [...daIgreja].sort((a, b) => compararTrimestres(a.trimestre, b.trimestre)).map((relatorio) => leituraDoTrimestre(relatorio, indicadorId))
  const informadas = leituras.filter(({ situacao }) => situacao === 'informado')
  if (!informadas.length) {
    return vazia(leituras.some(({ situacao }) => situacao === 'aguardando') ? 'aguardando' : leituras.some(({ situacao }) => situacao === 'recusado') ? 'recusado' : 'nao_respondido')
  }
  const indicador = indicadorPorId(indicadorId)
  if (indicador?.tratamento === 'somar') {
    const numeros = informadas.map(({ numero }) => numero).filter((numero): numero is number => numero !== null)
    return { situacao: 'informado', numero: numeros.length ? numeros.reduce((soma, numero) => soma + numero, 0) : null, valor: null, trimestre: informadas.length === 1 ? informadas[0]!.trimestre : null }
  }
  return informadas.at(-1)!
}

export interface LeituraDoDistrito {
  numero: number | null
  informaram: number
  naoResponderam: number
  semRelatorio: number
  aguardando: number
  recusados: number
  /** O trimestre mais recente dos números, nos indicadores de fotografia. */
  trimestre: string | null
}

export function leituraDoDistrito(
  relatorios: readonly RelatorioIntegradoEntity[],
  igrejas: readonly string[],
  indicadorId: string,
  periodo: Periodo,
): LeituraDoDistrito {
  const leituras = igrejas.map((churchId) => leituraDaIgreja(relatorios, churchId, indicadorId, periodo))
  const numeros = leituras.filter(({ situacao, numero }) => situacao === 'informado' && numero !== null).map(({ numero }) => numero!)
  const contar = (situacao: Situacao) => leituras.filter((leitura) => leitura.situacao === situacao).length
  return {
    numero: numeros.length ? numeros.reduce((soma, numero) => soma + numero, 0) : null,
    informaram: contar('informado'),
    naoResponderam: contar('nao_respondido'),
    semRelatorio: contar('sem_relatorio'),
    aguardando: contar('aguardando'),
    recusados: contar('recusado'),
    trimestre: leituras.map(({ trimestre }) => trimestre).filter((item): item is string => item !== null).sort(compararTrimestres).at(-1) ?? null,
  }
}

export type Tendencia = 'alta' | 'queda' | 'estavel' | 'sem_base'

export interface Comparacao {
  anterior: number | null
  atual: number | null
  diferenca: number | null
  /** Só quando há base: crescer sobre zero não é porcentagem. */
  percentual: number | null
  tendencia: Tendencia
}

export function comparar(anterior: number | null, atual: number | null): Comparacao {
  if (anterior === null || atual === null) return { anterior, atual, diferenca: null, percentual: null, tendencia: 'sem_base' }
  const diferenca = atual - anterior
  return {
    anterior, atual, diferenca,
    percentual: anterior > 0 ? Math.round((diferenca / anterior) * 1000) / 10 : null,
    tendencia: diferenca > 0 ? 'alta' : diferenca < 0 ? 'queda' : 'estavel',
  }
}

/** O trimestre anterior, atravessando o ano: o anterior ao 1º de 2026 é o 4º de 2025. */
export function trimestreAnterior(ano: number, trimestre: number): { ano: number; trimestre: number } {
  return trimestre === 1 ? { ano: ano - 1, trimestre: 4 } : { ano, trimestre: trimestre - 1 }
}

/** Os quatro trimestres de um ano, cada um com o próprio número — nunca acumulado. */
export function serieTrimestral(relatorios: readonly RelatorioIntegradoEntity[], igrejas: readonly string[], indicadorId: string, ano: number): LeituraDoDistrito[] {
  return [1, 2, 3, 4].map((trimestre) => leituraDoDistrito(relatorios, igrejas, indicadorId, { ano, trimestre }))
}

/**
 * A comparação que cabe no período: no trimestre, contra o anterior; no ano,
 * entre os dois últimos trimestres que têm número.
 */
export function comparacaoDoPeriodo(relatorios: readonly RelatorioIntegradoEntity[], igrejas: readonly string[], indicadorId: string, periodo: Periodo): Comparacao & { de: string | null; para: string | null } {
  if (periodo.trimestre !== null) {
    const antes = trimestreAnterior(periodo.ano, periodo.trimestre)
    return {
      ...comparar(leituraDoDistrito(relatorios, igrejas, indicadorId, antes).numero, leituraDoDistrito(relatorios, igrejas, indicadorId, periodo).numero),
      de: `${antes.ano}-${antes.trimestre}`, para: `${periodo.ano}-${periodo.trimestre}`,
    }
  }
  const comNumero = serieTrimestral(relatorios, igrejas, indicadorId, periodo.ano)
    .map((leitura, indice) => ({ leitura, trimestre: `${periodo.ano}-${indice + 1}` }))
    .filter(({ leitura }) => leitura.numero !== null)
  const [penultimo, ultimo] = comNumero.slice(-2)
  if (!penultimo || !ultimo) return { ...comparar(null, ultimo?.leitura.numero ?? null), de: null, para: ultimo?.trimestre ?? null }
  return { ...comparar(penultimo.leitura.numero, ultimo.leitura.numero), de: penultimo.trimestre, para: ultimo.trimestre }
}

/** Quem entregou cada trimestre do ano. */
export function entregasDoAno(relatorios: readonly RelatorioIntegradoEntity[], igrejas: readonly string[], ano: number): Array<{ churchId: string; trimestres: boolean[] }> {
  return igrejas.map((churchId) => ({
    churchId,
    trimestres: trimestresDoAno(ano).map((trimestre) => relatorios.some((relatorio) => relatorio.churchId === churchId && relatorio.trimestre === trimestre)),
  }))
}

export function coberturaDoPeriodo(relatorios: readonly RelatorioIntegradoEntity[], igrejas: readonly string[], periodo: Periodo): { responderam: string[]; naoResponderam: string[] } {
  const entregou = (churchId: string) => relatorios.some((relatorio) => relatorio.churchId === churchId && (periodo.trimestre === null
    ? doAno(relatorio, periodo.ano)
    : relatorio.trimestre === `${periodo.ano}-${periodo.trimestre}`))
  return { responderam: igrejas.filter(entregou), naoResponderam: igrejas.filter((churchId) => !entregou(churchId)) }
}

/**
 * Estudos bíblicos do período, gerais e da ASA somados — o mesmo cálculo que
 * alimenta a meta. Acumulam dentro do trimestre e entre os trimestres do ano.
 */
export function estudosDoPeriodo(relatorios: readonly RelatorioIntegradoEntity[], igrejas: readonly string[], periodo: Periodo): number | null {
  const ativas = new Set(igrejas)
  const trimestres = periodo.trimestre === null ? trimestresDoAno(periodo.ano) : [`${periodo.ano}-${periodo.trimestre}`]
  const lancamentos = trimestres.flatMap((trimestre) => lancamentosDoTrimestre(relatorios, trimestre))
    .filter(({ metric, churchId }) => metric === 'bible_studies' && ativas.has(churchId))
  return lancamentos.length ? lancamentos.reduce((soma, { amount }) => soma + amount, 0) : null
}

export interface EnvioGuardado { lote: string; arquivo: string; trimestre: string; igrejas: number; em: string }

/** Os envios que estão valendo: um reenvio substitui o anterior daquele trimestre. */
export function historicoDeEnvios(relatorios: readonly RelatorioIntegradoEntity[]): EnvioGuardado[] {
  const lotes = new Map<string, EnvioGuardado>()
  for (const relatorio of relatorios) {
    const chave = `${relatorio.importBatchId}|${relatorio.trimestre}`
    const atual = lotes.get(chave)
    lotes.set(chave, {
      lote: relatorio.importBatchId,
      arquivo: relatorio.origem.arquivo,
      trimestre: relatorio.trimestre,
      igrejas: (atual?.igrejas ?? 0) + 1,
      em: [atual?.em ?? '', relatorio.updatedAt].sort().at(-1)!,
    })
  }
  return [...lotes.values()].sort((a, b) => b.em.localeCompare(a.em))
}

export interface ValorAguardando { relatorio: RelatorioIntegradoEntity; indicadorId: string; rotulo: string; valor: ValorDoIndicador; numero: number | null }

export function valoresAguardando(relatorios: readonly RelatorioIntegradoEntity[], ano: number): ValorAguardando[] {
  return relatorios.filter((relatorio) => doAno(relatorio, ano)).flatMap((relatorio) =>
    Object.entries(relatorio.pendentes ?? {}).map(([indicadorId, valor]) => ({
      relatorio, indicadorId, rotulo: indicadorPorId(indicadorId)?.rotulo ?? indicadorId, valor, numero: numeroDoValor(valor),
    })))
}

/** As faixas da Escola Sabatina que o pastor acompanha, a partir das classes do relatório. */
export const FAIXAS_DA_ESCOLA_SABATINA: ReadonlyArray<{ rotulo: string; classes: readonly ClasseDaEscolaSabatina[] }> = [
  { rotulo: 'Adultos', classes: ['Adultos'] },
  { rotulo: 'Jovens', classes: ['Jovens'] },
  { rotulo: 'Adolescentes', classes: ['Adolescentes'] },
  { rotulo: 'Crianças', classes: ['Bebês', 'Iniciantes', 'Infantis', 'Primários', 'Pré-Adolescentes'] },
  { rotulo: 'Classes Bíblicas e filiais', classes: ['Classes Bíblicas', 'Filiais'] },
]

/**
 * Um indicador por classe, repartido por faixa, no período. Faixa que nenhuma
 * igreja informou fica nula — e o total é o que o relatório escreveu.
 */
export function faixasDoIndicador(
  relatorios: readonly RelatorioIntegradoEntity[],
  igrejas: readonly string[],
  indicadorId: string,
  periodo: Periodo,
): { faixas: Array<{ rotulo: string; numero: number | null }>; total: number | null } | null {
  const valores = igrejas.map((churchId) => leituraDaIgreja(relatorios, churchId, indicadorId, periodo))
    .map(({ situacao, valor }) => situacao === 'informado' && valor?.tipo === 'por_classe' ? valor : null)
    .filter((valor): valor is Extract<ValorDoIndicador, { tipo: 'por_classe' }> => valor !== null)
  if (!valores.length) return null
  return {
    faixas: FAIXAS_DA_ESCOLA_SABATINA.map(({ rotulo, classes }) => {
      const numeros = valores.flatMap((valor) => classes.map((classe) => valor.classes[classe]).filter((numero): numero is number => numero !== undefined))
      return { rotulo, numero: numeros.length ? numeros.reduce((soma, numero) => soma + numero, 0) : null }
    }),
    total: valores.reduce((soma, { total }) => soma + total, 0),
  }
}

/** Os indicadores com número, que viram gráfico. Sim/não fica só no detalhamento. */
export const INDICADORES_NUMERICOS = CATALOGO_DO_RELATORIO.filter(({ formato }) => formato !== 'sim_nao')
export const AREAS_DO_RELATORIO = [...new Set(CATALOGO_DO_RELATORIO.map(({ secao }) => secao))]
