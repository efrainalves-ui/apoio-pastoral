import type { Centavos } from '../family-budget/dinheiro'
import { acharSubcategoria, nomeCompleto } from './catalogo'
import { totaisDoContracheque, type Contracheque } from './contracheque'
import { parcelaPessoal, resumoDoTrabalho, type LancamentoDoTrabalho, type SituacaoDoLancamento } from './lancamento'
import { saldoDoAno, type AquisicaoLetra, type ItemDoCatalogoLetra, type OrcamentoLetraData } from './letra'

/**
 * Os relatórios do Trabalho.
 *
 * Todos saem das mesmas funções que as telas usam. Um relatório que soma por
 * conta própria diverge do painel, e o pastor fica sem saber em qual dos dois
 * acreditar — que é pior do que não ter relatório nenhum.
 */

export interface LinhaDoRelatorio {
  chave: string
  nome: string
  valor: Centavos
  percentual: number
}

function emLinhas(porChave: Map<string, Centavos>, nome: (chave: string) => string): LinhaDoRelatorio[] {
  const total = [...porChave.values()].reduce((soma, valor) => soma + valor, 0)
  return [...porChave.entries()]
    .map(([chave, valor]) => ({
      chave, nome: nome(chave), valor,
      percentual: total > 0 ? (valor / total) * 100 : 0,
    }))
    .sort((esquerda, direita) => direita.valor - esquerda.valor)
}

/** Os lançamentos de um recorte de meses, pelo mês de referência. */
export function noPeriodo(
  lancamentos: readonly LancamentoDoTrabalho[],
  { de, ate }: { de: string; ate: string },
): LancamentoDoTrabalho[] {
  return lancamentos.filter((lancamento) => lancamento.competencia >= de && lancamento.competencia <= ate)
}

export function porFamilia(lancamentos: readonly LancamentoDoTrabalho[]): LinhaDoRelatorio[] {
  const porChave = new Map<string, Centavos>()
  const nomes = new Map<string, string>()
  for (const lancamento of lancamentos) {
    const familia = acharSubcategoria(lancamento.subcategoriaId)?.familia
    const chave = familia?.id ?? 'sem-categoria'
    nomes.set(chave, familia?.nome ?? 'Sem categoria')
    porChave.set(chave, (porChave.get(chave) ?? 0) + lancamento.valorPago)
  }
  return emLinhas(porChave, (chave) => nomes.get(chave) ?? chave)
}

export function porSubcategoria(lancamentos: readonly LancamentoDoTrabalho[]): LinhaDoRelatorio[] {
  const porChave = new Map<string, Centavos>()
  for (const lancamento of lancamentos) {
    porChave.set(lancamento.subcategoriaId, (porChave.get(lancamento.subcategoriaId) ?? 0) + lancamento.valorPago)
  }
  return emLinhas(porChave, nomeCompleto)
}

/**
 * Quanto pesou no bolso, por família de despesa.
 *
 * Diferente do pago: o pago inclui o que voltou. Esta é a conta que responde à
 * pergunta que o módulo existe para responder.
 */
export function doBolsoPorFamilia(lancamentos: readonly LancamentoDoTrabalho[]): LinhaDoRelatorio[] {
  const porChave = new Map<string, Centavos>()
  for (const lancamento of lancamentos) {
    const valor = parcelaPessoal(lancamento)
    if (valor <= 0) continue
    const chave = acharSubcategoria(lancamento.subcategoriaId)?.familia.nome ?? 'Sem categoria'
    porChave.set(chave, (porChave.get(chave) ?? 0) + valor)
  }
  return emLinhas(porChave, (chave) => chave)
}

export function porSituacao(lancamentos: readonly LancamentoDoTrabalho[]): Array<{ situacao: SituacaoDoLancamento; quantidade: number; valor: Centavos }> {
  const porChave = new Map<SituacaoDoLancamento, { quantidade: number; valor: Centavos }>()
  for (const lancamento of lancamentos) {
    const atual = porChave.get(lancamento.situacao) ?? { quantidade: 0, valor: 0 }
    porChave.set(lancamento.situacao, { quantidade: atual.quantidade + 1, valor: atual.valor + lancamento.valorPago })
  }
  return [...porChave.entries()].map(([situacao, dados]) => ({ situacao, ...dados }))
}

export interface EvolucaoDoMes {
  competencia: string
  pago: Centavos
  recebido: Centavos
  doBolso: Centavos
}

/** Mês a mês, para a linha do tempo. */
export function evolucao(lancamentos: readonly LancamentoDoTrabalho[], meses: readonly string[]): EvolucaoDoMes[] {
  return meses.map((competencia) => {
    const doMes = lancamentos.filter((lancamento) => lancamento.competencia === competencia)
    const resumo = resumoDoTrabalho(doMes)
    return { competencia, pago: resumo.pago, recebido: resumo.recebido, doBolso: resumo.doBolso }
  })
}

export function ultimosMeses(ate: string, quantidade: number): string[] {
  const [ano, mes] = ate.split('-').map(Number)
  if (!ano || !mes) return []
  return Array.from({ length: quantidade }, (_, indice) => {
    const total = (ano * 12) + (mes - 1) - (quantidade - 1 - indice)
    return `${String(Math.floor(total / 12)).padStart(4, '0')}-${String((total % 12) + 1).padStart(2, '0')}`
  })
}

export interface RelatorioDoAno {
  ano: string
  pago: Centavos
  recebido: Centavos
  doBolso: Centavos
  /** Líquido somado dos contracheques do ano. */
  liquidoDaFolha: Centavos
  /** Somadas à parte, e nunca no líquido. */
  basesInformativas: Centavos
  letra: ReturnType<typeof saldoDoAno>
}

/**
 * O ano inteiro num quadro.
 *
 * O líquido da folha e o que passou pelo bolso são somas separadas de propósito:
 * juntá-las diria que o pastor ganhou o que ele adiantou.
 */
export function relatorioDoAno(
  ano: string,
  {
    lancamentos, contracheques, orcamentoLetra, itensLetra, aquisicoes,
  }: {
    lancamentos: readonly LancamentoDoTrabalho[]
    contracheques: readonly Contracheque[]
    orcamentoLetra: Pick<OrcamentoLetraData, 'total' | 'reservaDeLivros'> | null
    itensLetra: readonly ItemDoCatalogoLetra[]
    aquisicoes: readonly AquisicaoLetra[]
  },
): RelatorioDoAno {
  const doAno = lancamentos.filter((lancamento) => lancamento.competencia.startsWith(ano))
  const resumo = resumoDoTrabalho(doAno)
  const folhasDoAno = contracheques.filter((contracheque) => contracheque.competencia.startsWith(ano))
  const totaisDaFolha = folhasDoAno.map((contracheque) => totaisDoContracheque(contracheque.rubricas))

  return {
    ano,
    pago: resumo.pago,
    recebido: resumo.recebido,
    doBolso: resumo.doBolso,
    liquidoDaFolha: totaisDaFolha.reduce((soma, totais) => soma + totais.liquido, 0),
    basesInformativas: totaisDaFolha.reduce((soma, totais) => soma + totais.basesInformativas, 0),
    letra: saldoDoAno(orcamentoLetra ?? { total: 0, reservaDeLivros: 0 }, aquisicoes, itensLetra, ano),
  }
}
