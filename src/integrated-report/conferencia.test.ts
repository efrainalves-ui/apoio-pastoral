import { describe, expect, it } from 'vitest'
import type { ChurchEntity } from '../district/types'
import { conferir, resumoDaConferencia, valoresParaGravar } from './conferencia'
import type { RelatorioLido } from './leitura'
import type { RelatorioIntegradoEntity } from './types'

const PEQUENOS_GRUPOS = 'escola-sabatina--numero-de-pequenos-grupos-da-igreja'
const CAMPANHAS = 'evangelismo--numero-de-campanhas-evangelisticas-em-geral'

const igreja = (id: string, name: string, status: ChurchEntity['status'] = 'active'): ChurchEntity => ({
  id, districtId: 'distrito', name, type: 'organized_church', externalCode: '', address: '',
  worshipSchedules: [], administrativeNotes: '', status, history: [],
  createdAt: '2026-01-01', updatedAt: '2026-01-01',
})

const CHURCHES = [
  igreja('c-central', 'Central Fictícia'),
  igreja('c-norte', 'Fictícia do Norte'),
  igreja('c-sul', 'Fictícia do Sul'),
]

const lido = (igrejas: RelatorioLido['igrejas']): RelatorioLido => ({
  trimestre: '2026-2', igrejas, naoReconhecidos: [], ignorados: ['Número de pessoas levadas ao batismo'],
})

const anterior = (churchId: string, valores: Record<string, number>, trimestre = '2026-1'): RelatorioIntegradoEntity => ({
  id: crypto.randomUUID(), churchId, trimestre,
  valores: Object.fromEntries(Object.entries(valores).map(([id, valor]) => [id, { tipo: 'numero', valor }])),
  origem: { arquivo: 'anterior-ficticio.pdf', paginas: [1] },
  importBatchId: 'lote', createdAt: '', updatedAt: '',
})

describe('antes de gravar', () => {
  it('casa o nome do relatório com a igreja cadastrada, mesmo com a cidade no nome', () => {
    const conferencia = conferir(lido([
      { nome: 'Central Fictícia - Curuçá I', paginas: [10], valores: { [PEQUENOS_GRUPOS]: { tipo: 'numero', valor: 4 } }, naoInformados: [] },
    ]), CHURCHES, [], 'arquivo.pdf', 'hash', false)
    expect(conferencia.igrejas[0]?.church?.id).toBe('c-central')
    expect(conferencia.semCorrespondencia).toEqual([])
  })

  it('nome sem igreja cadastrada não é adivinhado', () => {
    const conferencia = conferir(lido([
      { nome: 'Igreja Que Não Existe', paginas: [1], valores: {}, naoInformados: [] },
    ]), CHURCHES, [], 'arquivo.pdf', 'hash', false)
    expect(conferencia.igrejas[0]?.church).toBeNull()
    expect(conferencia.semCorrespondencia).toEqual(['Igreja Que Não Existe'])
  })

  it('aponta as igrejas ativas que não vieram no relatório, e não cobra a arquivada', () => {
    const comArquivada = [...CHURCHES, igreja('c-velha', 'Fictícia Encerrada', 'archived')]
    const conferencia = conferir(lido([
      { nome: 'Central Fictícia', paginas: [1], valores: {}, naoInformados: [] },
    ]), comArquivada, [], 'arquivo.pdf', 'hash', false)
    expect(conferencia.semRelatorio.map(({ id }) => id)).toEqual(['c-norte', 'c-sul'])
  })
})

describe('todo valor informado é aceito como veio', () => {
  it('o valor extremo recebe asterisco e é gravado exatamente como a igreja escreveu', () => {
    const conferencia = conferir(lido([
      { nome: 'Central Fictícia', paginas: [1], valores: { [PEQUENOS_GRUPOS]: { tipo: 'numero', valor: 45 } }, naoInformados: [] },
    ]), CHURCHES, [anterior('c-central', { [PEQUENOS_GRUPOS]: 5 })], 'arquivo.pdf', 'hash', false)
    const central = conferencia.igrejas[0]!
    expect(central.valores[0]).toMatchObject({ numero: 45, anterior: { trimestre: '2026-1', numero: 5 }, possivelErro: true })
    expect(valoresParaGravar(central)).toEqual({ [PEQUENOS_GRUPOS]: { tipo: 'numero', valor: 45 } })
  })

  it('zero depois de um valor positivo é zero, aceito e sem asterisco', () => {
    const conferencia = conferir(lido([
      { nome: 'Fictícia do Norte', paginas: [1], valores: { [CAMPANHAS]: { tipo: 'numero', valor: 0 } }, naoInformados: [] },
    ]), CHURCHES, [anterior('c-norte', { [CAMPANHAS]: 6 })], 'arquivo.pdf', 'hash', false)
    expect(conferencia.igrejas[0]!.valores[0]).toMatchObject({ numero: 0, possivelErro: false })
    expect(valoresParaGravar(conferencia.igrejas[0]!)).toEqual({ [CAMPANHAS]: { tipo: 'numero', valor: 0 } })
  })

  it('uma mudança comum não recebe asterisco, e sem trimestre anterior não há comparação', () => {
    const comum = conferir(lido([
      { nome: 'Fictícia do Norte', paginas: [1], valores: { [PEQUENOS_GRUPOS]: { tipo: 'numero', valor: 12 } }, naoInformados: [] },
    ]), CHURCHES, [anterior('c-norte', { [PEQUENOS_GRUPOS]: 5 })], 'arquivo.pdf', 'hash', false)
    expect(comum.igrejas[0]!.valores[0]?.possivelErro).toBe(false)

    const primeiro = conferir(lido([
      { nome: 'Fictícia do Sul', paginas: [1], valores: { [PEQUENOS_GRUPOS]: { tipo: 'numero', valor: 90 } }, naoInformados: [] },
    ]), CHURCHES, [], 'arquivo.pdf', 'hash', false)
    expect(primeiro.igrejas[0]!.valores[0]).toMatchObject({ anterior: null, possivelErro: false })
  })

  it('reenviar o trimestre compara com o trimestre anterior, e não com a versão já gravada dele', () => {
    const conferencia = conferir(lido([
      { nome: 'Central Fictícia', paginas: [1], valores: { [PEQUENOS_GRUPOS]: { tipo: 'numero', valor: 45 } }, naoInformados: [] },
    ]), CHURCHES, [anterior('c-central', { [PEQUENOS_GRUPOS]: 40 }), anterior('c-central', { [PEQUENOS_GRUPOS]: 5 }, '2026-2')], 'arquivo.pdf', 'hash', true)
    expect(conferencia.igrejas[0]!.valores[0]).toMatchObject({ anterior: { trimestre: '2026-1', numero: 40 }, possivelErro: false })
  })

  it('conta valores lidos, possíveis erros e o que veio sem informação', () => {
    const conferencia = conferir(lido([
      { nome: 'Central Fictícia', paginas: [1], valores: { [PEQUENOS_GRUPOS]: { tipo: 'numero', valor: 45 }, [CAMPANHAS]: { tipo: 'numero', valor: 1 } }, naoInformados: ['ministerio-pessoal--numero-de-classes-biblicas-em-funcionamento'] },
    ]), CHURCHES, [anterior('c-central', { [PEQUENOS_GRUPOS]: 5 })], 'arquivo.pdf', 'hash', false)
    expect(resumoDaConferencia(conferencia)).toEqual({ valores: 2, possiveisErros: 1, semInformacao: 1 })
  })
})
