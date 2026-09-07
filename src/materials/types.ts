import type { ChurchType } from '../district/types'

/**
 * Materiais do distrito: o que chegou, para onde foi e o que ainda falta.
 *
 * Tudo aqui é dado do distrito — vive no cofre pastoral cifrado e sai no
 * encerramento de distrito, junto com o resto.
 */
export const MATERIAL_CATEGORIES = ['literature', 'lesson', 'magazine', 'bible', 'form', 'supply', 'other'] as const
export type MaterialCategory = (typeof MATERIAL_CATEGORIES)[number]
export const MATERIAL_CATEGORY_LABELS: Record<MaterialCategory, string> = {
  literature: 'Literatura', lesson: 'Lição', magazine: 'Revista', bible: 'Bíblia',
  form: 'Formulário', supply: 'Material de apoio', other: 'Outro',
}

export const MATERIAL_UNITS = ['un', 'pct', 'cx', 'kit'] as const
export type MaterialUnit = (typeof MATERIAL_UNITS)[number]
export const MATERIAL_UNIT_LABELS: Record<MaterialUnit, string> = {
  un: 'unidade', pct: 'pacote', cx: 'caixa', kit: 'kit',
}

export interface MaterialData {
  name: string
  category: MaterialCategory
  /** Quantidade recebida da Associação. */
  quantity: number
  unit: MaterialUnit
  date: string
  notes: string
  createdAt: string
  updatedAt: string
}
export type MaterialEntity = MaterialData & { id: string }

export const DISTRIBUTION_STATUSES = ['pending', 'delivered', 'cancelled'] as const
export type DistributionStatus = (typeof DISTRIBUTION_STATUSES)[number]
export const DISTRIBUTION_STATUS_LABELS: Record<DistributionStatus, string> = {
  pending: 'A entregar', delivered: 'Entregue', cancelled: 'Cancelada',
}

export interface MaterialDistributionData {
  materialId: string
  churchId: string
  /** O que a divisão reservou para esta igreja. */
  planned: number
  /** O que foi entregue de fato. Pode ser diferente do planejado. */
  delivered: number
  deliveredAt: string
  status: DistributionStatus
  /**
   * Quem recebeu. Ou um membro cadastrado, ou um nome escrito à mão — nem toda
   * pessoa que recebe um pacote de lições está no cadastro da igreja.
   */
  receivedByPersonId: string | null
  receivedByName: string
  notes: string
  createdAt: string
  updatedAt: string
}
export type MaterialDistributionEntity = MaterialDistributionData & { id: string }

export const NEED_PRIORITIES = ['high', 'normal', 'low'] as const
export type NeedPriority = (typeof NEED_PRIORITIES)[number]
export const NEED_PRIORITY_LABELS: Record<NeedPriority, string> = {
  high: 'Alta', normal: 'Normal', low: 'Baixa',
}

export const NEED_STATUSES = ['to_request', 'requested', 'received', 'cancelled'] as const
export type NeedStatus = (typeof NEED_STATUSES)[number]
export const NEED_STATUS_LABELS: Record<NeedStatus, string> = {
  to_request: 'Precisa pedir', requested: 'Solicitado', received: 'Recebido', cancelled: 'Cancelado',
}

export interface MaterialNeedData {
  item: string
  quantity: number
  unit: MaterialUnit
  priority: NeedPriority
  reason: string
  notes: string
  status: NeedStatus
  /** Preenchido quando o pedido recebido virou item de estoque. */
  stockMaterialId: string | null
  /** A tarefa aberta por uma necessidade de prioridade alta. */
  taskId?: string | null
  createdAt: string
  updatedAt: string
}
export type MaterialNeedEntity = MaterialNeedData & { id: string }

/**
 * Como dividir um material entre as igrejas.
 *
 * `rule` usa o peso por tipo de igreja — o caso comum é igreja organizada
 * receber mais do que grupo. `equal` divide igualmente. `manual` é o pastor
 * escrevendo quantidade por igreja. Em todos, a prévia aparece antes de
 * confirmar: distribuir material é fácil de errar e caro de desfazer.
 */
export const DISTRIBUTION_MODES = ['rule', 'equal', 'manual'] as const
export type DistributionMode = (typeof DISTRIBUTION_MODES)[number]
export const DISTRIBUTION_MODE_LABELS: Record<DistributionMode, string> = {
  rule: 'Por regra do tipo de igreja', equal: 'Divisão igualitária', manual: 'Divisão manual',
}

export type DistributionWeights = Record<ChurchType, number>

/** Regra padrão, e editável na tela: igreja organizada 2, grupo 1, ponto 1. */
export const DEFAULT_WEIGHTS: DistributionWeights = {
  organized_church: 2,
  group: 1,
  preaching_point: 1,
}

export interface DistributionLine {
  churchId: string
  churchName: string
  churchType: ChurchType
  quantity: number
}

export interface DistributionPreview {
  lines: DistributionLine[]
  /** Quanto a divisão usou do que está disponível. */
  distributed: number
  available: number
  /** Sobra depois de distribuir. */
  leftover: number
  /** Falta, quando a divisão pede mais do que existe. */
  missing: number
}
