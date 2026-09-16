import type { PlanningArea } from '../evangelism/types'
import { AREA_DO_INDICADOR } from '../integrated-report/areasEstrategicas'
import { CATALOGO_DO_RELATORIO, indicadorPorId, type ClasseDaEscolaSabatina, type IndicadorDoRelatorio } from '../integrated-report/catalogo'
import { comparar, leituraDaIgreja, trimestreAnterior, trimestresDoAno, type Comparacao, type Periodo, type Situacao } from '../integrated-report/painel'
import { valorGuardado } from '../integrated-report/service'
import { compararTrimestres, type RelatorioIntegradoEntity } from '../integrated-report/types'

/**
 * O Plano Estratégico da Divisão Sul-Americana (2026–2030) visto pelo
 * Relatório Integrado.
 *
 * Cada área tem **um** número no cartão, e ele é uma pergunta que o relatório
 * de fato traz — nada é estimado, ponderado ou inventado. A regra de cada um:
 *
 * - **Identidade Adventista**: "Quantos membros participaram de programas
 *   relacionados à Identidade profética da IASD, neste trimestre?" (seção
 *   Planejamento Estratégico). Resultado do período: no trimestre, a soma das
 *   igrejas; no ano, a soma dos trimestres.
 * - **Liderança**: "Quantos oficiais participaram de programas de formação de
 *   liderança…, neste trimestre?" (Planejamento Estratégico). Mesma regra de soma.
 * - **Novas Gerações**: "Número de alunos da Escola Sabatina", só as classes de
 *   Bebês a Jovens (Bebês, Iniciantes, Infantis, Primários, Pré-Adolescentes,
 *   Adolescentes e Jovens). É situação da igreja, não resultado do período: no
 *   ano vale o último trimestre informado de cada igreja, somado entre as igrejas.
 * - **Discipulado**: "Número de pessoas que estão ministrando Estudos Bíblicos
 *   (individual, em duplas, etc.)" (Planejamento Estratégico). Situação: último
 *   trimestre informado de cada igreja, somado entre as igrejas.
 *
 * Os indicadores que **compõem** a área, na página de detalhe, são os de
 * `AREA_DO_INDICADOR` — a mesma ligação que o Planejamento Anual já usa.
 *
 * Ausência não é zero: igreja sem relatório ou sem resposta não entra na soma,
 * e o distrito sem nenhuma resposta fica sem número.
 */
export type SimboloDoPlano = 'circulo' | 'triangulo' | 'semicirculo' | 'quadrado'
export type SlugDaArea = 'identidade' | 'lideranca' | 'novas-geracoes' | 'discipulado'

export interface IndicadorPrincipal {
  id: string
  /** O que se conta, em poucas palavras. Vai acima do número. */
  rotulo: string
  /** Só parte das classes, quando o indicador é por classe. */
  classes?: readonly ClasseDaEscolaSabatina[]
}

export interface AreaDoPlano {
  slug: SlugDaArea
  area: PlanningArea
  nome: string
  explicacao: string
  simbolo: SimboloDoPlano
  principal: IndicadorPrincipal
}

export const TITULO_DO_PLANO = 'Plano Estratégico da Divisão Sul-Americana — 2026–2030'

export const CLASSES_DE_BEBES_A_JOVENS: readonly ClasseDaEscolaSabatina[] = ['Bebês', 'Iniciantes', 'Infantis', 'Primários', 'Pré-Adolescentes', 'Adolescentes', 'Jovens']

export const AREAS_DO_PLANO: readonly AreaDoPlano[] = [
  {
    slug: 'identidade', area: 'identity', nome: 'Identidade Adventista', simbolo: 'circulo',
    explicacao: 'Fortalecer a identidade profética como povo remanescente e o compromisso com as crenças fundamentais e o estilo de vida adventista.',
    principal: { id: 'planejamento-estrategico--quantos-membros-participaram-de-programas-relacionados-a-identidade', rotulo: 'Membros em programas de identidade profética' },
  },
  {
    slug: 'lideranca', area: 'leadership', nome: 'Liderança', simbolo: 'triangulo',
    explicacao: 'Formar líderes que guiem pelo exemplo de Cristo e apoiem pastores e membros na missão.',
    principal: { id: 'planejamento-estrategico--quantos-oficiais-participaram-de-programas-de-formacao-de', rotulo: 'Oficiais em formação de liderança' },
  },
  {
    slug: 'novas-geracoes', area: 'new_generations', nome: 'Novas Gerações', simbolo: 'semicirculo',
    explicacao: 'Envolver as crianças, adolescentes e jovens ativamente na vida da igreja e na proclamação do evangelho.',
    principal: { id: 'escola-sabatina--numero-de-alunos-da-escola-sabatina', rotulo: 'Alunos de bebês a jovens', classes: CLASSES_DE_BEBES_A_JOVENS },
  },
  {
    slug: 'discipulado', area: 'discipleship', nome: 'Discipulado', simbolo: 'quadrado',
    explicacao: 'Viver o discipulado como um relacionamento diário com Deus — oração e estudo da Bíblia — e envolver cada membro na salvação de outros.',
    principal: { id: 'planejamento-estrategico--numero-de-pessoas-que-estao-ministrando-estudos-biblicos', rotulo: 'Pessoas ministrando estudos bíblicos' },
  },
]

