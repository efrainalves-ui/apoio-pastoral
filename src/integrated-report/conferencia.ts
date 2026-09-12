import type { ChurchEntity } from '../district/types'
import { normalizePersonName } from '../people/validation'
import { indicadorPorId, type IndicadorDoRelatorio } from './catalogo'
import type { IgrejaDoRelatorio, RelatorioLido } from './leitura'
import { destoa, numeroDoValor, valorAtual } from './service'
import type { RelatorioIntegradoEntity, ValorDoIndicador } from './types'

export interface ValorAConferir {
  indicador: IndicadorDoRelatorio
  valor: ValorDoIndicador
  numero: number | null
  /** O que a mesma igreja informou antes, para a comparação ficar à vista. */
  anterior: { trimestre: string; numero: number | null } | null
  precisaConfirmar: boolean
}

export interface IgrejaConferida {
  /** Nome como o relatório escreve. */
  nomeNoRelatorio: string
  church: ChurchEntity | null
  paginas: number[]
  valores: ValorAConferir[]
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
): IgrejaConferida {
  const valores: ValorAConferir[] = []
  for (const [id, valor] of Object.entries(igreja.valores)) {
    const indicador = indicadorPorId(id)
    if (!indicador) continue
    const leitura = church ? valorAtual(anteriores, church.id, id) : null
    const anterior = leitura ? { trimestre: leitura.trimestre, numero: numeroDoValor(leitura.valor) } : null
    const numero = numeroDoValor(valor)
    valores.push({ indicador, valor, numero, anterior, precisaConfirmar: destoa(anterior?.numero ?? null, numero) })
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
 * Prepara a conferência, sem gravar nada.
 *
 * Igreja que não aparece no relatório não é igreja zerada: o pastor confirmou
 * que algumas simplesmente não entregam. Ela sai numa lista própria, e os
 * números dela continuam sendo os do último trimestre que informou.
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
  const doRelatorio = lido.igrejas.map((igreja) => conferirIgreja(igreja, casarIgreja(igreja.nome, ativas), anteriores))
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

export function contarPendencias(conferencia: ConferenciaDoRelatorio): { confirmar: number; semInformacao: number; prontos: number } {
  let confirmar = 0; let prontos = 0; let semInformacao = 0
  for (const igreja of conferencia.igrejas) {
    for (const valor of igreja.valores) { if (valor.precisaConfirmar) confirmar += 1; else prontos += 1 }
    semInformacao += igreja.naoInformados.length
  }
  return { confirmar, semInformacao, prontos }
}

/**
 * O que será gravado, depois das recusas.
 *
 * Um valor recusado não vira zero nem some: ele fica registrado como recusado,
 * e o indicador continua valendo o último trimestre que informou. No trimestre
 * seguinte é preciso saber que aquele número foi visto e rejeitado, e não que
 * ninguém o mandou.
 */
export function aplicarRecusas(
  igreja: IgrejaConferida,
  recusados: readonly string[],
): { valores: Record<string, ValorDoIndicador>; recusados: string[] } {
  const valores: Record<string, ValorDoIndicador> = {}
  const fora: string[] = []
  for (const item of igreja.valores) {
    if (recusados.includes(item.indicador.id)) fora.push(item.indicador.id)
    else valores[item.indicador.id] = item.valor
  }
  return { valores, recusados: fora }
}
