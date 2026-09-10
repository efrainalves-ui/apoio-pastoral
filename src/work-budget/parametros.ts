import type { Centavos } from '../family-budget/dinheiro'

/**
 * Os parâmetros do Trabalho, com vigência.
 *
 * Regra estrutural e parâmetro local não são a mesma coisa. "O teto é 10% do
 * FPE" é estrutura; quanto vale o FPE é parâmetro, e muda de Campo para Campo e
 * de ano para ano. Confundir os dois faz o aplicativo transformar o percentual
 * de um lugar em regra universal — ou pior, inventar um número que ninguém
 * autorizou.
 *
 * Por isso todo parâmetro tem início de vigência, e todo cálculo guarda o que
 * usou. Um lançamento de março usa o FPE de março, mesmo que o FPE mude em
 * julho: recalcular o passado em silêncio é o defeito que faz o pastor
 * desconfiar do aplicativo inteiro.
 */

export interface Vigencia {
  /** Primeiro dia em que este valor vale, em chave local `AAAA-MM-DD`. */
  inicio: string
  /** Último dia, ou vazio quando ainda vale. */
  fim: string
  /** De onde veio: documento, comunicado, decisão. */
  referencia: string
  observacao: string
}

export interface ValorComVigencia<T> extends Vigencia {
  valor: T
}

/**
 * O valor que valia numa data.
 *
 * Sem vigência aberta e sem valor anterior, devolve nulo — e nulo aqui é uma
 * resposta honesta: significa "ainda não configurado", e não zero.
 */
export function vigenteEm<T>(historico: ReadonlyArray<ValorComVigencia<T>>, data: string): ValorComVigencia<T> | null {
  const candidatos = historico
    .filter((item) => item.inicio <= data && (!item.fim || item.fim >= data))
    .sort((esquerda, direita) => direita.inicio.localeCompare(esquerda.inicio))
  return candidatos[0] ?? null
}

/** O histórico em ordem, do mais recente para o mais antigo. */
export function emOrdem<T>(historico: ReadonlyArray<ValorComVigencia<T>>): Array<ValorComVigencia<T>> {
  return [...historico].sort((esquerda, direita) => direita.inicio.localeCompare(esquerda.inicio))
}

/**
 * As bases sobre as quais um percentual ou teto incide.
 *
 * O erro que esta lista existe para impedir: aplicar "10% do FPE" sobre a
 * subsistência básica. Com FPE de 7.000 e Percentual de Audit de 80%, o teto é
 * 700 — não 560. A base faz parte da regra, e precisa estar escrita nela.
 */
export const BASES_DE_CALCULO = [
  'FPE_INTEGRAL', 'SUBSISTENCIA_BASICA', 'VALOR_DA_DESPESA', 'VALOR_FIXO_LOCAL', 'OUTRA_BASE_CONFIGURAVEL',
] as const
export type BaseDeCalculo = (typeof BASES_DE_CALCULO)[number]

export const BASE_LABELS: Record<BaseDeCalculo, string> = {
  FPE_INTEGRAL: 'FPE integral',
  SUBSISTENCIA_BASICA: 'Subsistência básica',
  VALOR_DA_DESPESA: 'Valor da despesa',
  VALOR_FIXO_LOCAL: 'Valor fixo local',
  OUTRA_BASE_CONFIGURAVEL: 'Outra base',
}

export interface ContextoDoCalculo {
  /** FPE vigente na competência do lançamento. */
  fpe: Centavos | null
  /** Percentual de Audit vigente, de 0 a 100. */
  percentualDeAudit: number | null
  /** Quanto a despesa custou, quando houver. */
  valorDaDespesa: Centavos
  /** Valor fixo autorizado pela região, quando a base for essa. */
  valorFixoLocal: Centavos
  /** Qualquer outra base configurada à mão. */
  outraBase: Centavos
}

