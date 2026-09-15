import { describe, expect, it } from 'vitest'
import {
  anosDosRelatorios, comparacaoDoPeriodo, comparar, coberturaDoPeriodo, desempenhoDasIgrejas, estudosDoPeriodo, faixasDoIndicador,
  historicoDeEnvios, leituraDaIgreja, leituraDoDistrito, possiveisErros, possivelErroNoValor, respostasDoAno, rotuloCurto, serieTrimestral,
  tendenciasDosIndicadores,
} from './painel'
import type { RelatorioIntegradoEntity, ValorDoIndicador } from './types'

const PGS = 'escola-sabatina--numero-de-pequenos-grupos-da-igreja'
const UAS = 'escola-sabatina--numero-de-unidades-de-acao'
const ESTUDOS = 'ministerio-pessoal--numero-de-pessoas-recebendo-estudos-biblicos'
const ASA = 'acao-solidaria-adventista--numero-de-pessoas-recebendo-estudos-biblicos-pela-asa'
const CAMPANHAS = 'evangelismo--numero-de-campanhas-evangelisticas-em-geral'
const ALUNOS = 'escola-sabatina--numero-de-alunos-da-escola-sabatina'

const n = (valor: number): ValorDoIndicador => ({ tipo: 'numero', valor })

function relatorio(churchId: string, trimestre: string, valores: Record<string, ValorDoIndicador>, extra: Partial<RelatorioIntegradoEntity> = {}): RelatorioIntegradoEntity {
  return {
    id: `${churchId}-${trimestre}`, churchId, trimestre, valores, origem: { arquivo: `ficticio-${trimestre}.pdf`, paginas: [1] },
    importBatchId: `lote-${trimestre}`, createdAt: '', updatedAt: `${trimestre}T00:00:00Z`, ...extra,
  }
}

const IGREJAS = ['norte', 'sul', 'leste']
const RELATORIOS = [
  relatorio('norte', '2026-1', { [PGS]: n(5), [ESTUDOS]: n(100), [ASA]: n(20), [CAMPANHAS]: n(3) }),
  relatorio('sul', '2026-1', { [PGS]: n(0), [ESTUDOS]: n(10) }),
  // Gravado na conferência antiga: o 90 ficou esperando confirmação e o PG foi recusado.
  relatorio('norte', '2026-2', { [PGS]: n(6), [ESTUDOS]: n(40), [CAMPANHAS]: n(1) }, { pendentes: { [ASA]: n(90) } }),
  relatorio('sul', '2026-2', { [ESTUDOS]: n(5) }, { recusados: [PGS] }),
]

describe('os estados de um número', () => {
  it('zero informado, sem informação e sem relatório ficam separados; o que esperava confirmação vale', () => {
    const t2 = { ano: 2026, trimestre: 2 }
    expect(leituraDaIgreja(RELATORIOS, 'sul', PGS, { ano: 2026, trimestre: 1 })).toMatchObject({ situacao: 'informado', numero: 0 })
    expect(leituraDaIgreja(RELATORIOS, 'sul', ASA, t2)).toMatchObject({ situacao: 'nao_respondido', numero: null })
    expect(leituraDaIgreja(RELATORIOS, 'leste', PGS, t2)).toMatchObject({ situacao: 'sem_relatorio', numero: null })
    expect(leituraDaIgreja(RELATORIOS, 'norte', ASA, t2)).toMatchObject({ situacao: 'informado', numero: 90 })
    // O número recusado não foi guardado: não há o que mostrar, e não vira zero.
    expect(leituraDaIgreja(RELATORIOS, 'sul', PGS, t2)).toMatchObject({ situacao: 'nao_respondido', numero: null })
  })

  it('o distrito soma só o informado e conta cada estado', () => {
    expect(leituraDoDistrito(RELATORIOS, IGREJAS, ASA, { ano: 2026, trimestre: 2 })).toEqual({
      numero: 90, informaram: 1, naoResponderam: 1, semRelatorio: 1, trimestre: '2026-2',
    })
  })
})

