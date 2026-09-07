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

export interface MetaDeGrupos {
  churchId: string
  nome: string
  membros: number
  meta: number
  escolaSabatina: number
  pequenosGrupos: number
  integracoes: number
}

export interface QuadroDeGrupos {
  igrejas: MetaDeGrupos[]
  distrito: Omit<MetaDeGrupos, 'churchId' | 'nome'>
}

export function metaDeGrupos(membros: number): number {
  return Math.ceil(Math.max(0, membros) / MEMBROS_POR_GRUPO)
}

export function quadroDeGrupos(
  igrejas: ReadonlyArray<{ id: string; name: string }>,
  pessoas: ReadonlyArray<{ currentChurchId: string }>,
  classes: ReadonlyArray<{ churchId: string }>,
  grupos: ReadonlyArray<{ churchId: string; active: boolean }>,
  integracoes: ReadonlyArray<{ churchId: string; active: boolean }>,
): QuadroDeGrupos {
  const linhas = igrejas.map((igreja) => {
    const membros = pessoas.filter(({ currentChurchId }) => currentChurchId === igreja.id).length
    return {
      churchId: igreja.id,
      nome: igreja.name,
      membros,
      meta: metaDeGrupos(membros),
      escolaSabatina: classes.filter(({ churchId }) => churchId === igreja.id).length,
      pequenosGrupos: grupos.filter((grupo) => grupo.churchId === igreja.id && grupo.active).length,
      integracoes: integracoes.filter((item) => item.churchId === igreja.id && item.active).length,
    }
  })

  const somar = (campo: keyof Omit<MetaDeGrupos, 'churchId' | 'nome'>) =>
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
    },
  }
}
