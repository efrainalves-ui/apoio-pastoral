import { describe, expect, it } from 'vitest'
import { ehRelatorioDeClasses, parseClassesDaEscolaSabatina } from './escolaSabatina'

const relatorio = [
  'Associação Fictícia',
  'Relatório de Classes ES Central Fictícia de Curuçá I - Sede Anpa',
  'Tipo: Classes por Membro',
  'Membros Unidade',
  'Pessoa Uma Fictícia 5 - Atos 11:26',
  'Pessoa Duas Fictícia 5 - Atos 11:26',
  'Pessoa Duas Fictícia 5 - Atos 11:26',
  'Pessoa Três Fictícia 8 - Maranata Class/Jovens',
  '07/09/2026 09:04:44 Pastor Fictício Página 1 de 2',
  'Total de Membros : 3 Total de unidades : 2',
].join('\n')

describe('o relatório de Classes ES', () => {
  it('é reconhecido pelo cabeçalho', () => {
    expect(ehRelatorioDeClasses(relatorio)).toBe(true)
    expect(ehRelatorioDeClasses('Comparativo de Entradas')).toBe(false)
  })

  it('tira o número que o ACMS põe antes do nome da unidade', () => {
    // "8 - Maranata Class/Jovens" é ordem de página, não nome: guardá-lo faria a
    // unidade mudar de nome quando outra fosse criada antes dela.
    const lido = parseClassesDaEscolaSabatina(relatorio)

    expect(lido.unidades.map(({ nome }) => nome)).toEqual(['Atos 11:26', 'Maranata Class/Jovens'])
  })

  it('lê a igreja do cabeçalho, sem o sufixo da associação', () => {
    expect(parseClassesDaEscolaSabatina(relatorio).igreja).toBe('Central Fictícia de Curuçá I')
  })

  it('não conta duas vezes quem aparece repetido', () => {
    // Acontece no relatório real, e contar duplicado inflaria a unidade sem que
    // ninguém entendesse de onde veio a pessoa a mais.
    const lido = parseClassesDaEscolaSabatina(relatorio)

    expect(lido.unidades[0]!.membros).toEqual(['Pessoa Uma Fictícia', 'Pessoa Duas Fictícia'])
  })

  it('ignora cabeçalhos, rodapés e a linha de totais', () => {
    const lido = parseClassesDaEscolaSabatina(relatorio)

    expect(lido.unidades).toHaveLength(2)
    expect(lido.unidades.reduce((total, { membros }) => total + membros.length, 0)).toBe(3)
  })
})
