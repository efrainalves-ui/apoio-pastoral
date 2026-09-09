import type { FamilyEntity } from './types'

/**
 * O papel de cada pessoa dentro da família.
 *
 * Quem visita uma casa encontra a família inteira na sala, e sabe ali quem é
 * casado com quem e quem é filho de quem. Essa informação se perdia: a visita
 * guardava os nomes lado a lado, e o cadastro da família continuava vazio até
 * alguém sentar e montá-lo de memória.
 *
 * O papel resolve "filho de quem" sem precisar de um grafo de parentesco: numa
 * família, filho é filho do casal que a encabeça. Um modelo de pares — Fulano é
 * filho de Sicrano, e de Beltrana — pediria o dobro de perguntas na porta da
 * casa para responder o que o papel já responde.
 */
export const FAMILY_ROLES = ['head', 'spouse', 'child', 'parent', 'sibling', 'other'] as const
export type FamilyRole = (typeof FAMILY_ROLES)[number]

export const FAMILY_ROLE_LABELS: Record<FamilyRole, string> = {
  head: 'Responsável',
  spouse: 'Cônjuge',
  child: 'Filho ou filha',
  parent: 'Pai ou mãe',
  sibling: 'Irmão ou irmã',
  other: 'Outro parente',
}

export interface PapelNaFamilia { personId: string; role: FamilyRole }

/**
 * Junta os papéis novos aos já guardados, sem perder quem não foi visitado.
 *
 * A visita vê quem estava na sala. Substituir a lista inteira apagaria o filho
 * que estava no trabalho naquela tarde.
 */
export function mesclarPapeis(
  guardados: readonly PapelNaFamilia[] | undefined,
  novos: readonly PapelNaFamilia[],
): PapelNaFamilia[] {
  const porPessoa = new Map<string, FamilyRole>()
  for (const { personId, role } of guardados ?? []) porPessoa.set(personId, role)
  for (const { personId, role } of novos) porPessoa.set(personId, role)
  return [...porPessoa].map(([personId, role]) => ({ personId, role }))
}

/**
 * A família a que estas pessoas pertencem, se já houver uma.
 *
 * Basta uma delas estar numa família para ser aquela: o cadastro não permite a
 * mesma pessoa em duas, então não há como duas respostas competirem.
 */
export function familiaDestasPessoas(
  familias: readonly FamilyEntity[],
  personIds: readonly string[],
): FamilyEntity | null {
  return familias.find((familia) => familia.memberIds.some((id) => personIds.includes(id))) ?? null
}

/**
 * O nome de uma família nova, tirado do sobrenome de quem a encabeça.
 *
 * "Família Silva" é como o pastor a chama; pedir o nome na porta da casa seria
 * uma pergunta a mais para dizer o que já está no cadastro.
 */
export function nomeDaFamilia(nomeCompleto: string): string {
  const partes = nomeCompleto.trim().split(/\s+/u).filter((parte) => parte.length > 2)
  return `Família ${partes.at(-1) ?? nomeCompleto.trim()}`
}
