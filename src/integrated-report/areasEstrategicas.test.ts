import { describe, expect, it } from 'vitest'
import { AREA_DO_INDICADOR, areasEstrategicas, indicadoresSemArea } from './areasEstrategicas'
import { indicadorPorId } from './catalogo'
import type { RelatorioIntegradoEntity, ValorDoIndicador } from './types'

const PEQUENOS_GRUPOS = 'escola-sabatina--numero-de-pequenos-grupos-da-igreja'
const CAMPANHAS = 'evangelismo--numero-de-campanhas-evangelisticas-em-geral'
const numero = (valor: number): ValorDoIndicador => ({ tipo: 'numero', valor })

const relatorio = (churchId: string, trimestre: string, valores: Record<string, ValorDoIndicador>): RelatorioIntegradoEntity => ({
  id: crypto.randomUUID(), churchId, trimestre, valores,
  origem: { arquivo: 'x.pdf', paginas: [1] }, importBatchId: '', createdAt: '', updatedAt: '',
})

/* O mapa é escrito à mão; identificador errado é gráfico vazio em silêncio. */
describe('o mapa das quatro áreas estratégicas', () => {
  it('todo identificador mapeado existe no catálogo', () => {
    for (const id of Object.keys(AREA_DO_INDICADOR)) expect(indicadorPorId(id), id).not.toBeNull()
  })

  it('cobre as quatro áreas', () => {
    expect(new Set(Object.values(AREA_DO_INDICADOR))).toEqual(
      new Set(['identity', 'leadership', 'new_generations', 'discipleship']))
  })

  it('nenhum indicador de batismo entra em área nenhuma', () => {
    for (const id of Object.keys(AREA_DO_INDICADOR)) {
      expect(/batism/iu.test(indicadorPorId(id)?.rotulo ?? ''), id).toBe(false)
    }
  })

  /* O que ficou de fora fica visível, para nada sumir sem alguém perceber. */
  it('lista o que ainda não tem área', () => {
    const semArea = indicadoresSemArea()
    expect(Array.isArray(semArea)).toBe(true)
    for (const indicador of semArea) expect(AREA_DO_INDICADOR[indicador.id]).toBeUndefined()
  })
})

describe('as séries de cada área', () => {
  const relatorios = [
    relatorio('igreja-a', '2026-1', { [PEQUENOS_GRUPOS]: numero(5), [CAMPANHAS]: numero(1) }),
    relatorio('igreja-b', '2026-1', { [PEQUENOS_GRUPOS]: numero(2), [CAMPANHAS]: numero(2) }),
    relatorio('igreja-a', '2026-2', { [PEQUENOS_GRUPOS]: numero(4), [CAMPANHAS]: numero(3) }),
  ]
  const ativas = ['igreja-a', 'igreja-b']
  const serie = (id: string) => areasEstrategicas(relatorios, ativas)
    .flatMap(({ series }) => series).find(({ indicador }) => indicador.id === id)

  /* Situação da igreja: vale o mais recente de cada uma, somado. */
  it('Pequenos Grupos usa o valor mais recente de cada igreja', () => {
    // igreja-a informou 4 no 2º; igreja-b informou 2 no 1º e ficou muda no 2º.
    expect(serie(PEQUENOS_GRUPOS)?.atual).toBe(6)
  })

  /* Resultado do período: soma os trimestres. */
  it('Campanhas soma os trimestres', () => {
    expect(serie(CAMPANHAS)?.atual).toBe(6)
  })

  it('cada trimestre vira um ponto, com quantas igrejas informaram', () => {
    const pontos = serie(PEQUENOS_GRUPOS)?.pontos
    expect(pontos).toHaveLength(2)
    expect(pontos?.[0]).toMatchObject({ trimestre: '2026-1', valor: 7, igrejasQueInformaram: 2 })
    expect(pontos?.[1]).toMatchObject({ trimestre: '2026-2', valor: 4, igrejasQueInformaram: 1 })
  })

  /* Trimestre mudo vira buraco na linha, nunca zero. */
  it('trimestre sem ninguém informando vira ponto nulo', () => {
    const comVazio = [relatorio('igreja-a', '2026-1', { [PEQUENOS_GRUPOS]: numero(5) }), relatorio('igreja-a', '2026-2', {})]
    const pontos = areasEstrategicas(comVazio, ['igreja-a'])
      .flatMap(({ series }) => series).find(({ indicador }) => indicador.id === PEQUENOS_GRUPOS)?.pontos
    expect(pontos?.[1]).toMatchObject({ trimestre: '2026-2', valor: null, igrejasQueInformaram: 0 })
  })

  /*
    Valor antigo mostrado como atual é a forma mais silenciosa de errar: a série
    diz de quando ele é.
  */
  it('avisa quando o valor exibido não é do último trimestre', () => {
    const so1T = [relatorio('igreja-a', '2026-1', { [PEQUENOS_GRUPOS]: numero(5) }), relatorio('igreja-b', '2026-2', {})]
    const s = areasEstrategicas(so1T, ['igreja-a', 'igreja-b'])
      .flatMap(({ series }) => series).find(({ indicador }) => indicador.id === PEQUENOS_GRUPOS)
    expect(s?.trimestreDoAtual).toBe('2026-1')
    expect(s?.desatualizado).toBe(true)
  })

  it('igreja fora das ativas não entra na série', () => {
    expect(areasEstrategicas(relatorios, ['igreja-a'])
      .flatMap(({ series }) => series).find(({ indicador }) => indicador.id === PEQUENOS_GRUPOS)?.atual).toBe(4)
  })

  it('sem relatório nenhum, não há série com valor', () => {
    const areas = areasEstrategicas([], ativas)
    expect(areas.flatMap(({ series }) => series).every(({ atual }) => atual === null)).toBe(true)
  })
})
