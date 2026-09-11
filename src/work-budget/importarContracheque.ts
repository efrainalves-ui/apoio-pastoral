import { lerValor, type Centavos } from '../family-budget/dinheiro'
import type { Rubrica, TipoDeRubrica } from './contracheque'

/**
 * Leitura de um contracheque em texto.
 *
 * O layout de contracheque muda de instituição para instituição, e adivinhar o
 * de alguém seria acertar num lugar e errar em silêncio em todos os outros. Por
 * isso este módulo não decide nada: ele **propõe** linhas, e a conferência é do
 * pastor, item por item, antes de qualquer gravação.
 *
 * O que ele faz com segurança é o que não depende de layout: encontrar valores
 * em português, separar o que é total do que é rubrica, e usar os títulos de
 * seção como palpite do tipo — palpite que a tela deixa trocar.
 *
 * Nada sai do aparelho. O arquivo é lido na memória e descartado; o texto não
 * vai para registro, para log nem para lugar nenhum.
 */

/** `1.234,56`, `1234,56` ou `12,00`. Sempre com os centavos. */
const VALOR = /\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2}/gu

const SECOES: Array<{ marca: RegExp; tipo: TipoDeRubrica }> = [
  { marca: /\bdescontos?\b|\bdebitos?\b|\bdeducoes\b/u, tipo: 'desconto' },
  { marca: /\bproventos?\b|\bvencimentos?\b|\bcreditos?\b|\brendimentos?\b/u, tipo: 'provento' },
  { marca: /\bbases?\b|\binformativ/u, tipo: 'informativa' },
]

/*
  Linhas de total não são rubricas. Somá-las junto dobraria o contracheque, e é
  um erro que passa despercebido porque o número "parece certo" — ele é, de
  fato, a soma das linhas que já estão ali.
*/
const TOTAL = /^\s*(?:total|soma|liquido|liquido a receber|valor liquido)\b/u

function semAcento(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/gu, '').toLocaleLowerCase('pt-BR')
}

export interface RubricaCandidata extends Rubrica {
  /** A linha de onde ela saiu, para a conferência comparar com o papel. */
  origem: string
}

export interface LeituraDoContracheque {
  rubricas: RubricaCandidata[]
  /** `AAAA-MM` quando o texto disser, nulo quando não disser. */
  competencia: string | null
  /** Totais que o documento declara, para conferir contra a soma das rubricas. */
  totaisDeclarados: { rotulo: string; valor: Centavos }[]
  /** Linhas com valor que não viraram rubrica, para o pastor saber o que ficou de fora. */
  ignoradas: string[]
}

const MESES: Record<string, string> = {
  janeiro: '01', fevereiro: '02', marco: '03', abril: '04', maio: '05', junho: '06',
  julho: '07', agosto: '08', setembro: '09', outubro: '10', novembro: '11', dezembro: '12',
}

/**
 * A competência, quando o documento a declara.
 *
 * Nulo quando não declara — e nulo é melhor do que o mês de hoje: um
 * contracheque de agosto importado em setembro entraria no mês errado e
 * dobraria a renda de um enquanto zerava a do outro.
 */
