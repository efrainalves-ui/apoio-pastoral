import { describe, expect, it } from 'vitest'
import { CATALOGO_DO_RELATORIO, CLASSES_DA_ESCOLA_SABATINA } from './catalogo'
import { numeroDoValor, valorAtual } from './service'
import type { RelatorioIntegradoEntity, ValorDoIndicador } from './types'

type ValorPorClasse = Extract<ValorDoIndicador, { tipo: 'por_classe' }>

const ALUNOS = 'escola-sabatina--numero-de-alunos-da-escola-sabatina'
const PROFESSORES = 'escola-sabatina--numero-de-professores-em-cada-classe'

const porClasse = (classes: ValorPorClasse['classes'], total: number): ValorDoIndicador =>
  ({ tipo: 'por_classe', classes, total })

const relatorio = (churchId: string, trimestre: string, valores: Record<string, ValorDoIndicador>): RelatorioIntegradoEntity => ({
  id: crypto.randomUUID(), churchId, trimestre, valores,
  origem: { arquivo: 'x.pdf', paginas: [1] }, importBatchId: '', createdAt: '', updatedAt: '',
})

/*
  As onze categorias do relatório. Elas são a estrutura da Escola Sabatina, e
  misturar uma na outra apaga justamente a informação que o pastor usa para
  decidir onde faltam professores.
*/
describe('as categorias da Escola Sabatina', () => {
  it('são as dez classes mais o total, na ordem do relatório', () => {
    expect(CLASSES_DA_ESCOLA_SABATINA).toEqual([
      'Bebês', 'Iniciantes', 'Infantis', 'Primários', 'Pré-Adolescentes',
      'Adolescentes', 'Jovens', 'Adultos', 'Classes Bíblicas', 'Filiais',
    ])
  })

  it('cada número fica na sua categoria, e nenhuma entra em outra', () => {
    const valor = porClasse({ Bebês: 0, Iniciantes: 2, Infantis: 4, Primários: 4, 'Pré-Adolescentes': 3,
      Adolescentes: 6, Jovens: 6, Adultos: 9, 'Classes Bíblicas': 2, Filiais: 2 }, 38)
    const relatorios = [relatorio('igreja-a', '2026-1', { [ALUNOS]: valor })]
    const guardado = relatorios[0]!.valores[ALUNOS]
    expect(guardado?.tipo).toBe('por_classe')
    if (guardado?.tipo === 'por_classe') {
      expect(guardado.classes.Adultos).toBe(9)
      expect(guardado.classes.Bebês).toBe(0)
      expect(guardado.classes['Pré-Adolescentes']).toBe(3)
      expect(guardado.classes.Jovens).toBe(6)
      // A soma das categorias confere com o total.
      expect(Object.values(guardado.classes).reduce((soma, n) => soma + n, 0)).toBe(guardado.total)
    }
  })

  it('o valor fica preso à igreja e ao trimestre', () => {
    const relatorios = [
      relatorio('igreja-a', '2026-1', { [ALUNOS]: porClasse({ Adultos: 9 }, 9) }),
      relatorio('igreja-b', '2026-1', { [ALUNOS]: porClasse({ Adultos: 4 }, 4) }),
      relatorio('igreja-a', '2026-2', { [ALUNOS]: porClasse({ Adultos: 11 }, 11) }),
    ]
    expect(numeroDoValor(valorAtual(relatorios, 'igreja-a', ALUNOS)?.valor)).toBe(11)
    expect(numeroDoValor(valorAtual(relatorios, 'igreja-b', ALUNOS)?.valor)).toBe(4)
  })

  /* Um trimestre sem resposta não apaga o anterior — e a leitura diz de quando é. */
  it('trimestre ausente não apaga o anterior, e o histórico continua', () => {
    const relatorios = [
      relatorio('igreja-a', '2026-1', { [PROFESSORES]: porClasse({ Adultos: 2 }, 9) }),
      relatorio('igreja-a', '2026-2', {}),
    ]
    const leitura = valorAtual(relatorios, 'igreja-a', PROFESSORES)
    expect(leitura?.trimestre).toBe('2026-1')
    expect(numeroDoValor(leitura?.valor)).toBe(9)
    // O registro do 1º trimestre continua existindo, inteiro.
    expect(relatorios[0]!.valores[PROFESSORES]).toBeDefined()
  })

  it('zero informado numa categoria é zero, e não ausência', () => {
    const valor = porClasse({ Bebês: 0, Adultos: 9 }, 9)
    if (valor.tipo === 'por_classe') {
      expect(valor.classes.Bebês).toBe(0)
      expect('Bebês' in valor.classes).toBe(true)
      expect('Jovens' in valor.classes).toBe(false)
    }
  })

  /*
    O relatório traz contagem; o aplicativo guarda classe como gente, com nome.
    Um número não pode virar professor nem aluno inventado.
  */
  it('a contagem do relatório não cria pessoa, professor nem classe', () => {
    const relatorios = [relatorio('igreja-a', '2026-1', { [ALUNOS]: porClasse({ Adultos: 38 }, 38) })]
    const guardado = JSON.stringify(relatorios[0])
    expect(guardado).not.toContain('teacherId')
    expect(guardado).not.toContain('participantIds')
    expect(guardado).not.toContain('personId')
  })

  it('os indicadores por classe são exatamente os que o relatório quebra', () => {
    const porClasseNoCatalogo = CATALOGO_DO_RELATORIO.filter(({ formato }) => formato === 'por_classe')
    expect(porClasseNoCatalogo.length).toBeGreaterThan(0)
    for (const indicador of porClasseNoCatalogo) {
      expect(indicador.tratamento).toBe('atualizar')
      expect(/batism/iu.test(indicador.rotulo)).toBe(false)
    }
  })
})