describe('o que soma e o que atualiza', () => {
  it('no ano, estudos somam os trimestres; Pequenos Grupos valem o último trimestre informado', () => {
    const ano = { ano: 2026, trimestre: null }
    expect(leituraDaIgreja(RELATORIOS, 'norte', ESTUDOS, ano)).toMatchObject({ numero: 140 })
    expect(leituraDaIgreja(RELATORIOS, 'norte', PGS, ano)).toMatchObject({ numero: 6, trimestre: '2026-2' })
    expect(leituraDaIgreja(RELATORIOS, 'sul', PGS, ano)).toMatchObject({ numero: 0, trimestre: '2026-1' })
    expect(leituraDoDistrito(RELATORIOS, IGREJAS, PGS, ano).numero).toBe(6)
  })

  it('estudos gerais e ASA somam, incluindo o que esperava confirmação', () => {
    expect(estudosDoPeriodo(RELATORIOS, IGREJAS, { ano: 2026, trimestre: 1 })).toBe(130)
    expect(estudosDoPeriodo(RELATORIOS, IGREJAS, { ano: 2026, trimestre: 2 })).toBe(135)
    expect(estudosDoPeriodo(RELATORIOS, IGREJAS, { ano: 2026, trimestre: null })).toBe(265)
    expect(estudosDoPeriodo(RELATORIOS, IGREJAS, { ano: 2026, trimestre: 3 })).toBeNull()
  })

  it('a série trimestral não acumula, mesmo nos que somam', () => {
    expect(serieTrimestral(RELATORIOS, IGREJAS, ESTUDOS, 2026).map(({ numero }) => numero)).toEqual([110, 45, null, null])
  })
})

describe('comparação entre trimestres', () => {
  it('anterior, atual, diferença e porcentagem só com base', () => {
    expect(comparar(110, 45)).toEqual({ anterior: 110, atual: 45, diferenca: -65, percentual: -59.1, tendencia: 'queda' })
    expect(comparar(0, 4)).toMatchObject({ diferenca: 4, percentual: null, tendencia: 'alta' })
    expect(comparar(5, 5).tendencia).toBe('estavel')
    expect(comparar(null, 5).tendencia).toBe('sem_base')
  })

  it('no trimestre contra o anterior, atravessando o ano; no ano, entre os dois últimos com número', () => {
    expect(comparacaoDoPeriodo(RELATORIOS, IGREJAS, PGS, { ano: 2026, trimestre: 2 })).toMatchObject({ anterior: 5, atual: 6, de: '2026-1', para: '2026-2' })
    expect(comparacaoDoPeriodo(RELATORIOS, IGREJAS, PGS, { ano: 2026, trimestre: 1 })).toMatchObject({ anterior: null, de: '2025-4', tendencia: 'sem_base' })
    expect(comparacaoDoPeriodo(RELATORIOS, IGREJAS, ESTUDOS, { ano: 2026, trimestre: null })).toMatchObject({ anterior: 110, atual: 45, de: '2026-1', para: '2026-2' })
  })

  it('cada igreja com a própria comparação, e a contagem de indicadores em alta, queda e estáveis', () => {
    const desempenho = desempenhoDasIgrejas(RELATORIOS, IGREJAS, ESTUDOS, { ano: 2026, trimestre: 2 })
    expect(desempenho.map(({ churchId, comparacao }) => [churchId, comparacao.tendencia])).toEqual([['norte', 'queda'], ['sul', 'queda'], ['leste', 'sem_base']])
    const tendencias = tendenciasDosIndicadores(RELATORIOS, IGREJAS, [PGS, ESTUDOS, CAMPANHAS, UAS], { ano: 2026, trimestre: 2 })
    expect(tendencias).toEqual({ alta: [PGS], queda: [ESTUDOS, CAMPANHAS], estavel: [], sem_base: [UAS] })
  })
})