export function competenciaDoTexto(texto: string): string | null {
  const limpo = semAcento(texto)

  const porNome = /\b(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s*(?:de\s*)?\/?\s*(\d{4})\b/u.exec(limpo)
  if (porNome?.[1] && porNome[2]) return `${porNome[2]}-${MESES[porNome[1]]}`

  const porNumero = /\b(0[1-9]|1[0-2])\s*\/\s*(\d{4})\b/u.exec(limpo)
  if (porNumero?.[1] && porNumero[2]) return `${porNumero[2]}-${porNumero[1]}`

  return null
}

/**
 * Transforma o texto do contracheque em rubricas propostas.
 *
 * O valor considerado é o **último** da linha: os contracheques costumam trazer
 * a referência antes dele — percentual, quantidade de dias — e tomar o primeiro
 * número da linha traria a referência no lugar do dinheiro.
 */
export function interpretarContracheque(texto: string): LeituraDoContracheque {
  const rubricas: RubricaCandidata[] = []
  const totaisDeclarados: { rotulo: string; valor: Centavos }[] = []
  const ignoradas: string[] = []
  let tipoDaSecao: TipoDeRubrica = 'provento'

  for (const linhaBruta of texto.split(/\r?\n/u)) {
    const linha = linhaBruta.replace(/\s+/gu, ' ').trim()
    if (!linha) continue
    const limpa = semAcento(linha)

    const valores = linha.match(VALOR)
    const temCodigo = /^\d{1,6}\b/u.test(linha)

    /*
      Título de seção, e não rubrica cujo nome contém a palavra.

      "BASE DA PREVIDENCIA 5.600,00" tem "base" no nome e é uma rubrica; "OUTRAS
      BASES INFORMATIVAS" é o título acima dela. O que separa os dois é o
      código: rubrica de contracheque vem numerada, título não vem. Sem essa
      distinção, toda rubrica com "base" ou "desconto" no nome sumia da lista.
    */
    const secao = temCodigo ? undefined : SECOES.find(({ marca }) => marca.test(limpa))
    if (secao && !valores) { tipoDaSecao = secao.tipo; continue }

    if (!valores?.length) continue
    const valor = lerValor(valores[valores.length - 1]!)
    if (valor === null || valor <= 0) { ignoradas.push(linha); continue }

    if (TOTAL.test(limpa)) {
      totaisDeclarados.push({ rotulo: linha, valor })
      continue
    }

    /*
      Uma linha que traz o título da seção junto do valor — "PROVENTOS
      6.000,00" — é cabeçalho com total, não rubrica.
    */
    if (secao) { totaisDeclarados.push({ rotulo: linha, valor }); tipoDaSecao = secao.tipo; continue }

    const antesDoValor = linha.slice(0, linha.lastIndexOf(valores[valores.length - 1]!)).trim()
    const codigo = /^(\d{1,6})\b/u.exec(antesDoValor)?.[1] ?? ''
    const descricao = antesDoValor.replace(/^\d{1,6}\b/u, '').replace(/[\s.\-–|]+$/u, '').trim()
    if (!descricao) { ignoradas.push(linha); continue }

    rubricas.push({ codigo, descricao, tipo: tipoDaSecao, valor, subcategoriaId: '', origem: linha })
  }

  return { rubricas, competencia: competenciaDoTexto(texto), totaisDeclarados, ignoradas }
}

/**
 * Confere a soma das rubricas contra o total que o documento declara.
 *
 * Divergência não significa erro de leitura nem erro da instituição — significa
 * que alguém precisa olhar. É exatamente o que uma importação sem conferência
 * deixaria passar.
 */
export function conferirComODeclarado(
  rubricas: readonly Rubrica[],
  totaisDeclarados: ReadonlyArray<{ rotulo: string; valor: Centavos }>,
): string[] {
  const somar = (tipo: TipoDeRubrica) => rubricas.filter((rubrica) => rubrica.tipo === tipo)
    .reduce<Centavos>((total, rubrica) => total + rubrica.valor, 0)
  const proventos = somar('provento')
  const descontos = somar('desconto')

  const achados: string[] = []
  for (const declarado of totaisDeclarados) {
    const rotulo = semAcento(declarado.rotulo)
    const esperado = /liquido/u.test(rotulo) ? proventos - descontos
      : /desconto|debito|deducao/u.test(rotulo) ? descontos
      : /provento|vencimento|credito/u.test(rotulo) ? proventos
      : null
    if (esperado === null || esperado === declarado.valor) continue
    achados.push(`"${declarado.rotulo}" não bate com a soma das rubricas lidas.`)
  }
  return achados
}
