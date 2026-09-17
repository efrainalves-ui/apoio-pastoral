import { describe, expect, it } from 'vitest'
import type { EvangelismCampaignEntity } from '../evangelism/types'
import type { GoalEntryEntity } from '../goals/types'
import { quadroDeGrupos, trimestreDoQuadro } from '../missionary/metasDeGrupos'
import { campanhasSemNome, nomeDaCampanhaDoRelatorio } from './campanhas'
import {
  acoesPorIgreja, cadastrosParaCompletar, campanhasParaRegistrar, DUPLAS_MISSIONARIAS, PEQUENOS_GRUPOS, trimestresDesatualizados, UNIDADES_DE_ACAO,
} from './ligacoes'
import { lancamentosDoTrimestre } from './metas'
import type { RelatorioIntegradoEntity, ValorDoIndicador } from './types'

const ESTUDOS = 'ministerio-pessoal--numero-de-pessoas-recebendo-estudos-biblicos'
const CAMPANHAS = 'evangelismo--numero-de-campanhas-evangelisticas-em-geral'
const SEMANA_SANTA = 'ministerio-pessoal--total-de-amigos-presentes-na-semana-santa'
const n = (valor: number): ValorDoIndicador => ({ tipo: 'numero', valor })

function relatorio(churchId: string, trimestre: string, valores: Record<string, ValorDoIndicador>, extra: Partial<RelatorioIntegradoEntity> = {}): RelatorioIntegradoEntity {
  return { id: `${churchId}-${trimestre}`, churchId, trimestre, valores, origem: { arquivo: 'ficticio.pdf', paginas: [1] }, importBatchId: 'lote', createdAt: '', updatedAt: '', ...extra }
}

const comoEntrada = (relatorios: RelatorioIntegradoEntity[], trimestre: string): GoalEntryEntity[] =>
  lancamentosDoTrimestre(relatorios, trimestre).map((item) => ({ ...item, id: crypto.randomUUID(), source: 'pdf', createdAt: '' }))

describe('o relatório já importado, recalculado sem duplicar', () => {
  it('só o trimestre que diverge é regravado; depois de regravado, nada mais', () => {
    const relatorios = [relatorio('norte', '2026-1', { [ESTUDOS]: n(120) }), relatorio('norte', '2026-2', { [ESTUDOS]: n(30) })]
    const certo = comoEntrada(relatorios, '2026-1')
    expect(trimestresDesatualizados(relatorios, certo).map(({ trimestre }) => trimestre)).toEqual(['2026-2'])
    expect(trimestresDesatualizados(relatorios, [...certo, ...comoEntrada(relatorios, '2026-2')])).toEqual([])
    expect(trimestresDesatualizados(relatorios, [...certo, ...certo, ...comoEntrada(relatorios, '2026-2')])).toMatchObject([{ trimestre: '2026-1', lancamentos: [{ amount: 120 }] }])
  })

  it('o valor que esperava confirmação passa a entrar na meta; lançamento manual não é tocado', () => {
    const antes = [relatorio('norte', '2026-1', { [ESTUDOS]: n(120) })]
    const guardado = [relatorio('norte', '2026-1', {}, { pendentes: { [ESTUDOS]: n(150) } })]
    const manual: GoalEntryEntity = { id: 'm', churchId: 'norte', metric: 'bible_studies', date: '2026-02-01', amount: 7, source: 'manual', reference: 'Digitado', createdAt: '' }
    expect(trimestresDesatualizados(guardado, [...comoEntrada(antes, '2026-1'), manual])).toMatchObject([{ trimestre: '2026-1', lancamentos: [{ amount: 150 }] }])
  })
})

describe('Escola Sabatina e Pequenos Grupos: fotografia do trimestre', () => {
  const relatorios = [
    relatorio('norte', '2026-1', { [PEQUENOS_GRUPOS]: n(4), [UNIDADES_DE_ACAO]: { tipo: 'por_classe', classes: {}, total: 7 } }),
    relatorio('norte', '2026-2', { [PEQUENOS_GRUPOS]: n(6), [DUPLAS_MISSIONARIAS]: n(3) }),
  ]

  it('o alcançado é o trimestre do quadro, sem somar trimestres nem somar com o cadastro', () => {
    const igrejas = [{ id: 'norte', name: 'Norte' }, { id: 'sul', name: 'Sul' }]
    const quadro = quadroDeGrupos(igrejas, [], [{ churchId: 'norte' }], [{ churchId: 'sul', active: true }], [], relatorios, trimestreDoQuadro(relatorios, ['norte', 'sul']))
    expect(quadro.trimestre).toBe('2026-2')
    expect(quadro.igrejas[0]).toMatchObject({ pequenosGrupos: { numero: 6, origem: 'relatorio', cadastro: 0 }, escolaSabatina: { numero: null, origem: 'sem_informacao', cadastro: 1 } })
    expect(quadro.igrejas[1]).toMatchObject({ pequenosGrupos: { numero: null, origem: 'sem_informacao', cadastro: 1 } })
  })

  it('só o que o relatório informa a mais vira cadastro para completar, com a igreja já escolhida', () => {
    const cadastros = cadastrosParaCompletar(relatorios, ['norte'], 2026, () => ({ unidades: 7, pequenosGrupos: 2, duplas: 1 }))
    expect(cadastros).toEqual([
      { churchId: 'norte', indicadorId: PEQUENOS_GRUPOS, rotulo: 'Pequenos Grupos', trimestre: '2026-2', relatorio: 6, cadastro: 2, faltam: 4, para: '/app/metas/uapg?igreja=norte' },
      { churchId: 'norte', indicadorId: DUPLAS_MISSIONARIAS, rotulo: 'Duplas missionárias', trimestre: '2026-2', relatorio: 3, cadastro: 1, faltam: 2, para: '/app/metas/missao/duplas?igreja=norte' },
    ])
    // Cadastro igual ou maior que o relatório não pede nada.
    expect(cadastrosParaCompletar(relatorios, ['norte'], 2026, () => ({ unidades: 9, pequenosGrupos: 6, duplas: 3 }))).toEqual([])
  })
})