describe('possível erro de digitação', () => {
  const HISTORICO = [
    relatorio('norte', '2026-1', { [PGS]: n(5), [ESTUDOS]: n(100), [CAMPANHAS]: n(6), [ALUNOS]: n(4) }),
    relatorio('norte', '2026-2', { [PGS]: n(45), [ESTUDOS]: n(40), [CAMPANHAS]: n(0), [ALUNOS]: n(30) }),
  ]

  it('marca só a mudança extrema, e o número continua valendo', () => {
    expect(possivelErroNoValor(HISTORICO, 'norte', PGS, '2026-2')).toEqual({
      churchId: 'norte', trimestre: '2026-2', indicadorId: PGS, anterior: { trimestre: '2026-1', numero: 5 }, atual: 45,
    })
    expect(leituraDaIgreja(HISTORICO, 'norte', PGS, { ano: 2026, trimestre: 2 }).numero).toBe(45)
  })

  it('zero depois de um valor positivo e uma redução comum não recebem asterisco', () => {
    expect(possivelErroNoValor(HISTORICO, 'norte', CAMPANHAS, '2026-2')).toBeNull()
    expect(possivelErroNoValor(HISTORICO, 'norte', ESTUDOS, '2026-2')).toBeNull()
  })

  it('no período, lista todos os asteriscos; sem trimestre anterior não há comparação', () => {
    expect(possiveisErros(HISTORICO, ['norte'], { ano: 2026, trimestre: 2 }).map(({ indicadorId }) => indicadorId).sort()).toEqual([PGS, ALUNOS].sort())
    expect(possiveisErros(HISTORICO, ['norte'], { ano: 2026, trimestre: 1 })).toEqual([])
  })
})

describe('respostas, cobertura e histórico', () => {
  it('quem respondeu e quem não, por período', () => {
    expect(coberturaDoPeriodo(RELATORIOS, IGREJAS, { ano: 2026, trimestre: 2 })).toEqual({ responderam: ['norte', 'sul'], naoResponderam: ['leste'] })
    expect(coberturaDoPeriodo(RELATORIOS, IGREJAS, { ano: 2025, trimestre: null }).naoResponderam).toHaveLength(3)
  })

  it('respondeu, informação incompleta e sem relatório, com a conta de asteriscos', () => {
    const completo = { [ESTUDOS]: n(10), [PGS]: n(4), [UAS]: n(3), [ALUNOS]: n(20), [CAMPANHAS]: n(1) }
    const respostas = respostasDoAno([
      relatorio('norte', '2026-1', completo),
      relatorio('norte', '2026-2', { ...completo, [PGS]: n(40) }),
      relatorio('sul', '2026-1', { [ESTUDOS]: n(2) }),
    ], ['norte', 'sul'], 2026)
    expect(respostas[0]!.trimestres.map(({ situacao, possiveisErros: erros }) => [situacao, erros])).toEqual([['respondeu', 0], ['respondeu', 1], ['sem_relatorio', 0], ['sem_relatorio', 0]])
    expect(respostas[1]!.trimestres[0]).toMatchObject({ situacao: 'incompleto', faltando: [PGS, UAS, ALUNOS, CAMPANHAS] })
  })

  it('histórico por envio, do mais recente; anos com relatório', () => {
    expect(historicoDeEnvios(RELATORIOS).map(({ trimestre, igrejas }) => [trimestre, igrejas])).toEqual([['2026-2', 2], ['2026-1', 2]])
    expect(anosDosRelatorios(RELATORIOS, 2027)).toEqual([2027, 2026])
  })

  it('Escola Sabatina por faixa, com o total do relatório', () => {
    const porClasse: ValorDoIndicador = { tipo: 'por_classe', classes: { Adultos: 20, Jovens: 6, Adolescentes: 4, Primários: 3, Bebês: 1 }, total: 34 }
    const faixas = faixasDoIndicador([relatorio('norte', '2026-1', { [ALUNOS]: porClasse })], IGREJAS, ALUNOS, { ano: 2026, trimestre: 1 })
    expect(faixas?.total).toBe(34)
    expect(faixas?.faixas).toEqual([
      { rotulo: 'Adultos', numero: 20 }, { rotulo: 'Jovens', numero: 6 }, { rotulo: 'Adolescentes', numero: 4 },
      { rotulo: 'Crianças', numero: 4 }, { rotulo: 'Classes Bíblicas e filiais', numero: null },
    ])
  })

  it('nome curto na tela, sem chaves, parênteses nem o "Número de"', () => {
    expect(rotuloCurto({ id: PGS, rotulo: 'Número de Pequenos Grupos da igreja.' })).toBe('Pequenos Grupos')
    expect(rotuloCurto({ id: 'desconhecido', rotulo: 'Número de mulheres que concluíram o Curso de Liderança Feminina.' })).toBe('Mulheres que concluíram o Curso de Liderança…')
    expect(rotuloCurto({ id: 'outro', rotulo: 'Quantas Feiras de Saúde foram realizadas? {Saúde}' })).toBe('Quantas Feiras de Saúde foram realizadas')
  })
})
