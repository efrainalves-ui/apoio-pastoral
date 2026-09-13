import { describe, expect, it } from 'vitest'
import type { ChurchEntity } from '../district/types'
import { aplicarDecisoes, aplicarRecusas, conferir, contarPendencias, estaPendente } from './conferencia'
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

/*
  Quatro destinos para um valor que destoa: aprovar o que está no papel, digitar
  o número certo, recusar, ou não decidir ainda. Pendente é o estado em que ele
  nasce, e não é aprovado nem recusado — misturar os dois faria "não olhei"
  parecer "olhei e recusei".
*/
describe('as decisões sobre um valor que destoa', () => {
  const conferencia = () => conferir(lido([
    { nome: 'Central Fictícia', paginas: [10],
      valores: { [PEQUENOS_GRUPOS]: { tipo: 'numero', valor: 45 }, [CAMPANHAS]: { tipo: 'numero', valor: 2 } },
      naoInformados: [] },
  ]), CHURCHES, [anterior('c-central', 5)], 'arquivo.pdf', 'hash', false)

  it('nasce pendente, e pendente não grava', () => {
    const igreja = conferencia().igrejas[0]!
    const resultado = aplicarDecisoes(igreja, {})
    expect(resultado.pendentes).toEqual([PEQUENOS_GRUPOS])
    expect(resultado.valores[PEQUENOS_GRUPOS]).toBeUndefined()
    // O que não destoa entra sem precisar de decisão.
    expect(resultado.valores[CAMPANHAS]).toEqual({ tipo: 'numero', valor: 2 })
  })

  it('aprovado grava o número do papel', () => {
    const igreja = conferencia().igrejas[0]!
    const resultado = aplicarDecisoes(igreja, { [PEQUENOS_GRUPOS]: { tipo: 'aprovado' } })
    expect(resultado.valores[PEQUENOS_GRUPOS]).toEqual({ tipo: 'numero', valor: 45 })
    expect(resultado.pendentes).toEqual([])
  })

  /* O relatório dizia 45 e eram 4: o pastor escreve o número certo. */
  it('corrigido grava o número que o pastor escreveu, e registra a correção', () => {
    const igreja = conferencia().igrejas[0]!
    const resultado = aplicarDecisoes(igreja, { [PEQUENOS_GRUPOS]: { tipo: 'corrigido', valor: 4 } })
    expect(resultado.valores[PEQUENOS_GRUPOS]).toEqual({ tipo: 'numero', valor: 4 })
    expect(resultado.corrigidos).toEqual([{ id: PEQUENOS_GRUPOS, de: 45, para: 4 }])
  })

  it('recusado não grava e fica registrado como recusado', () => {
    const igreja = conferencia().igrejas[0]!
    const resultado = aplicarDecisoes(igreja, { [PEQUENOS_GRUPOS]: { tipo: 'recusado' } })
    expect(resultado.valores[PEQUENOS_GRUPOS]).toBeUndefined()
    expect(resultado.recusados).toEqual([PEQUENOS_GRUPOS])
    expect(resultado.pendentes).toEqual([])
  })

  /* Recusado e pendente não podem virar a mesma coisa. */
  it('pendente e recusado ficam em listas diferentes', () => {
    const igreja = conferencia().igrejas[0]!
    expect(aplicarDecisoes(igreja, {}).recusados).toEqual([])
    expect(aplicarDecisoes(igreja, { [PEQUENOS_GRUPOS]: { tipo: 'recusado' } }).pendentes).toEqual([])
  })

  it('estaPendente só olha o que destoa', () => {
    const igreja = conferencia().igrejas[0]!
    const queDestoa = igreja.valores.find(({ indicador }) => indicador.id === PEQUENOS_GRUPOS)!
    const queNaoDestoa = igreja.valores.find(({ indicador }) => indicador.id === CAMPANHAS)!
    expect(estaPendente(queDestoa, {})).toBe(true)
    expect(estaPendente(queNaoDestoa, {})).toBe(false)
    expect(estaPendente(queDestoa, { [PEQUENOS_GRUPOS]: { tipo: 'aprovado' } })).toBe(false)
  })

  /* Corrigir um valor por classe guarda o total corrigido sem inventar classes. */
  it('corrigir um valor por classe não inventa categoria', () => {
    const comClasses = conferir(lido([
      { nome: 'Central Fictícia', paginas: [10],
        valores: { [PEQUENOS_GRUPOS]: { tipo: 'por_classe', classes: { Adultos: 40 }, total: 45 } },
        naoInformados: [] },
    ]), CHURCHES, [anterior('c-central', 5)], 'a.pdf', 'h', false)
    const resultado = aplicarDecisoes(comClasses.igrejas[0]!, { [PEQUENOS_GRUPOS]: { tipo: 'corrigido', valor: 4 } })
    expect(resultado.valores[PEQUENOS_GRUPOS]).toEqual({ tipo: 'por_classe', classes: {}, total: 4 })
  })
})
