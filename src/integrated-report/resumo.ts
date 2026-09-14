import type { ClasseDaEscolaSabatina } from './catalogo'
import { lancamentosDoTrimestre, totalDoDistritoNaMeta } from './metas'
import { numeroDoValor, totalDoDistrito, valorAtual } from './service'
import { compararTrimestres, type RelatorioIntegradoEntity } from './types'

/**
 * O que as outras telas mostram do Relatório Integrado.
 *
 * Tudo sai dos relatórios já guardados pela página central: nada é importado
 * aqui, nada é copiado. Metas, Escola Sabatina e Estudos Bíblicos só apontam
 * para a mesma página e resumem o mesmo registro.
 */

export const ROTA_DO_RELATORIO_INTEGRADO = '/app/metas/relatorio-integrado'
export const FRASE_DO_ENVIO = 'Envie o Relatório Integrado respondido pelas igrejas e convertido para PDF.'
export const MENSAGEM_DE_FORMATO ='Converta o Relatório Integrado respondido para PDF e tente novamente.'

/** Word, planilha e imagem não entram direto: só PDF. */
export function arquivoEhPdf(arquivo: Pick<File, 'name' | 'type'>): boolean {
  return arquivo.name.toLocaleLowerCase('pt-BR').endsWith('.pdf') && (!arquivo.type || arquivo.type === 'application/pdf')
}

export function ultimoTrimestre(relatorios: readonly RelatorioIntegradoEntity[]): string | null {
  return [...relatorios].sort((a, b) => compararTrimestres(a.trimestre, b.trimestre)).at(-1)?.trimestre ?? null
}

/** Quantas igrejas ativas entregaram aquele trimestre e quantas não. Quem não entregou não vira zero em lugar nenhum. */
export function coberturaDoTrimestre(relatorios: readonly RelatorioIntegradoEntity[], trimestre: string, igrejasAtivas: readonly string[]) {
  const ativas = new Set(igrejasAtivas)
  const entregaram = new Set(relatorios.filter((relatorio) => relatorio.trimestre === trimestre && ativas.has(relatorio.churchId)).map(({ churchId }) => churchId))
  return { responderam: entregaram.size, semRelatorio: ativas.size - entregaram.size }
}

/**
 * Estudos bíblicos informados no trimestre, somando os gerais e os da ASA.
 *
 * A soma é decisão do pastor e vive em `LIGACOES_COM_METAS`; aqui só se usa o
 * mesmo cálculo que alimenta a meta. Nenhuma igreja informou: nulo, não zero.
 */
export function estudosDoTrimestre(relatorios: readonly RelatorioIntegradoEntity[], trimestre: string): number | null {
  const lancamentos = lancamentosDoTrimestre(relatorios, trimestre).filter(({ metric }) => metric === 'bible_studies')
  return lancamentos.length ? totalDoDistritoNaMeta(lancamentos, 'bible_studies') : null
}

type NumeroDoCadastro = 'classes' | 'pequenosGrupos'

interface IndicadorDaEscolaSabatina { rotulo: string; id: string; classes?: readonly ClasseDaEscolaSabatina[]; cadastro?: NumeroDoCadastro }

const ALUNOS = 'escola-sabatina--numero-de-alunos-da-escola-sabatina'

export const INDICADORES_DA_ESCOLA_SABATINA: readonly IndicadorDaEscolaSabatina[] = [
  { rotulo: 'Classes (Unidades de Ação)', id: 'escola-sabatina--numero-de-unidades-de-acao', cadastro: 'classes' },
  { rotulo: 'Alunos', id: ALUNOS },
  { rotulo: 'Professores', id: 'escola-sabatina--numero-de-professores-em-cada-classe' },
  { rotulo: 'Pessoas com a lição', id: 'escola-sabatina--numero-de-pessoas-que-tem-sua-licao-da' },
  { rotulo: 'Estudam a lição diariamente', id: 'planejamento-estrategico--numero-de-alunos-que-estudam-diariamente-a-licao' },
  { rotulo: 'Alunos dos departamentos infantis', id: ALUNOS, classes: ['Bebês', 'Iniciantes', 'Infantis', 'Primários', 'Pré-Adolescentes'] },
  { rotulo: 'Alunos adolescentes', id: ALUNOS, classes: ['Adolescentes'] },
  { rotulo: 'Alunos jovens', id: ALUNOS, classes: ['Jovens'] },
  { rotulo: 'Pequenos Grupos', id: 'escola-sabatina--numero-de-pequenos-grupos-da-igreja', cadastro: 'pequenosGrupos' },
]

/** Parte das classes de um indicador por classe, no valor mais recente de cada igreja ativa. */
function totalDasClasses(relatorios: readonly RelatorioIntegradoEntity[], id: string, classes: readonly ClasseDaEscolaSabatina[], igrejasAtivas: readonly string[]): number | null {
  const numeros = igrejasAtivas.flatMap((churchId) => {
    const atual = valorAtual(relatorios, churchId, id)?.valor
    if (atual?.tipo !== 'por_classe') return []
    const presentes = classes.map((classe) => atual.classes[classe]).filter((numero): numero is number => numero !== undefined)
    return presentes.length ? [presentes.reduce((soma, numero) => soma + numero, 0)] : []
  })
  return numeros.length ? numeros.reduce((soma, numero) => soma + numero, 0) : null
}

/**
 * As duas fontes lado a lado, nunca misturadas: o que está cadastrado no
 * aplicativo e o que as igrejas informaram no relatório.
 */
export function linhasDaEscolaSabatina(
  relatorios: readonly RelatorioIntegradoEntity[],
  igrejasAtivas: readonly string[],
  cadastro: Record<NumeroDoCadastro, number>,
): Array<{ rotulo: string; cadastro: number | null; informado: number | null }> {
  return INDICADORES_DA_ESCOLA_SABATINA.map((indicador) => ({
    rotulo: indicador.rotulo,
    cadastro: indicador.cadastro ? cadastro[indicador.cadastro] : null,
    informado: indicador.classes
      ? totalDasClasses(relatorios, indicador.id, indicador.classes, igrejasAtivas)
      : totalDoDistrito(relatorios, indicador.id, igrejasAtivas),
  }))
}

export { numeroDoValor }
