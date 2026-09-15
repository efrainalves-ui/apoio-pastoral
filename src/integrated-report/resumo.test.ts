import { describe, expect, it } from 'vitest'
import { INDICADORES_DA_ESCOLA_SABATINA, areaDaLinhaDaEscolaSabatina, arquivoEhPdf, coberturaDoTrimestre, estudosDoTrimestre, linhasDaEscolaSabatina, ultimoTrimestre } from './resumo'
import type { RelatorioIntegradoEntity, ValorDoIndicador } from './types'

const GERAL = 'ministerio-pessoal--numero-de-pessoas-recebendo-estudos-biblicos'
const ASA = 'acao-solidaria-adventista--numero-de-pessoas-recebendo-estudos-biblicos-pela-asa'
const PGS = 'escola-sabatina--numero-de-pequenos-grupos-da-igreja'
const ALUNOS = 'escola-sabatina--numero-de-alunos-da-escola-sabatina'

function relatorio(churchId: string, trimestre: string, valores: Record<string, ValorDoIndicador>): RelatorioIntegradoEntity {
  return { id: `${churchId}-${trimestre}`, churchId, trimestre, valores, origem: { arquivo: 'ficticio.pdf', paginas: [1] }, importBatchId: 'lote', createdAt: '', updatedAt: '' }
}
const numero = (valor: number): ValorDoIndicador => ({ tipo: 'numero', valor })

describe('resumo do Relatório Integrado para as outras telas', () => {
  const relatorios = [
    relatorio('norte', '2026-1', { [GERAL]: numero(10), [ASA]: numero(2), [PGS]: numero(5) }),
    relatorio('norte', '2026-2', { [GERAL]: numero(12), [ASA]: numero(3), [ALUNOS]: { tipo: 'por_classe', total: 40, classes: { Bebês: 2, Primários: 4, Adolescentes: 6, Jovens: 8, Adultos: 20 } } }),
    relatorio('sul', '2026-1', { [GERAL]: numero(7) }),
  ]

  it('último trimestre, igrejas que responderam e as que não responderam — sem zerar ninguém', () => {
    expect(ultimoTrimestre(relatorios)).toBe('2026-2')
    expect(ultimoTrimestre([])).toBeNull()
    expect(coberturaDoTrimestre(relatorios, '2026-2', ['norte', 'sul', 'leste'])).toEqual({ responderam: 1, semRelatorio: 2 })
  })

  it('estudos do trimestre somam os gerais e os da ASA; trimestre sem informação é nulo, não zero', () => {
    expect(estudosDoTrimestre(relatorios, '2026-2')).toBe(15)
    expect(estudosDoTrimestre(relatorios, '2026-1')).toBe(19)
    expect(estudosDoTrimestre(relatorios, '2025-4')).toBeNull()
  })

  it('Escola Sabatina: cadastro e relatório em colunas separadas; o valor mais recente de cada igreja; faixas por classe', () => {
    const linhas = Object.fromEntries(linhasDaEscolaSabatina(relatorios, ['norte', 'sul'], { classes: 9, pequenosGrupos: 3 }).map((linha) => [linha.rotulo, linha]))
    expect(linhas['Pequenos Grupos']).toEqual({ rotulo: 'Pequenos Grupos', cadastro: 3, informado: 5 })
    expect(linhas['Classes (Unidades de Ação)']).toMatchObject({ cadastro: 9, informado: null })
    expect(linhas.Alunos).toMatchObject({ cadastro: null, informado: 40 })
    expect(linhas['Alunos dos departamentos infantis']!.informado).toBe(6)
    expect(linhas['Alunos adolescentes']!.informado).toBe(6)
    expect(linhas['Alunos jovens']!.informado).toBe(8)
    expect(linhas.Professores!.informado).toBeNull()
  })

  it('só PDF: Word, planilha e imagem pedem conversão', () => {
    expect(arquivoEhPdf({ name: 'Relatorio.PDF', type: 'application/pdf' })).toBe(true)
    for (const [name, type] of [['relatorio.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'], ['relatorio.xlsx', ''], ['relatorio.jpg', 'image/jpeg'], ['relatorio.pdf', 'image/png']]) {
      expect(arquivoEhPdf({ name: name!, type: type! })).toBe(false)
    }
  })
})

describe('Escola Sabatina: a prioridade de cada informação', () => {
  it('reúne as quatro áreas, uma por linha, sem classificar a página inteira', () => {
    const areas = Object.fromEntries(INDICADORES_DA_ESCOLA_SABATINA.map(({ rotulo }) => [rotulo, areaDaLinhaDaEscolaSabatina(rotulo)]))
    expect(areas).toEqual({
      'Classes (Unidades de Ação)': 'discipleship',
      Alunos: 'identity',
      Professores: 'leadership',
      'Pessoas com a lição': 'identity',
      'Estudam a lição diariamente': 'identity',
      'Alunos dos departamentos infantis': 'new_generations',
      'Alunos adolescentes': 'new_generations',
      'Alunos jovens': 'new_generations',
      'Pequenos Grupos': 'discipleship',
    })
    expect(new Set(Object.values(areas))).toEqual(new Set(['identity', 'leadership', 'new_generations', 'discipleship']))
    expect(areaDaLinhaDaEscolaSabatina('Linha que não existe')).toBeNull()
  })
})