export const areaPorSlug = (slug: string): AreaDoPlano | undefined => AREAS_DO_PLANO.find((area) => area.slug === slug)
export const areaDoPlanejamento = (area: PlanningArea): AreaDoPlano => AREAS_DO_PLANO.find((item) => item.area === area)!
/** O nome das legendas e dos símbolos pequenos: "Identidade", e os demais como são. */
export const nomeCurtoDaArea = (area: AreaDoPlano): string => area.slug === 'identidade' ? 'Identidade' : area.nome

export interface LeituraDaArea { situacao: Situacao; numero: number | null; trimestre: string | null }

/** O número do cartão para uma igreja no período, com o recorte de classes quando houver. */
export function leituraPrincipalDaIgreja(relatorios: readonly RelatorioIntegradoEntity[], churchId: string, area: AreaDoPlano, periodo: Periodo): LeituraDaArea {
  const leitura = leituraDaIgreja(relatorios, churchId, area.principal.id, periodo)
  const classes = area.principal.classes
  if (!classes || leitura.situacao !== 'informado') return { situacao: leitura.situacao, numero: leitura.numero, trimestre: leitura.trimestre }
  const valor = leitura.valor
  const numeros = valor?.tipo === 'por_classe'
    ? classes.map((classe) => valor.classes[classe]).filter((numero): numero is number => numero !== undefined)
    : []
  // Relatório entregue sem nenhuma das classes contadas: não respondeu esta parte.
  if (!numeros.length) return { situacao: 'nao_respondido', numero: null, trimestre: leitura.trimestre }
  return { situacao: 'informado', numero: numeros.reduce((soma, numero) => soma + numero, 0), trimestre: leitura.trimestre }
}

export interface ResultadoDaArea {
  numero: number | null
  informaram: number
  naoResponderam: number
  semRelatorio: number
  trimestre: string | null
}

export function resultadoDaArea(relatorios: readonly RelatorioIntegradoEntity[], igrejas: readonly string[], area: AreaDoPlano, periodo: Periodo): ResultadoDaArea {
  const leituras = igrejas.map((churchId) => leituraPrincipalDaIgreja(relatorios, churchId, area, periodo))
  const numeros = leituras.flatMap(({ situacao, numero }) => situacao === 'informado' && numero !== null ? [numero] : [])
  const contar = (situacao: Situacao) => leituras.filter((leitura) => leitura.situacao === situacao).length
  return {
    numero: numeros.length ? numeros.reduce((soma, numero) => soma + numero, 0) : null,
    informaram: contar('informado'),
    naoResponderam: contar('nao_respondido'),
    semRelatorio: contar('sem_relatorio'),
    trimestre: leituras.map(({ trimestre }) => trimestre).filter((item): item is string => item !== null).sort(compararTrimestres).at(-1) ?? null,
  }
}

/** Os quatro trimestres do ano, cada um com o próprio número — nunca acumulado. */
export function evolucaoDoAno(relatorios: readonly RelatorioIntegradoEntity[], igrejas: readonly string[], area: AreaDoPlano, ano: number): Array<{ chave: string; resultado: ResultadoDaArea }> {
  return trimestresDoAno(ano).map((chave, indice) => ({ chave, resultado: resultadoDaArea(relatorios, igrejas, area, { ano, trimestre: indice + 1 }) }))
}

export type ComparacaoDaArea = Comparacao & { de: string | null; para: string | null }

/** No trimestre, contra o anterior (atravessando o ano); no ano, entre os dois últimos trimestres com número. */
export function comparacaoDaArea(relatorios: readonly RelatorioIntegradoEntity[], igrejas: readonly string[], area: AreaDoPlano, periodo: Periodo): ComparacaoDaArea {
  if (periodo.trimestre !== null) {
    const antes = trimestreAnterior(periodo.ano, periodo.trimestre)
    return {
      ...comparar(resultadoDaArea(relatorios, igrejas, area, antes).numero, resultadoDaArea(relatorios, igrejas, area, periodo).numero),
      de: `${antes.ano}-${antes.trimestre}`, para: `${periodo.ano}-${periodo.trimestre}`,
    }
  }
  const comNumero = evolucaoDoAno(relatorios, igrejas, area, periodo.ano).filter(({ resultado }) => resultado.numero !== null)
  const ultimo = comNumero.at(-1)
  const penultimo = comNumero.at(-2)
  if (!ultimo || !penultimo) return { ...comparar(null, ultimo?.resultado.numero ?? null), de: null, para: ultimo?.chave ?? null }
  return { ...comparar(penultimo.resultado.numero, ultimo.resultado.numero), de: penultimo.chave, para: ultimo.chave }
}

