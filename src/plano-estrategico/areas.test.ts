import { describe, expect, it } from 'vitest'
import { CATALOGO_DO_RELATORIO, indicadorPorId } from '../integrated-report/catalogo'
import type { RelatorioIntegradoEntity, ValorDoIndicador } from '../integrated-report/types'
import {
  AREAS_DO_PLANO, anoDeReferencia, areaPorSlug, comparacaoDaArea, evolucaoDoAno, indicadoresQueCompoem, leituraPrincipalDaIgreja,
  origensNoPeriodo, resultadoDaArea, textoDaDiferenca, ultimoTrimestreComDados, variacaoDaComparacao,
} from './areas'

const IDENTIDADE = areaPorSlug('identidade')!
const NOVAS = areaPorSlug('novas-geracoes')!
const DISCIPULADO = areaPorSlug('discipulado')!

function relatorio(churchId: string, trimestre: string, valores: Record<string, ValorDoIndicador>, arquivo = 'relatorio-ficticio.pdf', paginas = [1]): RelatorioIntegradoEntity {
  return { id: `${churchId}-${trimestre}`, churchId, trimestre, valores, origem: { arquivo, paginas }, importBatchId: `lote-${trimestre}`, createdAt: '', updatedAt: '' }
}
const numero = (valor: number): ValorDoIndicador => ({ tipo: 'numero', valor })
const identidade = (valor: number) => ({ [IDENTIDADE.principal.id]: numero(valor) })
const discipulado = (valor: number) => ({ [DISCIPULADO.principal.id]: numero(valor) })

describe('as quatro áreas e o indicador de cada cartão', () => {
  it('cada cartão usa uma pergunta que existe no Relatório Integrado e tem número', () => {
    expect(AREAS_DO_PLANO.map(({ nome }) => nome)).toEqual(['Identidade Adventista', 'Liderança', 'Novas Gerações', 'Discipulado'])
    expect(AREAS_DO_PLANO.map(({ simbolo }) => simbolo)).toEqual(['circulo', 'triangulo', 'semicirculo', 'quadrado'])
    for (const area of AREAS_DO_PLANO) {
      const indicador = indicadorPorId(area.principal.id)
      expect(indicador, area.nome).toBeDefined()
      expect(indicador?.formato, area.nome).not.toBe('sim_nao')
    }
    expect(indicadorPorId(NOVAS.principal.id)?.formato).toBe('por_classe')
  })

  it('os indicadores que compõem a área vêm da ligação já usada no planejamento, com o do cartão primeiro', () => {
    const novas = indicadoresQueCompoem(NOVAS)
    expect(novas[0]).toMatchObject({ principal: true, recorte: 'Classes Bebês a Jovens' })
    expect(novas.slice(1).every(({ principal }) => !principal)).toBe(true)
    expect(novas.map(({ indicador }) => indicador.id)).toContain('ministerio-jovem--numero-de-participantes-do-maranata-academy')
    for (const area of AREAS_DO_PLANO) {
      const ids = indicadoresQueCompoem(area).map(({ indicador }) => indicador.id)
      expect(new Set(ids).size, area.nome).toBe(ids.length)
      expect(ids.every((id) => CATALOGO_DO_RELATORIO.find((item) => item.id === id)?.formato !== 'sim_nao'), area.nome).toBe(true)
    }
  })
})

