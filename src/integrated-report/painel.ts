import { CATALOGO_DO_RELATORIO, indicadorPorId, type ClasseDaEscolaSabatina, type IndicadorDoRelatorio } from './catalogo'
import { lancamentosDoTrimestre } from './metas'
import { numeroDoValor, possivelErroDeDigitacao, valorAnterior, valorGuardado } from './service'
import { compararTrimestres, type RelatorioIntegradoEntity, type ValorDoIndicador } from './types'

/**
 * O que a página do Relatório Integrado mostra, calculado a partir do que está
 * guardado. Nada aqui grava.
 *
 * Um período é um trimestre do ano ou o ano completo (`trimestre` nulo). Nos
 * indicadores que somam, o ano é a soma dos trimestres; nos que são fotografia
 * — Escola Sabatina, Pequenos Grupos, Unidades de Ação —, o ano vale o último
 * trimestre informado de cada igreja.
 */
export interface Periodo { ano: number; trimestre: number | null }

export const rotuloCurtoDoTrimestre = (trimestre: string) => `${trimestre.split('-')[1]}º tri`
export const trimestresDoAno = (ano: number) => [1, 2, 3, 4].map((numero) => `${ano}-${numero}`)
const doAno = (relatorio: RelatorioIntegradoEntity, ano: number) => relatorio.trimestre.startsWith(`${ano}-`)
const trimestresDoPeriodo = (periodo: Periodo) => periodo.trimestre === null ? trimestresDoAno(periodo.ano) : [`${periodo.ano}-${periodo.trimestre}`]

/** Anos com relatório, do mais recente ao mais antigo; o ano corrente sempre entra. */
export function anosDosRelatorios(relatorios: readonly RelatorioIntegradoEntity[], anoCorrente: number): number[] {
  return [...new Set([anoCorrente, ...relatorios.map(({ trimestre }) => Number(trimestre.slice(0, 4)))])].sort((a, b) => b - a)
}

/**
 * Os estados de um número, que a tela nunca confunde.
 *
 * `informado` inclui o zero. `nao_respondido` é traço, ou pergunta sem resposta
 * num relatório entregue. `sem_relatorio` é a igreja que não entregou.
 */
export type Situacao = 'informado' | 'nao_respondido' | 'sem_relatorio'

