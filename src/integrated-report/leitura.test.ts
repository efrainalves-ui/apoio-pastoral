import { describe, expect, it } from 'vitest'
import { normalizePdfLayout, type PdfLayoutItem, type PdfLayoutPage } from '../imports/pdf'
import { ehRelatorioIntegrado, lerRelatorioIntegrado } from './leitura'
import { numeroDoValor } from './service'

const PEQUENOS_GRUPOS = 'escola-sabatina--numero-de-pequenos-grupos-da-igreja'
const ALUNOS = 'escola-sabatina--numero-de-alunos-da-escola-sabatina'
const PRESENTES_ES = 'secretaria--numero-de-presentes-na-escola-sabatina'
const CLASSE_PROFESSORES = 'escola-sabatina--e-realizada-a-classe-de-professores'

const CLASSES = ['Bebês', 'Iniciantes', 'Infantis', 'Primários', 'Pré-Adolescentes', 'Adolescentes', 'Jovens', 'Adultos', 'Classes Bíblicas', 'Filiais', 'Total']

/*
  O relatório real põe cada igreja em três páginas, com o distrito, o título e o
  trimestre repetidos no alto de todas e o nome da igreja na quarta linha da
  primeira. Estas páginas reproduzem essa forma; os nomes e números, não.
*/
function pagina(numero: number, linhas: Array<string[]>, igreja?: string): PdfLayoutPage {
  const items: PdfLayoutItem[] = []
  let y = 800
  const escrever = (celulas: string[]) => {
    celulas.forEach((texto, coluna) => items.push({ text: texto, x: coluna === 0 ? 20 : 300 + coluna * 26, y }))
    y -= 18
  }
  escrever(['Distrito Fictício - Anpa'])
  escrever(['RELATORIO INTEGRADO'])
  escrever(['1 Trimestre-2026'])
  if (igreja) escrever([`${igreja} - Anpa`])
  linhas.forEach(escrever)
  escrever(['-', 'Usuário.Fictício', `PAGE: ${numero} of 3`])
  return { width: 595, height: 842, items, pagina: numero }
}

const igrejaCompleta = (nome: string, pgs: string) => [
  pagina(1, [
    ['Escola Sabatina'],
    ['É realizada a Classe de Professores?', 'Sim'],
    ['Número de Pequenos Grupos da igreja.', pgs],
    CLASSES,
    ['Número de alunos da Escola Sabatina.', '0', '2', '4', '4', '3', '6', '6', '9', '2', '2', '38'],
    ['Número de pessoas levadas ao batismo por influência da Unidade de ação/PG', '0', '0', '0', '0', '0', '1', '0', '1', '1', '1', '4'],
  ], nome),
  pagina(2, [['Secretaria'], ['Segundo Sábado', 'Sétimo Sábado'],
    ['Número de presentes na Escola Sabatina (todos os presentes inclusive os não batizados).', '20', '32']]),
  pagina(3, [['Evangelismo'], ['Número de Campanhas evangelísticas em geral.', '-']]),
]

describe('leitura do Relatório Integrado', () => {
  const texto = normalizePdfLayout(igrejaCompleta('Igreja Fictícia do Norte', '5'))

  it('reconhece o relatório e o trimestre', () => {
    expect(ehRelatorioIntegrado(texto)).toBe(true)
    expect(lerRelatorioIntegrado(texto).trimestre).toBe('2026-1')
  })

  it('agrupa por igreja e guarda as páginas de origem', () => {
    const [igreja] = lerRelatorioIntegrado(texto).igrejas
    expect(igreja?.nome).toBe('Igreja Fictícia do Norte')
    expect(igreja?.paginas).toContain(1)
  })

  it('lê o número, o sim e a quebra por classe', () => {
    const [igreja] = lerRelatorioIntegrado(texto).igrejas
    expect(numeroDoValor(igreja?.valores[PEQUENOS_GRUPOS])).toBe(5)
    expect(igreja?.valores[CLASSE_PROFESSORES]).toEqual({ tipo: 'sim_nao', valor: true })
    const alunos = igreja?.valores[ALUNOS]
    expect(alunos?.tipo).toBe('por_classe')
    if (alunos?.tipo === 'por_classe') {
      expect(alunos.total).toBe(38)
      expect(alunos.classes.Adultos).toBe(9)
      expect(alunos.classes['Pré-Adolescentes']).toBe(3)
      expect(alunos.classes.Bebês).toBe(0)
    }
  })

  /* "Segundo Sábado | Sétimo Sábado" é cabeçalho de coluna, não pergunta. */
  it('lê a quebra por sábado sem confundir o cabeçalho com pergunta', () => {
    const [igreja] = lerRelatorioIntegrado(texto).igrejas
    expect(igreja?.valores[PRESENTES_ES]).toEqual({ tipo: 'por_sabado', segundo: 20, setimo: 32 })
  })

  /* Traço é "ninguém informou". Virar zero esconderia a falta de resposta. */
  it('o traço fica como não informado e nunca como zero', () => {
    const [igreja] = lerRelatorioIntegrado(texto).igrejas
    expect(igreja?.valores['evangelismo--numero-de-campanhas-evangelisticas-em-geral']).toBeUndefined()
    expect(igreja?.naoInformados).toContain('evangelismo--numero-de-campanhas-evangelisticas-em-geral')
  })

  /* Batismo sai de propósito, e isso não é falha de reconhecimento. */
  it('separa o que foi ignorado do que não foi reconhecido', () => {
    const lido = lerRelatorioIntegrado(texto)
    expect(lido.naoReconhecidos).toEqual([])
    expect(lido.ignorados).toHaveLength(1)
    expect(lido.ignorados[0]).toContain('batismo')
  })

  it('separa igrejas diferentes', () => {
    const duas = [...igrejaCompleta('Igreja Fictícia do Norte', '5'), ...igrejaCompleta('Igreja Fictícia do Sul', '2')]
      .map((p, i) => ({ ...p, pagina: i + 1 }))
    const lido = lerRelatorioIntegrado(normalizePdfLayout(duas))
    expect(lido.igrejas.map(({ nome }) => nome)).toEqual(['Igreja Fictícia do Norte', 'Igreja Fictícia do Sul'])
    expect(numeroDoValor(lido.igrejas[1]?.valores[PEQUENOS_GRUPOS])).toBe(2)
  })

  it('zero é resposta e entra como zero', () => {
    const lido = lerRelatorioIntegrado(normalizePdfLayout(igrejaCompleta('Igreja Fictícia do Norte', '0')))
    expect(numeroDoValor(lido.igrejas[0]?.valores[PEQUENOS_GRUPOS])).toBe(0)
    expect(lido.igrejas[0]?.naoInformados).not.toContain(PEQUENOS_GRUPOS)
  })
})
