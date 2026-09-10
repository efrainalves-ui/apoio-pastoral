import { describe, expect, it } from 'vitest'
import { emCentavos } from '../family-budget/dinheiro'
import {
  divergencias, jaExisteParaACompetencia, proventosPorSubcategoria, totaisDoContracheque,
  type Contracheque, type Rubrica,
} from './contracheque'

const rubrica = (overrides: Partial<Rubrica> = {}): Rubrica => ({
  codigo: '', descricao: '', tipo: 'provento', valor: 0, subcategoriaId: '', ...overrides,
})

/* Valores fictícios. Nenhum contracheque real entra aqui. */
const folha: Rubrica[] = [
  rubrica({ codigo: '001', descricao: 'Subsistência básica', tipo: 'provento', valor: emCentavos(5600), subcategoriaId: 'subsistencia_basica' }),
  rubrica({ codigo: '015', descricao: 'Auxílio combustível', tipo: 'provento', valor: emCentavos(400), subcategoriaId: 'combustivel' }),
  rubrica({ codigo: '101', descricao: 'Previdência', tipo: 'desconto', valor: emCentavos(600), subcategoriaId: 'previdencia' }),
  rubrica({ codigo: '900', descricao: 'Base de cálculo da previdência', tipo: 'informativa', valor: emCentavos(5600) }),
]

describe('totais do contracheque', () => {
  /*
    A base informativa mostra sobre que valor um cálculo incidiu. Somá-la ao
    líquido infla a renda do pastor com dinheiro que ele nunca recebeu — e ele
    planeja o mês em cima dela.
  */
  it('a base informativa fica fora do líquido', () => {
    const totais = totaisDoContracheque(folha)
    expect(totais.proventos).toBe(emCentavos(6000))
    expect(totais.descontos).toBe(emCentavos(600))
    expect(totais.liquido).toBe(emCentavos(5400))
    expect(totais.basesInformativas).toBe(emCentavos(5600))
  })

  it('a base informativa é somada à parte, e não sozinha em nenhum outro lugar', () => {
    const soInformativa = totaisDoContracheque([rubrica({ tipo: 'informativa', valor: emCentavos(9999) })])
    expect(soInformativa).toMatchObject({ proventos: 0, descontos: 0, liquido: 0, basesInformativas: emCentavos(9999) })
  })

  it('folha vazia dá zero, não erro', () => {
    expect(totaisDoContracheque([])).toMatchObject({ proventos: 0, descontos: 0, liquido: 0 })
  })
})

describe('conferência', () => {
  it('sem divergência quando o líquido bate', () => {
    expect(divergencias({ competencia: '2026-09', rubricas: folha }, { liquido: emCentavos(5400), subsistencia: emCentavos(5600) })).toEqual([])
  })

  it('aponta o líquido que não bate', () => {
    const achados = divergencias({ competencia: '2026-09', rubricas: folha }, { liquido: emCentavos(5000), subsistencia: null })
    expect(achados[0]).toMatchObject({ chave: 'liquido', grave: true })
    expect(achados[0]?.texto).toContain('400')
  })

  it('avisa quando nenhuma rubrica foi apontada como subsistência', () => {
    const semApontamento = folha.map((item) => ({ ...item, subcategoriaId: '' }))
    const achados = divergencias({ competencia: '2026-09', rubricas: semApontamento }, { liquido: null, subsistencia: emCentavos(5600) })
    expect(achados.some(({ chave }) => chave === 'subsistencia')).toBe(true)
  })

  it('aponta rubrica repetida', () => {
    const achados = divergencias(
      { competencia: '2026-09', rubricas: [...folha, rubrica({ codigo: '015', tipo: 'provento', valor: emCentavos(400) })] },
      { liquido: null, subsistencia: null },
    )
    expect(achados.some(({ chave }) => chave === 'repetida-015')).toBe(true)
  })

  it('documento sem rubrica nenhuma é grave', () => {
    expect(divergencias({ competencia: '2026-09', rubricas: [] }, { liquido: null, subsistencia: null })[0]).toMatchObject({ chave: 'vazio', grave: true })
  })
})

describe('duplicidade', () => {
  const guardados = [{ id: 'c1', competencia: '2026-08', dataDePagamento: '', origem: '', rubricas: [], conferido: true, observacao: '', createdAt: '', updatedAt: '' }] as Contracheque[]

  /*
    Reimportar o mês é comum. Gravar os dois dobraria a renda do mês em todo
    relatório, e a duplicata é o que ninguém percebe olhando uma tela por vez.
  */
  it('encontra o contracheque da mesma competência', () => {
    expect(jaExisteParaACompetencia(guardados, '2026-08')?.id).toBe('c1')
    expect(jaExisteParaACompetencia(guardados, '2026-09')).toBeNull()
  })
})

describe('proventos por subcategoria', () => {
  /*
    O que veio pela folha não pode entrar de novo como entrada digitada à mão.
  */
  it('agrupa só os proventos apontados', () => {
    const porItem = proventosPorSubcategoria(folha)
    expect(porItem.get('subsistencia_basica')).toBe(emCentavos(5600))
    expect(porItem.get('combustivel')).toBe(emCentavos(400))
    expect(porItem.has('previdencia')).toBe(false)
  })

  it('a base informativa não vira provento de nada', () => {
    expect(proventosPorSubcategoria([rubrica({ tipo: 'informativa', valor: emCentavos(5600), subcategoriaId: 'subsistencia_basica' })]).size).toBe(0)
  })
})
