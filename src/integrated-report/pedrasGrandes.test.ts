import { describe, expect, it } from 'vitest'
import type { ChurchEntity } from '../district/types'
import { conferir } from './conferencia'
import type { RelatorioLido } from './leitura'
import { semRelatorio, valorAtual, numeroDoValor, totalDoDistrito } from './service'
import type { RelatorioIntegradoEntity, ValorDoIndicador } from './types'

const PEQUENOS_GRUPOS = 'escola-sabatina--numero-de-pequenos-grupos-da-igreja'
const numero = (valor: number): ValorDoIndicador => ({ tipo: 'numero', valor })

const igreja = (id: string, name: string): ChurchEntity => ({
  id, districtId: 'distrito', name, type: 'organized_church', externalCode: '', address: '',
  worshipSchedules: [], administrativeNotes: '', status: 'active', history: [], createdAt: '', updatedAt: '',
})

const CHURCHES = [igreja('c-pedras', 'Pedras Grandes'), igreja('c-central', 'Central')]

const relatorio = (churchId: string, trimestre: string, valores: Record<string, ValorDoIndicador>): RelatorioIntegradoEntity => ({
  id: crypto.randomUUID(), churchId, trimestre, valores,
  origem: { arquivo: 'x.pdf', paginas: [22, 23, 24] }, importBatchId: '', createdAt: '', updatedAt: '',
})

/*
  Pedras Grandes aparece no 1º trimestre e não no 2º. O pastor confirmou que
  isso acontece — algumas igrejas simplesmente não entregam o relatório. Ela não
  pode receber zeros, não pode receber cópia do trimestre anterior, e não pode
  sumir do distrito.
*/
describe('Pedras Grandes: a igreja que não entregou o segundo trimestre', () => {
  const doPrimeiro = [relatorio('c-pedras', '2026-1', { [PEQUENOS_GRUPOS]: numero(2) })]

  it('aparece como quem não entregou, e não como quem zerou', () => {
    const lido: RelatorioLido = {
      trimestre: '2026-2',
      igrejas: [{ nome: 'Central', paginas: [10], valores: { [PEQUENOS_GRUPOS]: numero(5) }, naoInformados: [] }],
      naoReconhecidos: [], ignorados: [],
    }
    const conferencia = conferir(lido, CHURCHES, doPrimeiro, 'report (7).pdf', 'hash', false)
    expect(conferencia.semRelatorio.map(({ name }) => name)).toEqual(['Pedras Grandes'])
    expect(conferencia.igrejas.map(({ nomeNoRelatorio }) => nomeNoRelatorio)).toEqual(['Central'])
  })

  it('não recebe zero no trimestre em que não entregou', () => {
    expect(semRelatorio(doPrimeiro, '2026-2', ['c-pedras'])).toEqual(['c-pedras'])
    // Nenhum registro do 2º trimestre é criado para ela.
    expect(doPrimeiro.filter(({ trimestre }) => trimestre === '2026-2')).toEqual([])
  })

  /* O valor dela continua sendo o do 1º trimestre, e não uma cópia gravada. */
  it('mantém o valor do 1º trimestre sem copiá-lo para o 2º', () => {
    const leitura = valorAtual(doPrimeiro, 'c-pedras', PEQUENOS_GRUPOS)
    expect(leitura?.trimestre).toBe('2026-1')
    expect(numeroDoValor(leitura?.valor)).toBe(2)
  })

  it('continua contando no total do distrito, pelo último valor que informou', () => {
    const comCentral = [...doPrimeiro, relatorio('c-central', '2026-2', { [PEQUENOS_GRUPOS]: numero(5) })]
    expect(totalDoDistrito(comCentral, PEQUENOS_GRUPOS, ['c-pedras', 'c-central'])).toBe(7)
  })

  /* O distrito sai do cadastro: os dois nomes dos cabeçalhos não criam outro. */
  it('nome diferente no cabeçalho não cria distrito novo', () => {
    const lido: RelatorioLido = {
      trimestre: '2026-2',
      igrejas: [{ nome: 'Central', paginas: [10], valores: {}, naoInformados: [] }],
      naoReconhecidos: [], ignorados: [],
    }
    const conferencia = conferir(lido, CHURCHES, [], 'report (7).pdf', 'hash', false)
    // A conferência só conhece as igrejas do cadastro; nada de distrito vem do PDF.
    expect(conferencia.igrejas[0]?.church?.districtId).toBe('distrito')
    expect(Object.keys(conferencia)).not.toContain('distrito')
  })
})
