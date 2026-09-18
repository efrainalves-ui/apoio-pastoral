import { describe, expect, it } from 'vitest'
import type { RelatorioIntegradoEntity } from '../integrated-report/types'
import { metaDeGrupos, quadroDeGrupos, trimestreDoQuadro, trimestresComRelatorio } from './metasDeGrupos'

describe('a meta de um para cada doze membros', () => {
  it('cento e vinte membros pedem dez', () => {
    expect(metaDeGrupos(120)).toBe(10)
  })

  it('arredonda para cima, porque a regra é de cobertura', () => {
    // Os treze membros não cabem num grupo só, e deixar o décimo terceiro de
    // fora é o que a meta existe para evitar.
    expect(metaDeGrupos(13)).toBe(2)
    expect(metaDeGrupos(1)).toBe(1)
    expect(metaDeGrupos(0)).toBe(0)
  })
})

const igrejas = [{ id: 'a', name: 'Igreja A Fictícia' }, { id: 'b', name: 'Igreja B Fictícia' }]
const membrosDe = (churchId: string, quantos: number) => Array.from({ length: quantos }, () => ({ currentChurchId: churchId }))
const pessoas = [...membrosDe('a', 120), ...membrosDe('b', 13)]

describe('o quadro de grupos do distrito', () => {
  it('conta membros, meta e alcançado por igreja', () => {
    const quadro = quadroDeGrupos(
      igrejas, pessoas,
      [{ churchId: 'a' }, { churchId: 'a' }, { churchId: 'b' }],
      [{ churchId: 'a', active: true }, { churchId: 'a', active: false }],
      [{ churchId: 'b', active: true }],
    )

    expect(quadro.igrejas[0]).toMatchObject({ nome: 'Igreja A Fictícia', membros: 120, meta: 10, escolaSabatina: { numero: 2 }, pequenosGrupos: { numero: 1 }, integracoes: { numero: null } })
    expect(quadro.igrejas[1]).toMatchObject({ membros: 13, meta: 2, escolaSabatina: { numero: 1 }, pequenosGrupos: { numero: null }, integracoes: { numero: 1 } })
  })

  it('a meta do distrito é a soma das metas, não a meta da soma', () => {
    // Somar os membros primeiro daria 133 → 12, escondendo a igreja pequena
    // dentro da grande: ela precisa dos seus dois grupos de qualquer forma.
    const quadro = quadroDeGrupos(igrejas, pessoas, [], [], [])

    expect(quadro.distrito.membros).toBe(133)
    expect(quadro.distrito.meta).toBe(12)
  })

  it('grupo desativado não conta como alcançado', () => {
    const quadro = quadroDeGrupos([igrejas[0]!], pessoas, [], [{ churchId: 'a', active: false }], [])

    expect(quadro.distrito.pequenosGrupos).toEqual({ numero: null, semInformacao: 1, cadastro: 0 })
  })
})

