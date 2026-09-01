import type { AgendaCategory } from './types'
import { AGENDA_CATEGORY_LABELS } from './types'

/**
 * O que cada categoria realmente precisa perguntar. Antes o formulário pedia
 * tudo para tudo: uma pregação exigia título, local e endereço, mesmo quando a
 * igreja já traz o endereço no cadastro.
 */
export interface CategoryForm {
  /**
   * 'required' quando o título é a informação principal, 'optional' quando
   * ajuda mas não deve travar, 'generated' quando perguntar seria à toa.
   */
  title: 'required' | 'optional' | 'generated'
  church: 'required' | 'optional' | 'none'
  /** Permite pregar ou reunir em lugar que não é igreja do distrito. */
  otherChurch: boolean
  /** Local e endereço, úteis só quando não há igreja para tirar o endereço. */
  place: boolean
  sermon: boolean
}

const COM_IGREJA: CategoryForm = { title: 'generated', church: 'required', otherChurch: true, place: false, sermon: false }
const COM_TITULO: CategoryForm = { title: 'required', church: 'optional', otherChurch: false, place: true, sermon: false }

export const CATEGORY_FORMS: Record<AgendaCategory, CategoryForm> = {
  preaching: { ...COM_IGREJA, sermon: true },
  visit: { title: 'optional', church: 'optional', otherChurch: false, place: false, sermon: false },
  committee: COM_IGREJA,
  council: COM_IGREJA,
  baptism: COM_IGREJA,
  communion: COM_IGREJA,
  wedding: COM_IGREJA,
  child_dedication: COM_IGREJA,
  pgp: { title: 'optional', church: 'optional', otherChurch: true, place: true, sermon: false },
  bible_study: { title: 'optional', church: 'optional', otherChurch: false, place: true, sermon: false },
  meeting: COM_TITULO,
  training: COM_TITULO,
  event: COM_TITULO,
  travel: { title: 'required', church: 'none', otherChurch: false, place: true, sermon: false },
  personal: { title: 'required', church: 'none', otherChurch: false, place: false, sermon: false },
  other: COM_TITULO,
}

export function categoryForm(category: AgendaCategory): CategoryForm {
  return CATEGORY_FORMS[category]
}

/**
 * Título de quem não precisa digitar um. "Pregação · Igreja Central" diz mais
 * na lista do que um campo que o pastor teria de preencher à toa.
 */
export function defaultTitleFor(category: AgendaCategory, place?: string): string {
  const rotulo = AGENDA_CATEGORY_LABELS[category]
  const complemento = place?.trim()
  return complemento ? `${rotulo} · ${complemento}` : rotulo
}

/** Título que vai ser gravado, respeitando o que a categoria pede. */
export function resolveTitle(category: AgendaCategory, typed: string, place?: string): string {
  const digitado = typed.trim()
  if (categoryForm(category).title === 'required') return digitado
  return digitado || defaultTitleFor(category, place)
}