/**
 * A subsistência básica.
 *
 * FPE × Percentual de Audit, e nada mais. Não é o líquido da folha, não é o
 * total de proventos e não é a renda da família — três coisas que o pastor vê
 * no mesmo papel e que o aplicativo não pode deixar se confundirem.
 */
export function subsistenciaBasica(fpe: Centavos | null, percentualDeAudit: number | null): Centavos | null {
  if (fpe === null || percentualDeAudit === null) return null
  return Math.round(fpe * (percentualDeAudit / 100))
}

export function resolverBase(base: BaseDeCalculo, contexto: ContextoDoCalculo): Centavos | null {
  switch (base) {
    case 'FPE_INTEGRAL': return contexto.fpe
    case 'SUBSISTENCIA_BASICA': return subsistenciaBasica(contexto.fpe, contexto.percentualDeAudit)
    case 'VALOR_DA_DESPESA': return contexto.valorDaDespesa
    case 'VALOR_FIXO_LOCAL': return contexto.valorFixoLocal
    case 'OUTRA_BASE_CONFIGURAVEL': return contexto.outraBase
    default: return null
  }
}

export interface RegraDeCalculo {
  /** Percentual aplicado sobre a base, de 0 a 100. Nulo quando só há teto. */
  percentual: number | null
  base: BaseDeCalculo
  /** Teto absoluto, quando houver, em centavos. */
  teto: Centavos | null
  /** Base do teto, quando ele for percentual de alguma coisa. */
  tetoPercentual: number | null
  tetoBase: BaseDeCalculo | null
  /** De onde a regra vem: artigo, comunicado, decisão local. */
  referencia: string
}

export interface MemoriaDeCalculo {
  /** O que a regra rendeu, já com teto aplicado. */
  valor: Centavos
  /** O que faltou para cobrir a despesa: a parcela pessoal. */
  parcelaPessoal: Centavos
  fpeUtilizado: Centavos | null
  percentualDeAuditUtilizado: number | null
  base: BaseDeCalculo
  valorDaBase: Centavos | null
  percentualAplicado: number | null
  tetoAplicado: Centavos | null
  /** Verdadeiro quando o teto foi quem determinou o resultado. */
  limitadoPeloTeto: boolean
  referencia: string
  /** Preenchido quando falta configuração para calcular. */
  pendencia: string | null
}

/**
 * Aplica uma regra e guarda o que usou.
 *
 * A memória não é auditoria por vaidade: quando o FPE mudar, é ela que explica
 * por que o reembolso de março foi aquele. Sem ela, o pastor abre um lançamento
 * antigo e vê um número que não bate com nenhum parâmetro atual.
 */
export function aplicarRegra(regra: RegraDeCalculo, contexto: ContextoDoCalculo): MemoriaDeCalculo {
  const valorDaBase = resolverBase(regra.base, contexto)
  const comum = {
    fpeUtilizado: contexto.fpe,
    percentualDeAuditUtilizado: contexto.percentualDeAudit,
    base: regra.base,
    valorDaBase,
    percentualAplicado: regra.percentual,
    referencia: regra.referencia,
  }

  if (valorDaBase === null) {
    return {
      ...comum, valor: 0, parcelaPessoal: contexto.valorDaDespesa,
      tetoAplicado: null, limitadoPeloTeto: false,
      pendencia: regra.base === 'FPE_INTEGRAL' || regra.base === 'SUBSISTENCIA_BASICA'
        ? 'FPE ou Percentual de Audit ainda não configurado.'
        : 'Base de cálculo ainda não configurada.',
    }
  }

  const bruto = regra.percentual === null ? valorDaBase : Math.round(valorDaBase * (regra.percentual / 100))

  const tetoPorPercentual = regra.tetoPercentual !== null && regra.tetoBase
    ? (() => {
      const baseDoTeto = resolverBase(regra.tetoBase, contexto)
      return baseDoTeto === null ? null : Math.round(baseDoTeto * (regra.tetoPercentual / 100))
    })()
    : null

  const tetos = [regra.teto, tetoPorPercentual].filter((valor): valor is Centavos => valor !== null)
  const teto = tetos.length ? Math.min(...tetos) : null
  const valor = teto === null ? bruto : Math.min(bruto, teto)

  return {
    ...comum,
    valor,
    parcelaPessoal: Math.max(0, contexto.valorDaDespesa - valor),
    tetoAplicado: teto,
    limitadoPeloTeto: teto !== null && bruto > teto,
    pendencia: null,
  }
}

