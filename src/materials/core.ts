import type { ChurchEntity } from '../district/types'
import {
  DEFAULT_WEIGHTS, type DistributionLine, type DistributionMode, type DistributionPreview,
  type DistributionWeights, type MaterialDistributionEntity, type MaterialEntity,
} from './types'

/**
 * Situação de um material no estoque.
 *
 * `pending` é o que já foi reservado para uma igreja e ainda não foi entregue.
 * Ele não está disponível para uma segunda divisão — foi exatamente esse
 * detalhe que motivou separar `available` de `received`.
 */
export interface MaterialStock {
  received: number
  distributed: number
  pending: number
  available: number
}

export function materialStock(material: MaterialEntity, distributions: MaterialDistributionEntity[]): MaterialStock {
  const doMaterial = distributions.filter((item) => item.materialId === material.id && item.status !== 'cancelled')
  const distributed = doMaterial.filter(({ status }) => status === 'delivered').reduce((total, item) => total + item.delivered, 0)
  const pending = doMaterial.filter(({ status }) => status === 'pending').reduce((total, item) => total + item.planned, 0)
  return { received: material.quantity, distributed, pending, available: material.quantity - distributed - pending }
}

/**
 * Divide `quantity` entre as igrejas e devolve a prévia, sem gravar nada.
 *
 * A divisão por regra e a igualitária usam o maior resto: distribuir 10 lições
 * entre 3 igrejas precisa dar 4, 3 e 3 — nunca 3, 3 e 3 com uma sobra que
 * ninguém pediu. `manual` respeita o que o pastor escreveu, inclusive quando
 * ele pede mais do que existe: a prévia mostra a falta em vez de corrigir por
 * conta própria.
 */
export function distributionPreview(
  churches: ChurchEntity[],
  quantity: number,
  mode: DistributionMode,
  options: { weights?: DistributionWeights; manual?: Record<string, number> } = {},
): DistributionPreview {
  const pesos = options.weights ?? DEFAULT_WEIGHTS
  const ativas = churches.filter((church) => church.status !== 'archived')
  const disponivel = Math.max(0, Math.floor(quantity))

  const linhaDe = (church: ChurchEntity, valor: number): DistributionLine => ({
    churchId: church.id, churchName: church.name, churchType: church.type, quantity: Math.max(0, Math.floor(valor)),
  })

  let lines: DistributionLine[]
  if (mode === 'manual') {
    lines = ativas.map((church) => linhaDe(church, options.manual?.[church.id] ?? 0))
  } else {
    const peso = (church: ChurchEntity) => mode === 'equal' ? 1 : Math.max(0, pesos[church.type] ?? 0)
    const total = ativas.reduce((soma, church) => soma + peso(church), 0)
    if (total === 0) {
      lines = ativas.map((church) => linhaDe(church, 0))
    } else {
      // Piso primeiro, resto depois: quem tem a maior parte fracionária leva a
      // unidade que sobrou, e o desempate é pelo nome para a prévia ser sempre
      // a mesma com os mesmos dados.
      const bruto = ativas.map((church) => ({ church, exato: (disponivel * peso(church)) / total }))
      lines = bruto.map(({ church, exato }) => linhaDe(church, Math.floor(exato)))
      let sobra = disponivel - lines.reduce((soma, linha) => soma + linha.quantity, 0)
      const porResto = [...bruto]
        .map((item, indice) => ({ indice, resto: item.exato - Math.floor(item.exato), nome: item.church.name }))
        .sort((esquerda, direita) => direita.resto - esquerda.resto || esquerda.nome.localeCompare(direita.nome, 'pt-BR'))
      for (const { indice } of porResto) {
        if (sobra <= 0) break
        lines[indice] = { ...lines[indice]!, quantity: lines[indice]!.quantity + 1 }
        sobra -= 1
      }
    }
  }

  const distributed = lines.reduce((total, linha) => total + linha.quantity, 0)
  return {
    lines: lines.sort((esquerda, direita) => esquerda.churchName.localeCompare(direita.churchName, 'pt-BR')),
    distributed,
    available: disponivel,
    leftover: Math.max(0, disponivel - distributed),
    missing: Math.max(0, distributed - disponivel),
  }
}

/** Total entregue a uma igreja, somando todos os materiais. */
export function deliveredToChurch(distributions: MaterialDistributionEntity[], churchId: string): number {
  return distributions
    .filter((item) => item.churchId === churchId && item.status === 'delivered')
    .reduce((total, item) => total + item.delivered, 0)
}

export interface MaterialsSummary {
  materials: number
  received: number
  distributed: number
  pending: number
  available: number
  needsToRequest: number
}

export function materialsSummary(
  materials: MaterialEntity[],
  distributions: MaterialDistributionEntity[],
  needsToRequest: number,
): MaterialsSummary {
  const estoques = materials.map((material) => materialStock(material, distributions))
  return {
    materials: materials.length,
    received: estoques.reduce((total, item) => total + item.received, 0),
    distributed: estoques.reduce((total, item) => total + item.distributed, 0),
    pending: estoques.reduce((total, item) => total + item.pending, 0),
    available: estoques.reduce((total, item) => total + item.available, 0),
    needsToRequest,
  }
}
