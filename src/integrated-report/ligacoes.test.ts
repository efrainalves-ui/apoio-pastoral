import { describe, expect, it } from 'vitest'
import type { EvangelismCampaignEntity } from '../evangelism/types'
import type { GoalEntryEntity } from '../goals/types'
import { quadroDeGrupos } from '../missionary/metasDeGrupos'
import { vigenteDoRelatorio } from '../missionary/useQuadroDeGrupos'
import { campanhasParaRegistrar, diferencasDeCadastro, PEQUENOS_GRUPOS, trimestresDesatualizados, UNIDADES_DE_ACAO } from './ligacoes'
import { lancamentosDoTrimestre } from './metas'
import type { RelatorioIntegradoEntity, ValorDoIndicador } from './types'

const ESTUDOS = 'ministerio-pessoal--numero-de-pessoas-recebendo-estudos-biblicos'
const CAMPANHAS = 'evangelismo--numero-de-campanhas-evangelisticas-em-geral'
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
    // O 2º trimestre ficou sem lançamento nas metas: é o único a refazer.
    expect(trimestresDesatualizados(relatorios, certo).map(({ trimestre }) => trimestre)).toEqual(['2026-2'])
    expect(trimestresDesatualizados(relatorios, [...certo, ...comoEntrada(relatorios, '2026-2')])).toEqual([])
    // Lançamento duplicado também diverge, e o trimestre é refeito com um só.
    expect(trimestresDesatualizados(relatorios, [...certo, ...certo, ...comoEntrada(relatorios, '2026-2')])).toMatchObject([{ trimestre: '2026-1', lancamentos: [{ amount: 120 }] }])
  })

  it('o valor confirmado depois muda o lançamento; lançamento manual não é tocado', () => {
    const antes = [relatorio('norte', '2026-1', { [ESTUDOS]: n(120) })]
    const depois = [relatorio('norte', '2026-1', { [ESTUDOS]: n(150) })]
    const manual: GoalEntryEntity = { id: 'm', churchId: 'norte', metric: 'bible_studies', date: '2026-02-01', amount: 7, source: 'manual', reference: 'Digitado', createdAt: '' }
    expect(trimestresDesatualizados(depois, [...comoEntrada(antes, '2026-1'), manual])).toMatchObject([{ trimestre: '2026-1', lancamentos: [{ amount: 150 }] }])
  })
})

describe('Escola Sabatina e Pequenos Grupos: fotografia do trimestre', () => {
  const relatorios = [
    relatorio('norte', '2026-1', { [PEQUENOS_GRUPOS]: n(4), [UNIDADES_DE_ACAO]: { tipo: 'por_classe', classes: {}, total: 7 } }),
    relatorio('norte', '2026-2', { [PEQUENOS_GRUPOS]: n(6) }),
  ]

  it('o alcançado é o último trimestre confirmado, sem somar trimestres nem somar com o cadastro', () => {
    const quadro = quadroDeGrupos([{ id: 'norte', name: 'Norte' }, { id: 'sul', name: 'Sul' }], [], [{ churchId: 'norte' }], [{ churchId: 'sul', active: true }], [], vigenteDoRelatorio(relatorios, 2026))
    expect(quadro.igrejas[0]).toMatchObject({ pequenosGrupos: 6, trimestrePequenosGrupos: '2026-2', escolaSabatina: 7, trimestreEscolaSabatina: '2026-1', cadastroEscolaSabatina: 1, cadastroPequenosGrupos: 0 })
    // Igreja sem relatório no ano segue pelo cadastro.
    expect(quadro.igrejas[1]).toMatchObject({ pequenosGrupos: 1, trimestrePequenosGrupos: null })
    expect(quadro.distrito).toMatchObject({ pequenosGrupos: 7, cadastroPequenosGrupos: 1 })
  })

  it('a diferença para o cadastro vira pendência, até ser conferida com os mesmos números', () => {
    const cadastro = () => ({ unidades: 7, pequenosGrupos: 2 })
    expect(diferencasDeCadastro(relatorios, ['norte'], 2026, cadastro)).toMatchObject([{ indicadorId: PEQUENOS_GRUPOS, relatorio: 6, cadastro: 2, trimestre: '2026-2', conferida: false }])
    const conferido = [relatorios[0]!, { ...relatorios[1]!, conferencias: { [PEQUENOS_GRUPOS]: { relatorio: 6, cadastro: 2, em: '' } } }]
    expect(diferencasDeCadastro(conferido, ['norte'], 2026, cadastro)[0]?.conferida).toBe(true)
    expect(diferencasDeCadastro(conferido, ['norte'], 2026, () => ({ unidades: 7, pequenosGrupos: 3 }))[0]?.conferida).toBe(false)
  })
})

describe('campanhas para registrar no Evangelismo', () => {
  const campanha = (extra: Partial<EvangelismCampaignEntity>): EvangelismCampaignEntity => ({ id: crypto.randomUUID(), churchIds: ['norte'], status: 'completed', startDate: '2026-02-10', endDate: '2026-02-12', ...extra } as EvangelismCampaignEntity)

  it('relatório 3, cadastradas 1, faltam 2; as criadas a partir do relatório contam, mesmo sem data', () => {
    const relatorios = [relatorio('norte', '2026-1', { [CAMPANHAS]: n(3) })]
    expect(campanhasParaRegistrar(relatorios, [campanha({})], 2026)).toEqual([{ relatorioId: 'norte-2026-1', churchId: 'norte', trimestre: '2026-1', declaradas: 3, cadastradas: 1, faltam: 2 }])
    const rascunhos = [1, 2].map((indice) => campanha({ startDate: '', endDate: '', status: 'planning', aCompletar: true, origemRelatorio: { relatorioId: 'norte-2026-1', churchId: 'norte', trimestre: '2026-1', indice } }))
    expect(campanhasParaRegistrar(relatorios, [campanha({}), ...rascunhos], 2026)[0]).toMatchObject({ cadastradas: 3, faltam: 0 })
  })
})
