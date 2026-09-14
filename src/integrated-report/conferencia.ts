import type { ChurchEntity } from '../district/types'
import { normalizePersonName } from '../people/validation'
import { indicadorPorId, type IndicadorDoRelatorio } from './catalogo'
import type { IgrejaDoRelatorio, RelatorioLido } from './leitura'
import { comNumero, destoa, numeroDoValor, valorAtual } from './service'
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
 * O que o pastor decidiu sobre um valor que destoa.
 *
 * `aprovado` é o número do papel, conferido. `corrigido` é outro número que ele
 * digitou — o relatório dizia 45 e eram 4. `recusado` tira o número da
 * gravação. `pendente` é não ter decidido ainda, e é o estado em que todo valor
 * que destoa nasce.
 *
 * Pendente não é aprovado nem recusado: ele não grava, não alimenta meta e não
 * entra no total confirmado do distrito — mas continua à vista, para não ser
 * esquecido.
 */
export type DecisaoSobreValor =
  | { tipo: 'pendente' }
  | { tipo: 'aprovado' }
  | { tipo: 'corrigido'; valor: number }
  | { tipo: 'recusado' }

export type DecisoesDaIgreja = Readonly<Record<string, DecisaoSobreValor>>

/** Um valor que destoa e ainda não foi decidido não pode ser gravado. */
export function estaPendente(item: ValorAConferir, decisoes: DecisoesDaIgreja): boolean {
  if (!item.precisaConfirmar) return false
  return (decisoes[item.indicador.id]?.tipo ?? 'pendente') === 'pendente'
}


export interface ResultadoDaDecisao {
  valores: Record<string, ValorDoIndicador>
  /** Recusados de propósito: ficam registrados, para o trimestre seguinte saber. */
  recusados: string[]
  /** Ainda sem decisão: não gravam, e continuam esperando. */
  pendentes: string[]
  /** Corrigidos à mão, com o número que o pastor escreveu. */
  corrigidos: Array<{ id: string; de: number | null; para: number }>
}

/**
 * O que será gravado, depois das decisões do pastor.
 *
 * Um valor recusado não vira zero nem some: fica registrado como recusado, e o
 * indicador continua valendo o último trimestre que informou. No trimestre
 * seguinte é preciso saber que aquele número foi visto e rejeitado, e não que
 * ninguém o mandou.
 *
 * Um valor pendente também não grava — mas por outro motivo: ninguém decidiu
 * ainda. Misturar os dois faria "não olhei" parecer "olhei e recusei".
 */
export function aplicarDecisoes(
  igreja: IgrejaConferida,
  decisoes: DecisoesDaIgreja,
): ResultadoDaDecisao {
  const valores: Record<string, ValorDoIndicador> = {}
  const recusados: string[] = []
  const pendentes: string[] = []
  const corrigidos: Array<{ id: string; de: number | null; para: number }> = []

  for (const item of igreja.valores) {
    const id = item.indicador.id
    const decisao = decisoes[id] ?? { tipo: item.precisaConfirmar ? 'pendente' : 'aprovado' }

    if (decisao.tipo === 'recusado') { recusados.push(id); continue }
    if (decisao.tipo === 'pendente' && item.precisaConfirmar) { pendentes.push(id); continue }
    if (decisao.tipo === 'corrigido') {
      valores[id] = comNumero(item.valor, decisao.valor)
      corrigidos.push({ id, de: item.numero, para: decisao.valor })
      continue
    }
    valores[id] = item.valor
  }
  return { valores, recusados, pendentes, corrigidos }
}

/**
 * Compatibilidade com o caminho antigo, em que só havia recusar.
 *
 * Mantida porque a tela e os testes já escritos a usam; ela é a mesma coisa com
 * todo o resto aprovado.
 */
export function aplicarRecusas(
  igreja: IgrejaConferida,
  recusados: readonly string[],
): { valores: Record<string, ValorDoIndicador>; recusados: string[] } {
  const decisoes: Record<string, DecisaoSobreValor> = {}
  for (const item of igreja.valores) {
    decisoes[item.indicador.id] = recusados.includes(item.indicador.id) ? { tipo: 'recusado' } : { tipo: 'aprovado' }
  }
  const resultado = aplicarDecisoes(igreja, decisoes)
  return { valores: resultado.valores, recusados: resultado.recusados }
}
