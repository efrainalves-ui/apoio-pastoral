import { CATALOGO_DO_RELATORIO, CLASSES_DA_ESCOLA_SABATINA, type ClasseDaEscolaSabatina, type IndicadorDoRelatorio } from './catalogo'
import type { ValorDoIndicador } from './types'

export interface IgrejaDoRelatorio {
  /** Nome como o relatório escreve, sem o sufixo da Associação. */
  nome: string
  paginas: number[]
  valores: Record<string, ValorDoIndicador>
  /** Indicadores que vieram com traço: informação não fornecida. */
  naoInformados: string[]
}

export interface RelatorioLido {
  trimestre: string
  igrejas: IgrejaDoRelatorio[]
  /** Linhas do PDF que nenhum indicador do catálogo reconheceu. */
  naoReconhecidos: string[]
  /** Linhas deixadas de fora de propósito, e não por falta de reconhecimento. */
  ignorados: string[]
}

/**
 * Batismo pertence a outro relatório, por decisão do pastor.
 *
 * A linha é reconhecida e descartada de propósito — não cai em "não
 * reconhecido", que é onde vai o que o catálogo ainda não conhece. Confundir as
 * duas faria a conferência acusar uma falha que não existe.
 */
const IGNORADOS_DE_PROPOSITO = [/levad[ao]s? ao batismo/iu]

export function ehRelatorioIntegrado(texto: string): boolean {
  return texto.split(/\r?\n/u)[0]?.trim() === 'RELATORIO_INTEGRADO'
}

function chave(rotulo: string): string {
  return rotulo.normalize('NFD').replace(/[̀-ͯ]/gu, '').replace(/[^A-Za-z0-9]+/gu, ' ').trim().toLocaleLowerCase('pt-BR')
}

const PORCHAVE = new Map<string, IndicadorDoRelatorio>(CATALOGO_DO_RELATORIO.map((item) => [chave(item.rotulo), item]))

/**
 * O traço do relatório quer dizer "ninguém informou", e nunca zero.
 *
 * É a diferença entre uma igreja sem Pequenos Grupos e uma igreja que não
 * respondeu quantos tem: a primeira é problema pastoral, a segunda é problema
 * de secretaria, e tratá-las igual esconde as duas.
 */
function numero(bruto: string): number | null {
  const limpo = bruto.trim().replace(/\.(?=\d{3}\b)/gu, '')
  return /^\d+$/u.test(limpo) ? Number(limpo) : null
}

function simNao(bruto: string): boolean | null {
  const limpo = chave(bruto)
  if (limpo === 'sim') return true
  if (limpo === 'nao') return false
  return null
}

export function lerRelatorioIntegrado(texto: string): RelatorioLido {
  const linhas = texto.split(/\r?\n/u).map((linha) => linha.trim()).filter(Boolean)
  let trimestre = ''
  const igrejas: IgrejaDoRelatorio[] = []
  const naoReconhecidos: string[] = []
  const ignorados: string[] = []
  let atual: IgrejaDoRelatorio | null = null

  const registrar = (indicador: IndicadorDoRelatorio, pagina: number, valor: ValorDoIndicador | null) => {
    if (!atual) return
    if (!atual.paginas.includes(pagina)) atual.paginas.push(pagina)
    if (valor) atual.valores[indicador.id] = valor
    else if (!atual.naoInformados.includes(indicador.id)) atual.naoInformados.push(indicador.id)
  }

  for (const linha of linhas) {
    if (linha === 'RELATORIO_INTEGRADO') continue
    const partes = linha.split('|')
    const marca = partes[0]

    if (marca === 'TRIMESTRE') { trimestre ||= partes[1] ?? ''; continue }
    if (marca === 'IGREJA') {
      const nome = partes[2] ?? ''
      atual = igrejas.find((igreja) => igreja.nome === nome) ?? null
      if (!atual) { atual = { nome, paginas: [], valores: {}, naoInformados: [] }; igrejas.push(atual) }
      const pagina = Number(partes[1])
      if (Number.isFinite(pagina) && !atual.paginas.includes(pagina)) atual.paginas.push(pagina)
      continue
    }

    const pagina = Number(partes[1])
    const rotulo = partes[2] ?? ''
    const indicador = PORCHAVE.get(chave(rotulo))
    if (!indicador) {
      if (!rotulo) continue
      if (IGNORADOS_DE_PROPOSITO.some((padrao) => padrao.test(rotulo))) ignorados.push(rotulo)
      else naoReconhecidos.push(rotulo)
      continue
    }

    if (marca === 'V') {
      const bruto = partes[3] ?? ''
      if (indicador.formato === 'sim_nao') {
        const resposta = simNao(bruto)
        registrar(indicador, pagina, resposta === null ? null : { tipo: 'sim_nao', valor: resposta })
      } else {
        const n = numero(bruto)
        registrar(indicador, pagina, n === null ? null : { tipo: 'numero', valor: n })
      }
      continue
    }

    if (marca === 'S') {
      const [segundo, setimo] = (partes[3] ?? '').split(';')
      const a = numero(segundo ?? ''); const b = numero(setimo ?? '')
      registrar(indicador, pagina, a === null && b === null ? null : { tipo: 'por_sabado', segundo: a, setimo: b })
      continue
    }

    if (marca === 'C') {
      const valores = (partes[3] ?? '').split(';')
      const colunas = (partes[4] ?? '').split(',')
      const classes: Partial<Record<ClasseDaEscolaSabatina, number>> = {}
      let total: number | null = null
      colunas.forEach((coluna, posicao) => {
        const n = numero(valores[posicao] ?? '')
        if (n === null) return
        if (coluna === 'Total') { total = n; return }
        if ((CLASSES_DA_ESCOLA_SABATINA as readonly string[]).includes(coluna)) classes[coluna as ClasseDaEscolaSabatina] = n
      })
      const somaDasClasses = Object.values(classes).reduce((soma, valor) => soma + valor, 0)
      const temAlgo = total !== null || Object.keys(classes).length > 0
      registrar(indicador, pagina, temAlgo ? { tipo: 'por_classe', classes, total: total ?? somaDasClasses } : null)
    }
  }

  return { trimestre, igrejas, naoReconhecidos: [...new Set(naoReconhecidos)], ignorados: [...new Set(ignorados)] }
}