/**
 * A faixa de climatização do REA Y 20 50 S.
 *
 * Não é um percentual simples: a instituição cobre até 75% da parte do gasto
 * que fica **entre** 6% e 17% do FPE. O que está abaixo de 6% é do pastor, e o
 * que passa de 17% também. Aplicar 75% sobre o gasto inteiro daria um número
 * bem maior e errado.
 */
export function faixaDeClimatizacao(
  gasto: Centavos,
  fpe: Centavos | null,
  { piso = 6, teto = 17, cobertura = 75 } = {},
): MemoriaDeCalculo {
  const comum = {
    fpeUtilizado: fpe, percentualDeAuditUtilizado: null,
    base: 'FPE_INTEGRAL' as BaseDeCalculo, valorDaBase: fpe,
    percentualAplicado: cobertura, referencia: 'REA Y 20 50 S — climatização',
  }
  if (fpe === null) {
    return { ...comum, valor: 0, parcelaPessoal: gasto, tetoAplicado: null, limitadoPeloTeto: false, pendencia: 'FPE ainda não configurado.' }
  }

  const limiteInferior = Math.round(fpe * (piso / 100))
  const limiteSuperior = Math.round(fpe * (teto / 100))
  const dentroDaFaixa = Math.max(0, Math.min(gasto, limiteSuperior) - limiteInferior)
  const valor = Math.round(dentroDaFaixa * (cobertura / 100))

  return {
    ...comum, valor, parcelaPessoal: Math.max(0, gasto - valor),
    tetoAplicado: limiteSuperior, limitadoPeloTeto: gasto > limiteSuperior, pendencia: null,
  }
}

export interface ItemDoLimiteConjunto {
  chave: string
  valor: Centavos
}

export interface RateioDoLimite {
  chave: string
  /** Quanto deste item entra no reembolso. */
  coberto: Centavos
  /** Quanto sobrou por conta do pastor. */
  pessoal: Centavos
}

/**
 * Um teto compartilhado entre categorias.
 *
 * Internet e telefone com teto conjunto de R$ 150 rendem R$ 150 no total — não
 * R$ 150 para cada. O limite se consome uma vez só, mesmo que um venha pela
 * folha e o outro pela ajuda de custo, e mesmo que cheguem em documentos
 * diferentes.
 *
 * O excedente é rateado na proporção de cada item, para que a divisão seja
 * explicável e a soma feche.
 */
export function ratearLimiteConjunto(itens: readonly ItemDoLimiteConjunto[], teto: Centavos): RateioDoLimite[] {
  const total = itens.reduce((soma, item) => soma + item.valor, 0)
  if (total <= teto) return itens.map((item) => ({ chave: item.chave, coberto: item.valor, pessoal: 0 }))

  const rateio = itens.map((item) => ({
    chave: item.chave,
    coberto: Math.floor((item.valor / total) * teto),
    pessoal: 0,
  }))
  // O arredondamento para baixo sobra centavos; eles vão para o maior item.
  const distribuido = rateio.reduce((soma, item) => soma + item.coberto, 0)
  const resto = teto - distribuido
  if (resto > 0 && rateio.length) {
    const maior = itens.reduce((escolhido, item, indice) => item.valor > (itens[escolhido]?.valor ?? 0) ? indice : escolhido, 0)
    rateio[maior]!.coberto += resto
  }

  return rateio.map((item, indice) => ({ ...item, pessoal: (itens[indice]?.valor ?? 0) - item.coberto }))
}
