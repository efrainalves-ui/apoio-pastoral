import { describe, expect, it } from 'vitest'
import type { ChurchEntity } from '../district/types'
import { aplicarRecusas, conferir, contarPendencias } from './conferencia'
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

const anterior = (churchId: string, valor: number): RelatorioIntegradoEntity => ({
  id: crypto.randomUUID(), churchId, trimestre: '2026-1',
  valores: { [PEQUENOS_GRUPOS]: { tipo: 'numero', valor } },
  origem: { arquivo: 'anterior-ficticio.pdf', paginas: [1] },
  importBatchId: 'lote', createdAt: '', updatedAt: '',
})

describe('conferência antes de gravar', () => {
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

  /*
    Igreja que não entrega o relatório não é igreja zerada. O pastor confirmou
    que isso acontece; ela sai numa lista própria e os números dela continuam
    sendo os do último trimestre que informou.
  */
  it('aponta as igrejas ativas que não vieram no relatório', () => {
    const conferencia = conferir(lido([
      { nome: 'Central Fictícia', paginas: [1], valores: {}, naoInformados: [] },
    ]), CHURCHES, [], 'arquivo.pdf', 'hash', false)
    expect(conferencia.semRelatorio.map(({ id }) => id)).toEqual(['c-norte', 'c-sul'])
  })

  it('igreja arquivada não é cobrada de relatório', () => {
    const comArquivada = [...CHURCHES, igreja('c-velha', 'Fictícia Encerrada', 'archived')]
    const conferencia = conferir(lido([]), comArquivada, [], 'arquivo.pdf', 'hash', false)
    expect(conferencia.semRelatorio.map(({ id }) => id)).not.toContain('c-velha')
  })

  /* 5 para 45 interrompe; 5 para 4 passa. É a regra que o pastor pediu. */
  it('marca para confirmar o número que destoa do trimestre anterior', () => {
    const conferencia = conferir(lido([
      { nome: 'Central Fictícia', paginas: [10], valores: { [PEQUENOS_GRUPOS]: { tipo: 'numero', valor: 45 } }, naoInformados: [] },
      { nome: 'Fictícia do Norte', paginas: [13], valores: { [PEQUENOS_GRUPOS]: { tipo: 'numero', valor: 4 } }, naoInformados: [] },
    ]), CHURCHES, [anterior('c-central', 5), anterior('c-norte', 5)], 'arquivo.pdf', 'hash', false)

    const central = conferencia.igrejas.find(({ church }) => church?.id === 'c-central')
    expect(central?.valores[0]?.precisaConfirmar).toBe(true)
    expect(central?.valores[0]?.anterior).toEqual({ trimestre: '2026-1', numero: 5 })

    const norte = conferencia.igrejas.find(({ church }) => church?.id === 'c-norte')
    expect(norte?.valores[0]?.precisaConfirmar).toBe(false)
  })

  it('sem trimestre anterior, não há com o que comparar e nada interrompe', () => {
    const conferencia = conferir(lido([
      { nome: 'Central Fictícia', paginas: [10], valores: { [PEQUENOS_GRUPOS]: { tipo: 'numero', valor: 45 } }, naoInformados: [] },
    ]), CHURCHES, [], 'arquivo.pdf', 'hash', false)
    expect(conferencia.igrejas[0]?.valores[0]?.precisaConfirmar).toBe(false)
  })

  it('conta o que está pronto, o que espera confirmação e o que ninguém informou', () => {
    const conferencia = conferir(lido([
      { nome: 'Central Fictícia', paginas: [10],
        valores: { [PEQUENOS_GRUPOS]: { tipo: 'numero', valor: 45 }, [CAMPANHAS]: { tipo: 'numero', valor: 2 } },
        naoInformados: [CAMPANHAS] },
    ]), CHURCHES, [anterior('c-central', 5)], 'arquivo.pdf', 'hash', false)
    expect(contarPendencias(conferencia)).toEqual({ confirmar: 1, prontos: 1, semInformacao: 1 })
  })

  /*
    Um valor recusado não vira zero nem some. Fica registrado como recusado, e o
    indicador continua valendo o último trimestre que informou: no trimestre
    seguinte é preciso saber que o número foi visto e rejeitado.
  */
  it('a recusa tira o valor da gravação e fica registrada', () => {
    const conferencia = conferir(lido([
      { nome: 'Central Fictícia', paginas: [10],
        valores: { [PEQUENOS_GRUPOS]: { tipo: 'numero', valor: 45 }, [CAMPANHAS]: { tipo: 'numero', valor: 2 } },
        naoInformados: [] },
    ]), CHURCHES, [anterior('c-central', 5)], 'arquivo.pdf', 'hash', false)

    const resultado = aplicarRecusas(conferencia.igrejas[0]!, [PEQUENOS_GRUPOS])
    expect(resultado.valores[PEQUENOS_GRUPOS]).toBeUndefined()
    expect(resultado.valores[CAMPANHAS]).toEqual({ tipo: 'numero', valor: 2 })
    expect(resultado.recusados).toEqual([PEQUENOS_GRUPOS])
  })

  it('sem recusa, tudo que veio é gravado', () => {
    const conferencia = conferir(lido([
      { nome: 'Central Fictícia', paginas: [10], valores: { [CAMPANHAS]: { tipo: 'numero', valor: 2 } }, naoInformados: [] },
    ]), CHURCHES, [], 'arquivo.pdf', 'hash', false)
    expect(Object.keys(aplicarRecusas(conferencia.igrejas[0]!, []).valores)).toEqual([CAMPANHAS])
  })
})