describe('Escola Sabatina e Pequenos Grupos vindos do Relatório Integrado', () => {
  const UNIDADES = 'escola-sabatina--numero-de-unidades-de-acao'
  const PGS = 'escola-sabatina--numero-de-pequenos-grupos-da-igreja'
  const relatorio = (churchId: string, trimestre: string, unidades: number | null, pgs: number | null): RelatorioIntegradoEntity => ({
    id: `${churchId}-${trimestre}`, churchId, trimestre, origem: { arquivo: 'ficticio.pdf', paginas: [1] }, importBatchId: 'lote', createdAt: '', updatedAt: '',
    valores: {
      ...(unidades === null ? {} : { [UNIDADES]: { tipo: 'por_classe', classes: {}, total: unidades } }),
      ...(pgs === null ? {} : { [PGS]: { tipo: 'numero', valor: pgs } }),
    },
  })

  const distrito = [
    { id: 'alfa', name: 'Alfa Fictícia' }, { id: 'beta', name: 'Beta Fictícia' },
    { id: 'zero', name: 'Zero Fictícia' }, { id: 'ausente', name: 'Ausente Fictícia' },
  ]
  const ids = distrito.map(({ id }) => id)
  const membros = [...membrosDe('alfa', 60), ...membrosDe('beta', 24), ...membrosDe('zero', 12), ...membrosDe('ausente', 36)]
  const relatorios = [
    relatorio('alfa', '2026-1', 3, 2),
    relatorio('alfa', '2026-2', 5, 4),
    relatorio('beta', '2026-2', 2, 1),
    relatorio('zero', '2026-2', 0, 0),
    // A ausente só enviou o trimestre anterior: no 2º ela não tem informação.
    relatorio('ausente', '2026-1', 9, 9),
    // Relatório de igreja de fora do distrito não escolhe trimestre nem entra na soma.
    relatorio('outra', '2026-3', 50, 50),
  ]
  // Cadastro manual: Alfa tem 5 classes (igual ao relatório) e 1 PG (diverge);
  // a ausente tem 2 classes guardadas.
  const classes = [...Array.from({ length: 5 }, () => ({ churchId: 'alfa' })), { churchId: 'ausente' }, { churchId: 'ausente' }]
  const grupos = [{ churchId: 'alfa', active: true }]
  const trimestre = trimestreDoQuadro(relatorios, ids)
  const quadro = quadroDeGrupos(distrito, membros, classes, grupos, [], relatorios, trimestre)
  const da = (id: string) => quadro.igrejas.find(({ churchId }) => churchId === id)!

  it('o trimestre padrão é o mais recente do distrito, e um trimestre escolhido vale se tiver relatório', () => {
    expect(trimestre).toBe('2026-2')
    expect(trimestresComRelatorio(relatorios, ids)).toEqual(['2026-2', '2026-1'])
    expect(trimestreDoQuadro(relatorios, ids, '2026-1')).toBe('2026-1')
    expect(trimestreDoQuadro(relatorios, ids, '2026-4')).toBe('2026-2')
  })

  it('cada igreja recebe o próprio número, do próprio relatório', () => {
    expect(da('alfa').escolaSabatina).toMatchObject({ numero: 5, origem: 'relatorio' })
    expect(da('alfa').pequenosGrupos).toMatchObject({ numero: 4, origem: 'relatorio' })
    expect(da('beta').escolaSabatina).toMatchObject({ numero: 2, origem: 'relatorio' })
    expect(da('beta').pequenosGrupos).toMatchObject({ numero: 1, origem: 'relatorio' })
  })

  it('zero informado é zero; igreja sem relatório no trimestre fica sem informação, não zero', () => {
    expect(da('zero').escolaSabatina).toEqual({ numero: 0, origem: 'relatorio', cadastro: 0, divergente: false })
    expect(da('zero').pequenosGrupos).toEqual({ numero: 0, origem: 'relatorio', cadastro: 0, divergente: false })
    // O relatório antigo não é puxado, e o cadastro guardado não vira alcançado.
    expect(da('ausente').escolaSabatina).toEqual({ numero: null, origem: 'sem_informacao', cadastro: 2, divergente: false })
    expect(da('ausente').pequenosGrupos).toEqual({ numero: null, origem: 'sem_informacao', cadastro: 0, divergente: false })
  })

  it('relatório e cadastro não somam; a diferença fica marcada para conferir', () => {
    expect(da('alfa').escolaSabatina).toEqual({ numero: 5, origem: 'relatorio', cadastro: 5, divergente: false })
    expect(da('alfa').pequenosGrupos).toEqual({ numero: 4, origem: 'relatorio', cadastro: 1, divergente: true })
  })

  it('o total do distrito soma só o mesmo trimestre e conta quem ficou sem informação', () => {
    expect(quadro.distrito.escolaSabatina).toEqual({ numero: 7, semInformacao: 1, cadastro: 7 })
    expect(quadro.distrito.pequenosGrupos).toEqual({ numero: 5, semInformacao: 1, cadastro: 1 })
    expect(quadro.distrito.meta).toBe(5 + 2 + 1 + 3)
  })

  it('outro trimestre escolhido muda os números de todas as igrejas juntas', () => {
    const primeiro = quadroDeGrupos(distrito, membros, classes, grupos, [], relatorios, '2026-1')
    expect(primeiro.igrejas.map(({ escolaSabatina }) => escolaSabatina.numero)).toEqual([3, null, null, 9])
    expect(primeiro.distrito.escolaSabatina).toMatchObject({ numero: 12, semInformacao: 2 })
  })

  it('a integração não sai do relatório: só do cadastro, ou sem informação', () => {
    const comIntegracao = quadroDeGrupos(distrito, membros, classes, grupos, [{ churchId: 'beta', active: true }], relatorios, trimestre)
    expect(comIntegracao.igrejas.find(({ churchId }) => churchId === 'beta')!.integracoes).toEqual({ numero: 1, origem: 'cadastro', cadastro: 1, divergente: false })
    expect(comIntegracao.igrejas.find(({ churchId }) => churchId === 'alfa')!.integracoes).toEqual({ numero: null, origem: 'sem_informacao', cadastro: 0, divergente: false })
    expect(comIntegracao.distrito.integracoes).toEqual({ numero: 1, semInformacao: 3, cadastro: 1 })
  })

  it('sem nenhum relatório, vale o cadastro, e cadastro vazio é sem informação', () => {
    const semRelatorio = quadroDeGrupos(distrito, membros, classes, grupos, [], [], trimestreDoQuadro([], ids))
    expect(semRelatorio.trimestre).toBeNull()
    expect(semRelatorio.igrejas[0]!.escolaSabatina).toEqual({ numero: 5, origem: 'cadastro', cadastro: 5, divergente: false })
    expect(semRelatorio.igrejas[1]!.escolaSabatina).toEqual({ numero: null, origem: 'sem_informacao', cadastro: 0, divergente: false })
  })
})
