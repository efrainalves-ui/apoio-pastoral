import { describe, expect, it } from 'vitest'
import type { ChurchEntity } from '../district/types'
import { distributionPreview, deliveredToChurch, materialStock, materialsSummary } from './core'
import type { MaterialDistributionEntity, MaterialEntity } from './types'

const igreja = (id: string, name: string, type: ChurchEntity['type']): ChurchEntity => ({
  id, districtId: 'distrito-ficticio', name, type, status: 'active',
} as ChurchEntity)

const material = (id: string, quantity: number): MaterialEntity => ({
  id, name: `Material Fictício ${id}`, category: 'literature', quantity, unit: 'un',
  date: '2026-09-01', notes: '', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
})

const distribuicao = (
  id: string, materialId: string, churchId: string, planned: number, delivered: number,
  status: MaterialDistributionEntity['status'],
): MaterialDistributionEntity => ({
  id, materialId, churchId, planned, delivered, deliveredAt: status === 'delivered' ? '2026-09-05' : '',
  status, receivedByPersonId: null, receivedByName: status === 'delivered' ? 'Pessoa Fictícia' : '', notes: '',
  createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
})

const tresIgrejas = [
  igreja('c1', 'Central Fictícia', 'organized_church'),
  igreja('c2', 'Grupo Fictício', 'group'),
  igreja('c3', 'Ponto Fictício', 'preaching_point'),
]

describe('estoque de material', () => {
  it('separa entregue, reservado e disponível', () => {
    const estoque = materialStock(material('m1', 100), [
      distribuicao('d1', 'm1', 'c1', 20, 20, 'delivered'),
      distribuicao('d2', 'm1', 'c2', 15, 0, 'pending'),
      distribuicao('d3', 'm1', 'c3', 10, 0, 'cancelled'),
    ])

    // O cancelado volta para o disponível; o reservado, não — ele já tem dono.
    expect(estoque).toEqual({ received: 100, distributed: 20, pending: 15, available: 65 })
  })

  it('conta o total entregue a uma igreja', () => {
    const entregas = [
      distribuicao('d1', 'm1', 'c1', 20, 18, 'delivered'),
      distribuicao('d2', 'm2', 'c1', 5, 5, 'delivered'),
      distribuicao('d3', 'm1', 'c2', 9, 9, 'delivered'),
    ]

    expect(deliveredToChurch(entregas, 'c1')).toBe(23)
  })

  it('resume o distrito inteiro', () => {
    const resumo = materialsSummary([material('m1', 50), material('m2', 30)], [distribuicao('d1', 'm1', 'c1', 10, 10, 'delivered')], 2)

    expect(resumo).toEqual({ materials: 2, received: 80, distributed: 10, pending: 0, available: 70, needsToRequest: 2 })
  })
})

describe('prévia da divisão', () => {
  it('divide pela regra do tipo de igreja', () => {
    // Igreja organizada 2, grupo 1, ponto 1: em 12, dá 6, 3 e 3.
    const previa = distributionPreview(tresIgrejas, 12, 'rule')

    expect(previa.lines.map(({ churchName, quantity }) => [churchName, quantity])).toEqual([
      ['Central Fictícia', 6], ['Grupo Fictício', 3], ['Ponto Fictício', 3],
    ])
    expect(previa).toMatchObject({ distributed: 12, leftover: 0, missing: 0 })
  })

  it('a regra é editável', () => {
    const previa = distributionPreview(tresIgrejas, 10, 'rule', { weights: { organized_church: 3, group: 1, preaching_point: 1 } })

    expect(previa.lines.find(({ churchId }) => churchId === 'c1')?.quantity).toBe(6)
    expect(previa.distributed).toBe(10)
  })

  it('divide igualmente e distribui o resto pelo maior sobrante', () => {
    // 10 entre 3 não é 3 para cada com uma sobra que ninguém pediu.
    const previa = distributionPreview(tresIgrejas, 10, 'equal')

    expect(previa.lines.reduce((total, linha) => total + linha.quantity, 0)).toBe(10)
    expect(previa.lines.map(({ quantity }) => quantity).sort()).toEqual([3, 3, 4])
    expect(previa.leftover).toBe(0)
  })

  it('a divisão manual respeita o que o pastor escreveu e mostra a falta', () => {
    const previa = distributionPreview(tresIgrejas, 10, 'manual', { manual: { c1: 8, c2: 5, c3: 0 } })

    expect(previa.distributed).toBe(13)
    expect(previa.missing).toBe(3)
    expect(previa.leftover).toBe(0)
  })

  it('mostra a sobra quando a divisão não usa tudo', () => {
    const previa = distributionPreview(tresIgrejas, 10, 'manual', { manual: { c1: 4, c2: 2, c3: 1 } })

    expect(previa).toMatchObject({ distributed: 7, leftover: 3, missing: 0 })
  })

  it('ignora igreja arquivada', () => {
    const comArquivada = [...tresIgrejas, { ...igreja('c4', 'Arquivada Fictícia', 'group'), status: 'archived' } as ChurchEntity]
    const previa = distributionPreview(comArquivada, 12, 'rule')

    expect(previa.lines.some(({ churchName }) => churchName === 'Arquivada Fictícia')).toBe(false)
  })

  it('sem igreja nenhuma, a prévia é vazia e nada é distribuído', () => {
    expect(distributionPreview([], 10, 'rule')).toMatchObject({ lines: [], distributed: 0, leftover: 10 })
  })

  it('a mesma entrada devolve sempre a mesma prévia', () => {
    // O desempate é pelo nome: distribuir material duas vezes com os mesmos
    // dados não pode dar resultados diferentes.
    const primeira = distributionPreview(tresIgrejas, 11, 'equal')
    const segunda = distributionPreview([...tresIgrejas].reverse(), 11, 'equal')

    expect(primeira.lines).toEqual(segunda.lines)
  })
})