describe('campanhas informadas no relatório', () => {
  const campanha = (extra: Partial<EvangelismCampaignEntity>): EvangelismCampaignEntity => ({ id: crypto.randomUUID(), name: 'Campanha fictícia', objective: 'other', churchIds: ['norte'], status: 'completed', startDate: '2026-02-10', endDate: '2026-02-12', ...extra } as EvangelismCampaignEntity)

  it('relatório 3, cadastrada 1, faltam 2; as criadas a partir do relatório contam, mesmo sem data', () => {
    const relatorios = [relatorio('norte', '2026-1', { [CAMPANHAS]: n(3) })]
    expect(campanhasParaRegistrar(relatorios, [campanha({})], 2026)).toEqual([{ relatorioId: 'norte-2026-1', churchId: 'norte', trimestre: '2026-1', declaradas: 3, cadastradas: 1, faltam: 2, cadastradasSemOrigem: 1, semanaSanta: false }])
    const doRelatorio = [1, 2].map((indice) => campanha({ startDate: '', endDate: '', origemRelatorio: { relatorioId: 'norte-2026-1', churchId: 'norte', trimestre: '2026-1', indice } }))
    expect(campanhasParaRegistrar(relatorios, [campanha({}), ...doRelatorio], 2026)[0]).toMatchObject({ cadastradas: 3, faltam: 0, cadastradasSemOrigem: 1 })
  })

  it('Semana Santa informada e ainda não cadastrada dá o nome à primeira', () => {
    const relatorios = [relatorio('norte', '2026-2', { [CAMPANHAS]: n(2), [SEMANA_SANTA]: n(35) })]
    expect(campanhasParaRegistrar(relatorios, [], 2026)[0]?.semanaSanta).toBe(true)
    expect(campanhasParaRegistrar(relatorios, [campanha({ objective: 'holy_week', startDate: '2026-04-05', endDate: '2026-04-12' })], 2026)[0]?.semanaSanta).toBe(false)
  })

  it('o nome provisório: uma, várias e Semana Santa', () => {
    expect(nomeDaCampanhaDoRelatorio('Monte Sião', 1, 1, false)).toBe('Campanha — Monte Sião')
    expect([1, 2].map((indice) => nomeDaCampanhaDoRelatorio('Monte Sião', indice, 2, false))).toEqual(['Campanha 1 — Monte Sião', 'Campanha 2 — Monte Sião'])
    expect([1, 2].map((indice) => nomeDaCampanhaDoRelatorio('Monte Sião', indice, 2, true))).toEqual(['Semana Santa', 'Campanha 2 — Monte Sião'])
  })

  it('as criadas sem nome pelo botão antigo recebem o nome, sem criar outra', () => {
    const relatorios = [relatorio('norte', '2026-1', { [CAMPANHAS]: n(2) })]
    const antigas = [1, 2].map((indice) => campanha({ id: `antiga-${indice}`, name: '', status: 'planning', startDate: '', endDate: '', origemRelatorio: { relatorioId: 'norte-2026-1', churchId: 'norte', trimestre: '2026-1', indice } }))
    expect(campanhasSemNome([...antigas, campanha({ name: 'Já tem nome' })], relatorios, () => 'Monte Sião')).toEqual([
      { id: 'antiga-1', name: 'Campanha 1 — Monte Sião', objective: 'other' },
      { id: 'antiga-2', name: 'Campanha 2 — Monte Sião', objective: 'other' },
    ])
  })

  it('agrupa por igreja, com os totais, da que tem mais para completar à que tem menos', () => {
    const acoes = acoesPorIgreja(
      [{ relatorioId: 'r', churchId: 'sul', trimestre: '2026-1', declaradas: 1, cadastradas: 0, faltam: 1, cadastradasSemOrigem: 0, semanaSanta: false },
        { relatorioId: 'r2', churchId: 'norte', trimestre: '2026-1', declaradas: 1, cadastradas: 1, faltam: 0, cadastradasSemOrigem: 1, semanaSanta: false }],
      [{ churchId: 'norte', indicadorId: PEQUENOS_GRUPOS, rotulo: 'Pequenos Grupos', trimestre: '2026-1', relatorio: 5, cadastro: 2, faltam: 3, para: '' }],
    )
    expect(acoes.map(({ churchId, campanhasFaltando, cadastrosFaltando, campanhas }) => [churchId, campanhasFaltando, cadastrosFaltando, campanhas.length])).toEqual([['norte', 0, 3, 0], ['sul', 1, 0, 1]])
  })
})
