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

export interface NumerosDoQuadro {
  membros: number
  meta: number
  /** O alcançado: o Relatório Integrado confirmado, quando existe; senão, o cadastro. */
  escolaSabatina: number
  pequenosGrupos: number
  integracoes: number
  /** O que está cadastrado no aplicativo, sempre, para conferir contra o relatório. */
  cadastroEscolaSabatina: number
  cadastroPequenosGrupos: number
}

export interface MetaDeGrupos extends NumerosDoQuadro {
  churchId: string
  nome: string
  /** Trimestre do relatório de onde veio o alcançado; nulo quando veio do cadastro. */
  trimestreEscolaSabatina: string | null
  trimestrePequenosGrupos: string | null
}

export interface QuadroDeGrupos {
  igrejas: MetaDeGrupos[]
  distrito: NumerosDoQuadro
}

/** O último trimestre confirmado do ano, por igreja, para Escola Sabatina e Pequenos Grupos. */
export type VigenteDoRelatorio = (churchId: string) => {
  escolaSabatina: { numero: number; trimestre: string } | null
  pequenosGrupos: { numero: number; trimestre: string } | null
}

export function metaDeGrupos(membros: number): number {
  return Math.ceil(Math.max(0, membros) / MEMBROS_POR_GRUPO)
}

/**
 * O quadro por igreja.
 *
 * Escola Sabatina e Pequenos Grupos são fotografia do trimestre: vale o último
 * trimestre confirmado do Relatório Integrado, sem somar trimestres, e sem somar
 * relatório com cadastro. Igreja sem relatório no ano continua pelo cadastro.
 */
export function quadroDeGrupos(
  igrejas: ReadonlyArray<{ id: string; name: string }>,
  pessoas: ReadonlyArray<{ currentChurchId: string }>,
  classes: ReadonlyArray<{ churchId: string }>,
  grupos: ReadonlyArray<{ churchId: string; active: boolean }>,
  integracoes: ReadonlyArray<{ churchId: string; active: boolean }>,
  vigente?: VigenteDoRelatorio,
): QuadroDeGrupos {
  const linhas: MetaDeGrupos[] = igrejas.map((igreja) => {
    const membros = pessoas.filter(({ currentChurchId }) => currentChurchId === igreja.id).length
    const cadastroEscolaSabatina = classes.filter(({ churchId }) => churchId === igreja.id).length
    const cadastroPequenosGrupos = grupos.filter((grupo) => grupo.churchId === igreja.id && grupo.active).length
    const doRelatorio = vigente?.(igreja.id)
    return {
      churchId: igreja.id,
      nome: igreja.name,
      membros,
      meta: metaDeGrupos(membros),
      escolaSabatina: doRelatorio?.escolaSabatina?.numero ?? cadastroEscolaSabatina,
      pequenosGrupos: doRelatorio?.pequenosGrupos?.numero ?? cadastroPequenosGrupos,
      integracoes: integracoes.filter((item) => item.churchId === igreja.id && item.active).length,
      cadastroEscolaSabatina,
      cadastroPequenosGrupos,
      trimestreEscolaSabatina: doRelatorio?.escolaSabatina?.trimestre ?? null,
      trimestrePequenosGrupos: doRelatorio?.pequenosGrupos?.trimestre ?? null,
    }
  })

  const somar = (campo: keyof NumerosDoQuadro) =>
    linhas.reduce((total, linha) => total + linha[campo], 0)

  return {
    igrejas: linhas,
    distrito: {
      membros: somar('membros'),
      // A meta do distrito é a soma das metas das igrejas, e não a meta da soma
      // dos membros: cada igreja precisa dos seus grupos, e somar os membros
      // primeiro esconderia a igreja pequena dentro da grande.
      meta: somar('meta'),
      escolaSabatina: somar('escolaSabatina'),
      pequenosGrupos: somar('pequenosGrupos'),
      integracoes: somar('integracoes'),
      cadastroEscolaSabatina: somar('cadastroEscolaSabatina'),
      cadastroPequenosGrupos: somar('cadastroPequenosGrupos'),
    },
  }
}