/** O ano mais recente com relatório; sem nenhum, o ano corrente. */
export function anoDeReferencia(relatorios: readonly RelatorioIntegradoEntity[], anoCorrente: number): number {
  const anos = relatorios.map(({ trimestre }) => Number(trimestre.slice(0, 4))).filter((ano) => Number.isFinite(ano) && ano > 0)
  return anos.length ? Math.max(...anos) : anoCorrente
}

export function ultimoTrimestreComDados(relatorios: readonly RelatorioIntegradoEntity[], igrejas: readonly string[], area: AreaDoPlano, ano: number): string | null {
  return evolucaoDoAno(relatorios, igrejas, area, ano).filter(({ resultado }) => resultado.numero !== null).at(-1)?.chave ?? null
}

export interface IndicadorDaArea { indicador: IndicadorDoRelatorio; principal: boolean; recorte: string | null }

/** O indicador do cartão primeiro; depois, na ordem do relatório, os que a área reúne. */
export function indicadoresQueCompoem(area: AreaDoPlano): IndicadorDaArea[] {
  const principal = indicadorPorId(area.principal.id)
  const classes = area.principal.classes
  const demais = CATALOGO_DO_RELATORIO.filter(({ id, formato }) => formato !== 'sim_nao' && AREA_DO_INDICADOR[id] === area.area && id !== area.principal.id)
  return [
    ...(principal ? [{ indicador: principal, principal: true, recorte: classes?.length ? `Classes ${classes[0]} a ${classes.at(-1)}` : null }] : []),
    ...demais.map((indicador) => ({ indicador, principal: false, recorte: null })),
  ]
}

export interface OrigemNoPeriodo { arquivo: string; trimestre: string; paginas: number[]; igrejas: number }

/** De quais arquivos enviados veio um indicador no período, e de quantas igrejas. */
export function origensNoPeriodo(relatorios: readonly RelatorioIntegradoEntity[], igrejas: readonly string[], indicadorId: string, periodo: Periodo): OrigemNoPeriodo[] {
  const trimestres = periodo.trimestre === null ? trimestresDoAno(periodo.ano) : [`${periodo.ano}-${periodo.trimestre}`]
  const grupos = new Map<string, OrigemNoPeriodo>()
  for (const relatorio of relatorios) {
    if (!igrejas.includes(relatorio.churchId) || !trimestres.includes(relatorio.trimestre) || !valorGuardado(relatorio, indicadorId)) continue
    const chave = `${relatorio.origem.arquivo}|${relatorio.trimestre}`
    const atual = grupos.get(chave) ?? { arquivo: relatorio.origem.arquivo, trimestre: relatorio.trimestre, paginas: [], igrejas: 0 }
    grupos.set(chave, {
      ...atual,
      paginas: [...new Set([...atual.paginas, ...relatorio.origem.paginas])].sort((a, b) => a - b),
      igrejas: atual.igrejas + 1,
    })
  }
  return [...grupos.values()].sort((a, b) => compararTrimestres(a.trimestre, b.trimestre) || a.arquivo.localeCompare(b.arquivo, 'pt-BR'))
}

export const formatarNumero = (numero: number): string => numero.toLocaleString('pt-BR')

export type TomDaVariacao = 'alta' | 'queda' | 'estavel' | 'sem_base'
export interface VariacaoParaTela { texto: string; tom: TomDaVariacao }

/**
 * A variação entre dois períodos, só em porcentagem.
 *
 * O sinal vem escrito e o tom acompanha, para a informação não depender da
 * cor. Sem trimestre anterior — ou com base zero, onde porcentagem não existe
 * — fica o traço: inventar "+100%" sobre nada seria dizer o que não se sabe.
 */
export function variacaoDaComparacao(comparacao: Pick<Comparacao, 'diferenca' | 'percentual'>): VariacaoParaTela {
  if (comparacao.diferenca === null || comparacao.percentual === null) return { texto: '—', tom: 'sem_base' }
  if (comparacao.percentual === 0) return { texto: '0%', tom: 'estavel' }
  const sinal = comparacao.percentual > 0 ? '+' : '−'
  return { texto: `${sinal}${Math.abs(comparacao.percentual).toLocaleString('pt-BR')}%`, tom: comparacao.percentual > 0 ? 'alta' : 'queda' }
}

/** "+12 (+8,5%)", "−3", "0"; sem base, o texto de vazio. */
export function textoDaDiferenca(diferenca: number | null, percentual: number | null, vazio = 'Sem base de comparação'): string {
  if (diferenca === null) return vazio
  const sinal = (valor: number) => valor > 0 ? '+' : valor < 0 ? '−' : ''
  const parte = percentual === null ? '' : ` (${sinal(percentual)}${Math.abs(percentual).toLocaleString('pt-BR')}%)`
  return `${sinal(diferenca)}${formatarNumero(Math.abs(diferenca))}${parte}`
}