describe('resultado do distrito', () => {
  it('relatório de um trimestre só: o número dele, sem base de comparação, e a igreja sem relatório à parte', () => {
    const relatorios = [relatorio('a', '2026-1', identidade(12))]
    expect(resultadoDaArea(relatorios, ['a', 'b'], IDENTIDADE, { ano: 2026, trimestre: null })).toEqual({ numero: 12, informaram: 1, naoResponderam: 0, semRelatorio: 1, trimestre: '2026-1' })
    expect(comparacaoDaArea(relatorios, ['a', 'b'], IDENTIDADE, { ano: 2026, trimestre: null })).toMatchObject({ tendencia: 'sem_base', de: null, para: '2026-1', atual: 12 })
    expect(ultimoTrimestreComDados(relatorios, ['a', 'b'], IDENTIDADE, 2026)).toBe('2026-1')
  })

  it('vários trimestres: quem acumula soma os trimestres; quem é situação vale o último de cada igreja', () => {
    const relatorios = [
      relatorio('a', '2026-1', { ...identidade(5), ...discipulado(4) }),
      relatorio('a', '2026-2', { ...identidade(7), ...discipulado(6) }),
      relatorio('b', '2026-1', discipulado(3)),
    ]
    const ano = { ano: 2026, trimestre: null }
    expect(resultadoDaArea(relatorios, ['a', 'b'], IDENTIDADE, ano).numero).toBe(12)
    expect(resultadoDaArea(relatorios, ['a', 'b'], DISCIPULADO, ano).numero).toBe(9)
    expect(resultadoDaArea(relatorios, ['a', 'b'], DISCIPULADO, { ano: 2026, trimestre: 2 })).toMatchObject({ numero: 6, informaram: 1, semRelatorio: 1 })
    expect(comparacaoDaArea(relatorios, ['a', 'b'], IDENTIDADE, ano)).toMatchObject({ de: '2026-1', para: '2026-2', diferenca: 2, percentual: 40, tendencia: 'alta' })
    expect(evolucaoDoAno(relatorios, ['a', 'b'], IDENTIDADE, 2026).map(({ resultado }) => resultado.numero)).toEqual([5, 7, null, null])
  })

  it('zero é resposta; relatório sem a pergunta é "sem informação", não zero', () => {
    const relatorios = [relatorio('a', '2026-3', identidade(0)), relatorio('b', '2026-3', {})]
    expect(resultadoDaArea(relatorios, ['a', 'b'], IDENTIDADE, { ano: 2026, trimestre: 3 })).toMatchObject({ numero: 0, informaram: 1, naoResponderam: 1, semRelatorio: 0 })
    expect(resultadoDaArea([relatorio('b', '2026-3', {})], ['b'], IDENTIDADE, { ano: 2026, trimestre: 3 }).numero).toBeNull()
    expect(resultadoDaArea([], ['a'], IDENTIDADE, { ano: 2026, trimestre: null })).toMatchObject({ numero: null, semRelatorio: 1 })
  })

  it('Novas Gerações soma só as classes de Bebês a Jovens', () => {
    const alunos = (classes: Record<string, number>, total: number) => ({ [NOVAS.principal.id]: { tipo: 'por_classe', classes, total } as ValorDoIndicador })
    const relatorios = [
      relatorio('a', '2026-1', alunos({ 'Bebês': 1, Iniciantes: 2, Jovens: 4, Adultos: 10, Filiais: 3 }, 20)),
      relatorio('b', '2026-1', alunos({ Adultos: 9 }, 9)),
    ]
    const periodo = { ano: 2026, trimestre: 1 }
    expect(leituraPrincipalDaIgreja(relatorios, 'a', NOVAS, periodo)).toMatchObject({ situacao: 'informado', numero: 7 })
    expect(leituraPrincipalDaIgreja(relatorios, 'b', NOVAS, periodo)).toMatchObject({ situacao: 'nao_respondido', numero: null })
    expect(resultadoDaArea(relatorios, ['a', 'b'], NOVAS, periodo)).toMatchObject({ numero: 7, informaram: 1, naoResponderam: 1 })
  })

  it('a comparação do 1º trimestre atravessa o ano', () => {
    const relatorios = [relatorio('a', '2025-4', identidade(10)), relatorio('a', '2026-1', identidade(15))]
    expect(comparacaoDaArea(relatorios, ['a'], IDENTIDADE, { ano: 2026, trimestre: 1 })).toMatchObject({ de: '2025-4', para: '2026-1', diferenca: 5, percentual: 50 })
  })

  it('o ano de referência é o mais recente com relatório', () => {
    expect(anoDeReferencia([relatorio('a', '2025-2', {}), relatorio('a', '2024-4', {})], 2026)).toBe(2025)
    expect(anoDeReferencia([], 2026)).toBe(2026)
  })
})

describe('origem de cada informação', () => {
  it('agrupa por arquivo e trimestre, só das igrejas ativas que informaram', () => {
    const relatorios = [
      relatorio('a', '2026-1', identidade(3), 'primeiro.pdf', [1, 2]),
      relatorio('b', '2026-1', identidade(4), 'primeiro.pdf', [4]),
      relatorio('c', '2026-1', {}, 'primeiro.pdf', [7]),
      relatorio('arquivada', '2026-2', identidade(9), 'segundo.pdf', [1]),
      relatorio('a', '2026-2', identidade(1), 'segundo.pdf', [2]),
    ]
    expect(origensNoPeriodo(relatorios, ['a', 'b', 'c'], IDENTIDADE.principal.id, { ano: 2026, trimestre: null })).toEqual([
      { arquivo: 'primeiro.pdf', trimestre: '2026-1', paginas: [1, 2, 4], igrejas: 2 },
      { arquivo: 'segundo.pdf', trimestre: '2026-2', paginas: [2], igrejas: 1 },
    ])
  })

  it('a variação vai só em porcentagem, com sinal e tom', () => {
    expect(variacaoDaComparacao({ diferenca: 5, percentual: 125 })).toEqual({ texto: '+125%', tom: 'alta' })
    expect(variacaoDaComparacao({ diferenca: -3, percentual: -33.3 })).toEqual({ texto: '−33,3%', tom: 'queda' })
    expect(variacaoDaComparacao({ diferenca: 0, percentual: 0 })).toEqual({ texto: '0%', tom: 'estavel' })
    // Sem trimestre anterior, e crescer sobre zero: porcentagem não existe.
    expect(variacaoDaComparacao({ diferenca: null, percentual: null })).toEqual({ texto: '—', tom: 'sem_base' })
    expect(variacaoDaComparacao({ diferenca: 4, percentual: null })).toEqual({ texto: '—', tom: 'sem_base' })
  })

  it('a diferença é escrita com sinal e porcentagem só quando há base', () => {
    expect(textoDaDiferenca(12, 8.5)).toBe('+12 (+8,5%)')
    expect(textoDaDiferenca(-3, null)).toBe('−3')
    expect(textoDaDiferenca(0, 0)).toBe('0 (0%)')
    expect(textoDaDiferenca(null, null, '—')).toBe('—')
  })
})
