import { describe, expect, it } from 'vitest'
import rotasDoAplicativo from './App.tsx?raw'

const paginas: Record<string, string> = import.meta.glob('../pages/*.tsx', { query: '?raw', import: 'default', eager: true })

function nomeDoArquivo(caminho: string): string {
  return caminho.slice(caminho.lastIndexOf('/') + 1)
}

/** Só interessa o que o pastor consegue abrir: uma tela sem rota nunca aparece. */
function paginasAlcancaveis(): [string, string][] {
  return Object.entries(paginas)
    .map(([caminho, conteudo]) => [nomeDoArquivo(caminho), conteudo] as [string, string])
    .filter(([nome]) => !nome.includes('.test.') && rotasDoAplicativo.includes(nome.replace('.tsx', '')))
}

describe('completude do que o aplicativo promete', () => {
  // Uma tela que anuncia "em breve" para algo que já existe manda o pastor
  // esperar por uma função que ele já poderia estar usando, e não oferece
  // caminho nenhum para chegar até ela.
  it('não promete funcionalidade futura em nenhuma tela alcançável', () => {
    const promessas = paginasAlcancaveis()
      .filter(([, conteudo]) => /em breve|serão implantad|em construção|escopo protegido/iu.test(conteudo))
      .map(([nome]) => nome)

    expect(promessas).toEqual([])
  })

  it('mantém todas as áreas do produto com rota própria', () => {
    const areas = [
      'agenda', 'distrito', 'pessoas', 'familias', 'aniversarios',
      'visitacao', 'sermoes', 'fidelidade', 'leitura', 'orcamento',
      'comissoes', 'comissoes/nomeacoes', 'evangelismo', 'planejamento', 'relatorios',
      'backup', 'sincronizacao', 'seguranca',
    ]

    expect(areas.filter((area) => !rotasDoAplicativo.includes(`path="${area}"`))).toEqual([])
  })
})
