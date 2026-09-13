import type { PlanningArea } from '../evangelism/types'
import { CATALOGO_DO_RELATORIO, indicadorPorId, type IndicadorDoRelatorio } from './catalogo'
import { numeroDoValor, valorAtual } from './service'
import { compararTrimestres, type RelatorioIntegradoEntity } from './types'

/**
 * Onde cada indicador do relatório entra no Planejamento Estratégico.
 *
 * O relatório é organizado por departamento — Escola Sabatina, Ministério
 * Pessoal, Secretaria — e o planejamento do distrito é organizado por área:
 * Identidade, Liderança, Novas gerações e Discipulado. São dois recortes da
 * mesma vida da igreja, e o pastor acompanha pelo segundo.
 *
 * A ligação é escrita, indicador por indicador, e não deduzida do nome da
 * seção: "Número de professores em cada classe" é Escola Sabatina no papel e
 * Liderança no planejamento.
 *
 * Indicador que não está aqui não entra em gráfico nenhum — e continua no
 * Relatório Integrado, onde nada se perde.
 */
export const AREA_DO_INDICADOR: Readonly<Record<string, PlanningArea>> = {
  // Identidade: vida espiritual, Bíblia, oração, preparo espiritual.
  'planejamento-estrategico--quantos-membros-participaram-de-programas-relacionados-a-identidade': 'identity',
  'planejamento-estrategico--numero-de-alunos-que-estudam-diariamente-a-licao': 'identity',
  'escola-sabatina--numero-de-pessoas-que-tem-sua-licao-da': 'identity',
  'escola-sabatina--numero-de-alunos-presentes': 'identity',
  'escola-sabatina--numero-de-alunos-da-escola-sabatina': 'identity',

  // Liderança: formação, acompanhamento e fortalecimento de quem conduz.
  'planejamento-estrategico--quantos-oficiais-participaram-de-programas-de-formacao-de': 'leadership',
  'planejamento-estrategico--quantos-membros-foram-ensinados-a-desenvolver-os-seus': 'leadership',
  'escola-sabatina--numero-de-professores-em-cada-classe': 'leadership',
  'ancionato--numero-de-anciaos-ancias-da-igreja-ou-diretores': 'leadership',
  'ministerio-da-mulher--numero-de-mulheres-que-concluiram-o-curso-de': 'leadership',

  // Novas gerações: crianças, adolescentes e jovens.
  'children-s-ministries--numero-de-classes-biblicas-com-criancas-e-adolescentes': 'new_generations',
  'children-s-ministries--numero-de-escolas-cristas-de-ferias-realizadas': 'new_generations',
  'children-s-ministries--numero-de-criancas-que-participaram-da-ecf': 'new_generations',
  'children-s-ministries--numero-de-programas-projetos-comunitarios-com-a-participacao': 'new_generations',
  'evangelismo--numero-de-programas-de-alcance-evangelistico-com-criancas': 'new_generations',
  'ministerio-jovem--numero-de-participantes-do-maranata-academy': 'new_generations',

  // Discipulado: estudos bíblicos, grupos, missão e cuidado.
  'ministerio-pessoal--numero-de-pessoas-recebendo-estudos-biblicos': 'discipleship',
  'acao-solidaria-adventista--numero-de-pessoas-recebendo-estudos-biblicos-pela-asa': 'discipleship',
  'planejamento-estrategico--numero-de-pessoas-que-estao-ministrando-estudos-biblicos': 'discipleship',
  'ministerio-pessoal--numero-de-duplas-missionarias-ministrando-estudos-biblicos': 'discipleship',
  'escola-sabatina--numero-de-alunos-que-estao-dando-estudos-biblicos': 'discipleship',
  'escola-sabatina--numero-de-pequenos-grupos-da-igreja': 'discipleship',
  'escola-sabatina--numero-de-unidades-de-acao': 'discipleship',
  'ministerio-pessoal--numero-de-classes-biblicas-em-funcionamento': 'discipleship',
  'ministerio-pessoal--numero-de-treinamentos-encontros-missionarios': 'discipleship',
  'planejamento-estrategico--numero-de-alunos-da-classe-envolvidos-em-frentes': 'discipleship',
  'evangelismo--numero-de-campanhas-evangelisticas-em-geral': 'discipleship',
  'acao-solidaria-adventista--numero-de-projetos-que-foram-realizados-em-favor': 'discipleship',
  'acao-solidaria-adventista--numero-de-pessoas-que-foram-beneficiadas-pelos-projetos': 'discipleship',
}

