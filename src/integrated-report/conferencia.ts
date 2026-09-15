import type { ChurchEntity } from '../district/types'
import { normalizePersonName } from '../people/validation'
import { indicadorPorId, type IndicadorDoRelatorio } from './catalogo'
import type { IgrejaDoRelatorio, RelatorioLido } from './leitura'
import { numeroDoValor, possivelErroDeDigitacao, valorAnterior } from './service'
import type { RelatorioIntegradoEntity, ValorDoIndicador } from './types'

export interface ValorLido {
  indicador: IndicadorDoRelatorio
  valor: ValorDoIndicador
  numero: number | null
  /** A resposta anterior da mesma igreja, para a comparação ficar à vista. */
  anterior: { trimestre: string; numero: number | null } | null
  /** Só uma observação: o valor é gravado exatamente como veio. */
  possivelErro: boolean
}

export interface IgrejaConferida {
  /** Nome como o relatório escreve. */
  nomeNoRelatorio: string
  church: ChurchEntity | null
  paginas: number[]
  valores: ValorLido[]
  naoInformados: IndicadorDoRelatorio[]
}

export interface ConferenciaDoRelatorio {
  trimestre: string
  arquivo: string
  fileHash: string
  igrejas: IgrejaConferida[]
  /** Igrejas do distrito que não aparecem neste relatório. */
  semRelatorio: ChurchEntity[]
  /** Nomes do relatório que não encontraram igreja cadastrada. */
  semCorrespondencia: string[]
  naoReconhecidos: string[]
  ignorados: string[]
  jaAplicado: boolean
}

/**
 * O relatório escreve "Bairro Novo - Curuçá I"; o cadastro guarda o nome da
 * igreja. O que vem antes do primeiro travessão é o nome; o resto é a cidade.
 */
function casarIgreja(nome: string, churches: readonly ChurchEntity[]): ChurchEntity | null {
  const alvo = normalizePersonName(nome)
  const exata = churches.find((church) => normalizePersonName(church.name) === alvo)
  if (exata) return exata
  const semCidade = normalizePersonName(nome.split(' - ')[0] ?? nome)
  return churches.find((church) => normalizePersonName(church.name) === semCidade)
    ?? churches.find((church) => normalizePersonName(church.name).startsWith(semCidade) && semCidade.length >= 4)
    ?? null
}

function conferirIgreja(
  igreja: IgrejaDoRelatorio,
  church: ChurchEntity | null,
  anteriores: readonly RelatorioIntegradoEntity[],
  trimestre: string,
): IgrejaConferida {
  const valores: ValorLido[] = []
  for (const [id, valor] of Object.entries(igreja.valores)) {
    const indicador = indicadorPorId(id)
    if (!indicador) continue
    const leitura = church ? valorAnterior(anteriores, church.id, id, trimestre) : null
    const anterior = leitura ? { trimestre: leitura.trimestre, numero: numeroDoValor(leitura.valor) } : null
    const numero = numeroDoValor(valor)
    valores.push({ indicador, valor, numero, anterior, possivelErro: possivelErroDeDigitacao(anterior?.numero ?? null, numero) })
  }
  valores.sort((esquerda, direita) =>
    esquerda.indicador.secao.localeCompare(direita.indicador.secao, 'pt-BR')
    || esquerda.indicador.rotulo.localeCompare(direita.indicador.rotulo, 'pt-BR'))

  return {
    nomeNoRelatorio: igreja.nome,
    church,
    paginas: [...igreja.paginas].sort((a, b) => a - b),
    valores,
    naoInformados: igreja.naoInformados.map(indicadorPorId).filter((item): item is IndicadorDoRelatorio => Boolean(item)),
  }
}

/**
 * Prepara a gravação, sem gravar nada e sem pedir decisão sobre número algum.
 *
 * O relatório é o registro do que cada igreja respondeu: tudo o que veio é
 * gravado como veio, zero é zero e traço continua sem informação. Igreja que não
 * aparece no relatório não é igreja zerada — ela sai numa lista própria.
 */
export function conferir(
  lido: RelatorioLido,
  churches: readonly ChurchEntity[],
  anteriores: readonly RelatorioIntegradoEntity[],
  arquivo: string,
  fileHash: string,
  jaAplicado: boolean,
): ConferenciaDoRelatorio {
  const ativas = churches.filter(({ status }) => status === 'active')
  const doRelatorio = lido.igrejas.map((igreja) => conferirIgreja(igreja, casarIgreja(igreja.nome, ativas), anteriores, lido.trimestre))
  const encontradas = new Set(doRelatorio.map(({ church }) => church?.id).filter(Boolean))

  return {
    trimestre: lido.trimestre,
    arquivo,
    fileHash,
    igrejas: doRelatorio,
    semRelatorio: ativas.filter((church) => !encontradas.has(church.id)),
    semCorrespondencia: doRelatorio.filter(({ church }) => !church).map(({ nomeNoRelatorio }) => nomeNoRelatorio),
    naoReconhecidos: lido.naoReconhecidos,
    ignorados: lido.ignorados,
    jaAplicado,
  }
}

export function resumoDaConferencia(conferencia: ConferenciaDoRelatorio): { valores: number; possiveisErros: number; semInformacao: number } {
  let valores = 0; let possiveisErros = 0; let semInformacao = 0
  for (const igreja of conferencia.igrejas) {
    valores += igreja.valores.length
    possiveisErros += igreja.valores.filter(({ possivelErro }) => possivelErro).length
    semInformacao += igreja.naoInformados.length
  }
  return { valores, possiveisErros, semInformacao }
}

/** O que será gravado de uma igreja: tudo o que ela informou, como informou. */
export function valoresParaGravar(igreja: IgrejaConferida): Record<string, ValorDoIndicador> {
  return Object.fromEntries(igreja.valores.map(({ indicador, valor }) => [indicador.id, valor]))
}
