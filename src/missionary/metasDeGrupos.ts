import { PEQUENOS_GRUPOS, UNIDADES_DE_ACAO } from '../integrated-report/ligacoes'
import { leituraDaIgreja } from '../integrated-report/painel'
import { compararTrimestres, type RelatorioIntegradoEntity } from '../integrated-report/types'

/**
 * A meta de grupos de uma igreja: um para cada doze membros.
 *
 * É a regra da própria igreja, não um número que o pastor combina: de cada doze
 * membros, um Pequeno Grupo, uma Unidade de Ação da Escola Sabatina e uma
 * integração entre as duas. Cento e vinte membros pedem dez de cada.
 *
 * Arredonda para cima porque a regra é de cobertura, não de média: os treze
 * membros de uma igreja pequena não cabem num grupo só, e deixar o décimo
 * terceiro de fora é exatamente o que a meta existe para evitar.
 */
export const MEMBROS_POR_GRUPO = 12

/** De onde veio o número que a tela mostra. `sem_informacao` nunca vira zero. */
export type OrigemDoNumero = 'relatorio' | 'cadastro' | 'sem_informacao'

export interface NumeroDeGrupos {
  /** O alcançado; nulo é "sem informação", e zero só quando alguém informou zero. */
  numero: number | null
  origem: OrigemDoNumero
  /** O cadastro manual, preservado sempre, para conferir. */
  cadastro: number
  /** Relatório e cadastro dizem números diferentes: a tela mostra os dois, não escolhe. */
  divergente: boolean
}

export interface MetaDeGrupos {
  churchId: string
  nome: string
  membros: number
  meta: number
  escolaSabatina: NumeroDeGrupos
  pequenosGrupos: NumeroDeGrupos
  integracoes: NumeroDeGrupos
}

export interface TotalDeGrupos {
  /** Soma das igrejas que têm número; nulo quando nenhuma tem. */
  numero: number | null
  /** Igrejas que ficaram fora da soma por não terem informação. */
  semInformacao: number
  cadastro: number
}

export interface QuadroDeGrupos {
  /** O trimestre dos números do relatório; nulo quando nenhum relatório chegou. */
  trimestre: string | null
  igrejas: MetaDeGrupos[]
  distrito: {
    membros: number
    meta: number
    escolaSabatina: TotalDeGrupos
    pequenosGrupos: TotalDeGrupos
    integracoes: TotalDeGrupos
  }
}

export function metaDeGrupos(membros: number): number {
  return Math.ceil(Math.max(0, membros) / MEMBROS_POR_GRUPO)
}

/** Os trimestres com relatório de alguma destas igrejas, do mais recente ao mais antigo. */
export function trimestresComRelatorio(relatorios: readonly RelatorioIntegradoEntity[], igrejas: readonly string[]): string[] {
  const doDistrito = new Set(igrejas)
  return [...new Set(relatorios.filter(({ churchId }) => doDistrito.has(churchId)).map(({ trimestre }) => trimestre))]
    .sort(compararTrimestres).reverse()
}

/**
 * O trimestre que vale na tela: o escolhido, se tem relatório; senão, o mais
 * recente recebido. É um só para o distrito inteiro, para que o total some
 * igrejas do mesmo trimestre e a igreja que não enviou apareça sem informação.
 */
export function trimestreDoQuadro(relatorios: readonly RelatorioIntegradoEntity[], igrejas: readonly string[], escolhido?: string | null): string | null {
  const disponiveis = trimestresComRelatorio(relatorios, igrejas)
  return escolhido && disponiveis.includes(escolhido) ? escolhido : disponiveis[0] ?? null
}

const doCadastro = (cadastro: number): NumeroDeGrupos => cadastro > 0
  ? { numero: cadastro, origem: 'cadastro', cadastro, divergente: false }
  : { numero: null, origem: 'sem_informacao', cadastro, divergente: false }

