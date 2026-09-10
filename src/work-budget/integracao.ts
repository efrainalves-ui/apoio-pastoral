import type { Centavos } from '../family-budget/dinheiro'
import type { LancamentoData } from '../family-budget/lancamento'
import { nomeCompleto } from './catalogo'
import { parcelaPessoal, type LancamentoDoTrabalhoData } from './lancamento'

/**
 * A ponte entre o Trabalho e o orçamento da família.
 *
 * O que atravessa é só a parcela pessoal — nunca o valor pago inteiro. Uma
 * conta de 400 com 120 de reembolso pesou 280 no bolso do pastor; lançar 400
 * na família contaria de novo o que a instituição devolveu, e o orçamento
 * doméstico fecharia com uma despesa que não houve.
 *
 * E atravessa uma vez só. Quando o reembolso finalmente cai, a parcela pessoal
 * encolhe: o lançamento da família é corrigido, não somado de novo.
 */

/**
 * Onde a parcela pessoal aterrissa no orçamento da família.
 *
 * O catálogo pessoal é fechado de propósito — abrir uma categoria "Ministério"
 * nele destruiria a comparação entre meses que ele existe para permitir. Então
 * a despesa entra em Outros, e a observação diz o que ela é.
 */
export const SUBCATEGORIA_DO_MINISTERIO = 'outros.outra-despesa'

export interface EspelhoPessoal {
  /** O que fazer com o lançamento da família. */
  acao: 'criar' | 'atualizar' | 'remover' | 'nada'
  /** Os dados a gravar, quando há o que gravar. */
  dados: LancamentoData | null
  /** O lançamento da família que já existe, quando existe. */
  id: string | null
  motivo: string
}

/**
 * O que fazer com o espelho de um lançamento do Trabalho.
 *
 * Quatro respostas, e a que mais importa é `remover`: reembolso integral que
 * chega depois deixa o pastor sem parcela pessoal nenhuma, e o lançamento
 * antigo da família precisa sair, não ficar valendo por inércia.
 */
export function espelhoPessoal(
  lancamento: LancamentoDoTrabalhoData,
  { descricaoDoMinisterio = 'Ministério' } = {},
): EspelhoPessoal {
  const pessoal: Centavos = parcelaPessoal(lancamento)
  const jaExiste = lancamento.lancamentoPessoalId

  if (pessoal <= 0) {
    return jaExiste
      ? { acao: 'remover', dados: null, id: jaExiste, motivo: 'O reembolso cobriu tudo.' }
      : { acao: 'nada', dados: null, id: null, motivo: 'Nada saiu do bolso.' }
  }

  const dados: LancamentoData = {
    natureza: 'saida',
    descricao: lancamento.descricao || `${descricaoDoMinisterio} · ${nomeCompleto(lancamento.subcategoriaId)}`,
    valor: pessoal,
    subcategoria: SUBCATEGORIA_DO_MINISTERIO,
    data: lancamento.data,
    competencia: lancamento.competencia,
    vencimento: '',
    /*
      Já está paga: o pastor desembolsou na data do gasto. Deixá-la pendente
      faria a família mostrar uma conta a vencer que já foi paga.
    */
    situacao: 'paga',
    tipo: 'variavel',
    formaDePagamento: null, contaId: null, cartaoId: null,
    integranteId: null, referenteA: null,
    recorrencia: 'nenhuma', serieId: null, parcelamento: null,
    descontadoNaFonte: false,
    observacao: `Parcela pessoal de ${nomeCompleto(lancamento.subcategoriaId)} no ministério.`,
    createdAt: '', updatedAt: '',
  }

  return jaExiste
    ? { acao: 'atualizar', dados, id: jaExiste, motivo: 'A parcela pessoal mudou.' }
    : { acao: 'criar', dados, id: null, motivo: 'Saiu do bolso do pastor.' }
}

/**
 * Quanto do ministério pesou no bolso, por competência.
 *
 * Serve ao relatório, e usa a mesma função que a ponte usa — um relatório que
 * soma por conta própria diverge da tela, e o pastor fica sem saber em qual
 * dos dois acreditar.
 */
export function doBolsoPorCompetencia(lancamentos: readonly LancamentoDoTrabalhoData[]): Map<string, Centavos> {
  const porMes = new Map<string, Centavos>()
  for (const lancamento of lancamentos) {
    const valor = parcelaPessoal(lancamento)
    if (valor > 0) porMes.set(lancamento.competencia, (porMes.get(lancamento.competencia) ?? 0) + valor)
  }
  return porMes
}