export interface PontoDoGrafico {
  trimestre: string
  valor: number | null
  /** Quantas igrejas informaram este indicador neste trimestre. */
  igrejasQueInformaram: number
}

export interface SerieDoIndicador {
  indicador: IndicadorDoRelatorio
  pontos: PontoDoGrafico[]
  /** O que vale hoje: soma do período para quem acumula, mais recente para o resto. */
  atual: number | null
  /** O trimestre de onde veio o valor atual, quando ele é de um trimestre só. */
  trimestreDoAtual: string | null
  /** Verdadeiro quando o valor exibido é de um trimestre que não é o último. */
  desatualizado: boolean
}

export interface AreaEstrategica {
  area: PlanningArea
  series: SerieDoIndicador[]
}

function trimestresDisponiveis(relatorios: readonly RelatorioIntegradoEntity[]): string[] {
  return [...new Set(relatorios.map(({ trimestre }) => trimestre))].sort(compararTrimestres)
}

/**
 * As séries de cada área, prontas para virar gráfico.
 *
 * Um trimestre sem resposta vira ponto nulo, não zero — a linha ganha um buraco
 * em vez de mergulhar até o chão fingindo que a igreja zerou.
 *
 * `desatualizado` diz que o número exibido não é do último trimestre conhecido.
 * Sem isso, o painel mostra um valor antigo com cara de atual, que é a forma
 * mais silenciosa de errar.
 */
export function areasEstrategicas(
  relatorios: readonly RelatorioIntegradoEntity[],
  igrejasAtivas: readonly string[],
): AreaEstrategica[] {
  const trimestres = trimestresDisponiveis(relatorios)
  const ultimo = trimestres.at(-1) ?? null
  const porArea = new Map<PlanningArea, SerieDoIndicador[]>()

  for (const indicador of CATALOGO_DO_RELATORIO) {
    const area = AREA_DO_INDICADOR[indicador.id]
    if (!area || indicador.formato === 'sim_nao') continue

    const pontos = trimestres.map((trimestre) => {
      const numeros = relatorios
        .filter((relatorio) => relatorio.trimestre === trimestre && igrejasAtivas.includes(relatorio.churchId))
        .map((relatorio) => numeroDoValor(relatorio.valores[indicador.id]))
        .filter((numero): numero is number => numero !== null)
      return {
        trimestre,
        valor: numeros.length ? numeros.reduce((soma, numero) => soma + numero, 0) : null,
        igrejasQueInformaram: numeros.length,
      }
    })

    let atual: number | null
    let trimestreDoAtual: string | null = null
    if (indicador.tratamento === 'somar') {
      const informados = pontos.filter((ponto) => ponto.valor !== null)
      atual = informados.length ? informados.reduce((soma, ponto) => soma + (ponto.valor ?? 0), 0) : null
    } else {
      const recentes = igrejasAtivas
        .map((churchId) => valorAtual(relatorios, churchId, indicador.id))
        .filter((leitura): leitura is NonNullable<typeof leitura> => leitura !== null)
      const numeros = recentes.map(({ valor }) => numeroDoValor(valor)).filter((n): n is number => n !== null)
      atual = numeros.length ? numeros.reduce((soma, numero) => soma + numero, 0) : null
      trimestreDoAtual = recentes.map(({ trimestre }) => trimestre).sort(compararTrimestres).at(-1) ?? null
    }

    const serie: SerieDoIndicador = {
      indicador,
      pontos,
      atual,
      trimestreDoAtual,
      desatualizado: indicador.tratamento === 'atualizar'
        && trimestreDoAtual !== null && ultimo !== null && trimestreDoAtual !== ultimo,
    }
    porArea.set(area, [...(porArea.get(area) ?? []), serie])
  }

  return [...porArea].map(([area, series]) => ({ area, series }))
}

/** Indicadores que ainda não têm área declarada, para nada sumir em silêncio. */
export function indicadoresSemArea(): IndicadorDoRelatorio[] {
  return CATALOGO_DO_RELATORIO.filter((indicador) =>
    indicador.formato !== 'sim_nao' && !AREA_DO_INDICADOR[indicador.id])
}

export { indicadorPorId }