export const ROTULO_DA_SITUACAO: Record<Situacao, string> = {
  informado: 'Informado', nao_respondido: 'Sem informação', sem_relatorio: 'Sem relatório',
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
  const valor = valorGuardado(relatorio, indicadorId)
  if (valor) return { situacao: 'informado', numero: numeroDoValor(valor), valor, trimestre: relatorio.trimestre }
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
  const informadas = [...daIgreja]
    .sort((a, b) => compararTrimestres(a.trimestre, b.trimestre))
    .map((relatorio) => leituraDoTrimestre(relatorio, indicadorId))
    .filter(({ situacao }) => situacao === 'informado')
  if (!informadas.length) return vazia('nao_respondido')
  if (indicadorPorId(indicadorId)?.tratamento === 'somar') {
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

export type ComparacaoDoPeriodo = Comparacao & { de: string | null; para: string | null }

/**
 * A comparação que cabe no período: no trimestre, contra o anterior; no ano,
 * entre os dois últimos trimestres que têm número.
 */
export function comparacaoDoPeriodo(relatorios: readonly RelatorioIntegradoEntity[], igrejas: readonly string[], indicadorId: string, periodo: Periodo): ComparacaoDoPeriodo {
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
  const lancamentos = trimestresDoPeriodo(periodo).flatMap((trimestre) => lancamentosDoTrimestre(relatorios, trimestre))
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

export const ESTUDOS_GERAIS = 'ministerio-pessoal--numero-de-pessoas-recebendo-estudos-biblicos'
export const ESTUDOS_ASA = 'acao-solidaria-adventista--numero-de-pessoas-recebendo-estudos-biblicos-pela-asa'

/** Os nomes que cabem numa linha. O texto completo do relatório continua a um toque. */
const ROTULOS_CURTOS: Readonly<Record<string, string>> = {
  [ESTUDOS_GERAIS]: 'Estudos bíblicos (gerais)',
  [ESTUDOS_ASA]: 'Estudos bíblicos pela ASA',
  'escola-sabatina--numero-de-pequenos-grupos-da-igreja': 'Pequenos Grupos',
  'escola-sabatina--numero-de-unidades-de-acao': 'Unidades de Ação',
  'escola-sabatina--numero-de-alunos-da-escola-sabatina': 'Alunos da Escola Sabatina',
  'escola-sabatina--numero-de-alunos-presentes': 'Alunos presentes',
  'escola-sabatina--numero-de-professores-em-cada-classe': 'Professores',
  'escola-sabatina--numero-de-pessoas-que-tem-sua-licao-da': 'Pessoas com a lição',
  'escola-sabatina--numero-de-alunos-que-estao-dando-estudos-biblicos': 'Alunos dando estudos',
  'evangelismo--numero-de-campanhas-evangelisticas-em-geral': 'Campanhas evangelísticas',
  'evangelismo--numero-de-programas-de-alcance-evangelistico-com-criancas': 'Evangelismo com crianças',
  'ministerio-pessoal--numero-de-classes-biblicas-em-funcionamento': 'Classes Bíblicas',
  'ministerio-pessoal--numero-de-duplas-missionarias-ministrando-estudos-biblicos': 'Duplas missionárias',
  'ministerio-pessoal--numero-de-treinamentos-encontros-missionarios': 'Treinamentos missionários',
  'ministerio-pessoal--pontos-de-pregacao-de-semana-santa-igreja-pgs': 'Pontos da Semana Santa',
  'ministerio-pessoal--total-de-amigos-presentes-na-semana-santa': 'Amigos na Semana Santa',
  'secretaria--numero-de-presentes-na-escola-sabatina': 'Presentes na Escola Sabatina',
  'secretaria--numero-de-presentes-no-culto-divino': 'Presentes no culto divino',
  'secretaria--capacidade-instalada-quantos-adultos-cabem-sentados-nos-bancos': 'Capacidade da nave',
  'planejamento-estrategico--numero-de-pessoas-que-estao-ministrando-estudos-biblicos': 'Pessoas dando estudos',
  'planejamento-estrategico--numero-de-alunos-que-estudam-diariamente-a-licao': 'Estudam a lição diariamente',
  'planejamento-estrategico--numero-de-alunos-da-classe-envolvidos-em-frentes': 'Alunos em frentes missionárias',
  'ancionato--numero-de-anciaos-ancias-da-igreja-ou-diretores': 'Anciãos e diretores',
  'comunicacao--numero-de-seguidores-que-a-congregacao-possui-somados': 'Seguidores nas redes',
}

export function rotuloCurto(indicador: Pick<IndicadorDoRelatorio, 'id' | 'rotulo'>): string {
  const escrito = ROTULOS_CURTOS[indicador.id]
  if (escrito) return escrito
  const limpo = indicador.rotulo
    .replace(/\{[^}]*\}/gu, '').replace(/\([^)]*\)/gu, '').replace(/\s+/gu, ' ').trim()
    .replace(/[.?:;,]+$/u, '')
    .replace(/^N[úu]mero de /u, '')
  const frase = limpo.charAt(0).toLocaleUpperCase('pt-BR') + limpo.slice(1)
  if (frase.length <= 48) return frase
  return `${frase.slice(0, 46).replace(/\s+\S*$/u, '')}…`
}

export interface PossivelErro {
  churchId: string
  trimestre: string
  indicadorId: string
  anterior: { trimestre: string; numero: number }
  atual: number
}

/** O asterisco de um valor: a mudança extrema contra a resposta anterior da mesma igreja. */
export function possivelErroNoValor(relatorios: readonly RelatorioIntegradoEntity[], churchId: string, indicadorId: string, trimestre: string): PossivelErro | null {
  const relatorio = relatorios.find((item) => item.churchId === churchId && item.trimestre === trimestre)
  if (!relatorio) return null
  const atual = numeroDoValor(valorGuardado(relatorio, indicadorId))
  const antes = valorAnterior(relatorios, churchId, indicadorId, trimestre)
  const numeroAntes = numeroDoValor(antes?.valor)
  if (!antes || atual === null || numeroAntes === null || !possivelErroDeDigitacao(numeroAntes, atual)) return null
  return { churchId, trimestre, indicadorId, anterior: { trimestre: antes.trimestre, numero: numeroAntes }, atual }
}

export function possiveisErros(relatorios: readonly RelatorioIntegradoEntity[], igrejas: readonly string[], periodo: Periodo): PossivelErro[] {
  const trimestres = trimestresDoPeriodo(periodo)
  return relatorios
    .filter((relatorio) => igrejas.includes(relatorio.churchId) && trimestres.includes(relatorio.trimestre))
    .flatMap((relatorio) => INDICADORES_NUMERICOS
      .map(({ id }) => possivelErroNoValor(relatorios, relatorio.churchId, id, relatorio.trimestre))
      .filter((erro): erro is PossivelErro => erro !== null))
}

export interface DesempenhoDaIgreja { churchId: string; leitura: Leitura; comparacao: ComparacaoDoPeriodo }

/** Cada igreja no indicador, com a própria comparação do período. */
export function desempenhoDasIgrejas(relatorios: readonly RelatorioIntegradoEntity[], igrejas: readonly string[], indicadorId: string, periodo: Periodo): DesempenhoDaIgreja[] {
  return igrejas.map((churchId) => ({
    churchId,
    leitura: leituraDaIgreja(relatorios, churchId, indicadorId, periodo),
    comparacao: comparacaoDoPeriodo(relatorios, [churchId], indicadorId, periodo),
  }))
}

/** Quantos indicadores cresceram, diminuíram ou ficaram estáveis no período. */
export function tendenciasDosIndicadores(relatorios: readonly RelatorioIntegradoEntity[], igrejas: readonly string[], indicadores: readonly string[], periodo: Periodo): Record<Tendencia, string[]> {
  const saida: Record<Tendencia, string[]> = { alta: [], queda: [], estavel: [], sem_base: [] }
  for (const id of indicadores) saida[comparacaoDoPeriodo(relatorios, igrejas, id, periodo).tendencia].push(id)
  return saida
}

/** O que precisa vir num relatório para ele não ficar incompleto. */
export const INDICADORES_ESSENCIAIS: readonly string[] = [
  ESTUDOS_GERAIS,
  'escola-sabatina--numero-de-pequenos-grupos-da-igreja',
  'escola-sabatina--numero-de-unidades-de-acao',
  'escola-sabatina--numero-de-alunos-da-escola-sabatina',
  'evangelismo--numero-de-campanhas-evangelisticas-em-geral',
]

export type SituacaoDaResposta = 'respondeu' | 'incompleto' | 'sem_relatorio'

export interface RespostaDoTrimestre { trimestre: string; situacao: SituacaoDaResposta; faltando: string[]; possiveisErros: number }

/** Quem respondeu cada trimestre, se veio completo e se trouxe algum possível erro de digitação. */
export function respostasDoAno(relatorios: readonly RelatorioIntegradoEntity[], igrejas: readonly string[], ano: number): Array<{ churchId: string; trimestres: RespostaDoTrimestre[] }> {
  return igrejas.map((churchId) => ({
    churchId,
    trimestres: trimestresDoAno(ano).map((trimestre) => {
      const relatorio = relatorios.find((item) => item.churchId === churchId && item.trimestre === trimestre)
      if (!relatorio) return { trimestre, situacao: 'sem_relatorio', faltando: [], possiveisErros: 0 }
      const faltando = INDICADORES_ESSENCIAIS.filter((id) => !valorGuardado(relatorio, id))
      const erros = INDICADORES_NUMERICOS.filter(({ id }) => possivelErroNoValor(relatorios, churchId, id, trimestre)).length
      return { trimestre, situacao: faltando.length ? 'incompleto' : 'respondeu', faltando, possiveisErros: erros }
    }),
  }))
}

/** As perguntas do relatório que a igreja deixou sem informação naquele trimestre. */
export function camposSemInformacao(relatorio: RelatorioIntegradoEntity | undefined): IndicadorDoRelatorio[] {
  if (!relatorio) return []
  return CATALOGO_DO_RELATORIO.filter(({ id }) => !valorGuardado(relatorio, id))
}