/**
 * Escola Sabatina e Pequenos Grupos num trimestre.
 *
 * Com relatório no distrito, o número é o que a igreja informou naquele
 * trimestre — nunca somado ao cadastro, que é a mesma realidade contada de
 * outro jeito. A igreja que não enviou, ou deixou em branco, fica sem
 * informação, e não zero. Antes de qualquer relatório, vale o cadastro.
 */
function doRelatorio(relatorios: readonly RelatorioIntegradoEntity[], churchId: string, indicadorId: string, trimestre: string | null, cadastro: number): NumeroDeGrupos {
  if (!trimestre) return doCadastro(cadastro)
  const [ano, numero] = trimestre.split('-').map(Number)
  const leitura = leituraDaIgreja(relatorios, churchId, indicadorId, { ano: ano!, trimestre: numero! })
  if (leitura.situacao !== 'informado' || leitura.numero === null) return { numero: null, origem: 'sem_informacao', cadastro, divergente: false }
  return { numero: leitura.numero, origem: 'relatorio', cadastro, divergente: cadastro > 0 && cadastro !== leitura.numero }
}

function total(linhas: readonly NumeroDeGrupos[]): TotalDeGrupos {
  const comNumero = linhas.filter(({ numero }) => numero !== null)
  return {
    numero: comNumero.length ? comNumero.reduce((soma, { numero }) => soma + numero!, 0) : null,
    semInformacao: linhas.length - comNumero.length,
    cadastro: linhas.reduce((soma, { cadastro }) => soma + cadastro, 0),
  }
}

/**
 * O quadro por igreja, num trimestre só.
 *
 * Escola Sabatina e Pequenos Grupos são fotografia do trimestre: vale o que o
 * Relatório Integrado daquela igreja informou naquele trimestre. A integração
 * não tem pergunta no relatório, e por isso continua só pelo cadastro — não é
 * deduzida das outras duas.
 */
export function quadroDeGrupos(
  igrejas: ReadonlyArray<{ id: string; name: string }>,
  pessoas: ReadonlyArray<{ currentChurchId: string }>,
  classes: ReadonlyArray<{ churchId: string }>,
  grupos: ReadonlyArray<{ churchId: string; active: boolean }>,
  integracoes: ReadonlyArray<{ churchId: string; active: boolean }>,
  relatorios: readonly RelatorioIntegradoEntity[] = [],
  /** Já resolvido por `trimestreDoQuadro` sobre o distrito inteiro, mesmo quando o quadro é de uma igreja só. */
  trimestre: string | null = null,
): QuadroDeGrupos {
  const linhas: MetaDeGrupos[] = igrejas.map((igreja) => {
    const membros = pessoas.filter(({ currentChurchId }) => currentChurchId === igreja.id).length
    return {
      churchId: igreja.id,
      nome: igreja.name,
      membros,
      meta: metaDeGrupos(membros),
      escolaSabatina: doRelatorio(relatorios, igreja.id, UNIDADES_DE_ACAO, trimestre, classes.filter(({ churchId }) => churchId === igreja.id).length),
      pequenosGrupos: doRelatorio(relatorios, igreja.id, PEQUENOS_GRUPOS, trimestre, grupos.filter((grupo) => grupo.churchId === igreja.id && grupo.active).length),
      integracoes: doCadastro(integracoes.filter((item) => item.churchId === igreja.id && item.active).length),
    }
  })

  return {
    trimestre,
    igrejas: linhas,
    distrito: {
      membros: linhas.reduce((soma, { membros }) => soma + membros, 0),
      // A meta do distrito é a soma das metas das igrejas, e não a meta da soma
      // dos membros: cada igreja precisa dos seus grupos, e somar os membros
      // primeiro esconderia a igreja pequena dentro da grande.
      meta: linhas.reduce((soma, { meta }) => soma + meta, 0),
      escolaSabatina: total(linhas.map(({ escolaSabatina }) => escolaSabatina)),
      pequenosGrupos: total(linhas.map(({ pequenosGrupos }) => pequenosGrupos)),
      integracoes: total(linhas.map(({ integracoes: item }) => item)),
    },
  }
}
