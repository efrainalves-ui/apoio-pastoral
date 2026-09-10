import { fixasEVariaveis, paraOndeFoi, rendaPorIntegrante, resumoDoMes, taxaDeEconomia } from './calculos'
import { acharSubcategoria } from './catalogo'
import { percentual, somar, type Centavos } from './dinheiro'
import {
  FORMA_DE_PAGAMENTO_LABELS,
  type Cartao, type Conta, type Lancamento, type Transferencia,
} from './lancamento'
import { guardadoNaMeta, objetivoDaMeta, type Aporte, type Meta } from './metas'

/**
 * Os relatórios do orçamento pessoal.
 *
 * Todos saem das mesmas funções de cálculo que a Visão Geral usa. É o ponto:
 * um relatório que soma por conta própria diverge do painel, e ninguém sabe
 * qual dos dois acreditar.
 */

export const PERIODOS = ['mes', 'anterior', 'tres', 'seis', 'doze', 'ano', 'personalizado'] as const
export type Periodo = (typeof PERIODOS)[number]
export const PERIODO_LABELS: Record<Periodo, string> = {
  mes: 'Este mês', anterior: 'Mês anterior', tres: '3 meses', seis: '6 meses',
  doze: '12 meses', ano: 'Ano atual', personalizado: 'Período',
}

function recuar(mes: string, meses: number): string {
  const [ano, numero] = mes.split('-').map(Number)
  const data = new Date(ano ?? 2026, (numero ?? 1) - 1 - meses, 1)
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`
}

/** O primeiro e o último mês de um período, em `AAAA-MM`. */
export function limitesDoPeriodo(periodo: Periodo, mesAtual: string, personalizado?: { de: string; ate: string }): [string, string] {
  switch (periodo) {
    case 'anterior': { const anterior = recuar(mesAtual, 1); return [anterior, anterior] }
    case 'tres': return [recuar(mesAtual, 2), mesAtual]
    case 'seis': return [recuar(mesAtual, 5), mesAtual]
    case 'doze': return [recuar(mesAtual, 11), mesAtual]
    case 'ano': return [`${mesAtual.slice(0, 4)}-01`, mesAtual]
    case 'personalizado': return personalizado ? [personalizado.de, personalizado.ate] : [mesAtual, mesAtual]
    default: return [mesAtual, mesAtual]
  }
}

export function noPeriodo(lancamentos: readonly Lancamento[], [de, ate]: [string, string]): Lancamento[] {
  return lancamentos.filter((item) => {
    const mes = item.data.slice(0, 7)
    return mes >= de && mes <= ate
  })
}

export interface LinhaDeRelatorio {
  chave: string
  nome: string
  valor: Centavos
  percentual: number
  /** Quantos lançamentos formam esta linha. */
  quantidade: number
}

function agrupar(
  lancamentos: readonly Lancamento[],
  chaveDe: (item: Lancamento) => { chave: string; nome: string } | null,
): LinhaDeRelatorio[] {
  const total = somar(lancamentos.map(({ valor }) => valor))
  const mapa = new Map<string, { nome: string; valor: Centavos; quantidade: number }>()
  for (const item of lancamentos) {
    const identidade = chaveDe(item)
    if (!identidade) continue
    const atual = mapa.get(identidade.chave) ?? { nome: identidade.nome, valor: 0, quantidade: 0 }
    mapa.set(identidade.chave, { nome: identidade.nome, valor: atual.valor + item.valor, quantidade: atual.quantidade + 1 })
  }
  return [...mapa.entries()]
    .map(([chave, dados]) => ({ chave, ...dados, percentual: percentual(dados.valor, total) }))
    .sort((esquerda, direita) => direita.valor - esquerda.valor)
}

const saidasPagas = (lancamentos: readonly Lancamento[]) =>
  lancamentos.filter(({ natureza, situacao }) => natureza === 'saida' && situacao === 'paga')

export interface RelatorioDeEntradas {
  recebido: Centavos
  previsto: Centavos
  porIntegrante: LinhaDeRelatorio[]
  porCategoria: LinhaDeRelatorio[]
  fixas: Centavos
  variaveis: Centavos
}

export function relatorioDeEntradas(
  lancamentos: readonly Lancamento[],
  nomeDoIntegrante: (id: string | null) => string,
): RelatorioDeEntradas {
  const entradas = lancamentos.filter(({ natureza }) => natureza === 'entrada')
  const recebidas = entradas.filter(({ situacao }) => situacao === 'recebida')
  const renda = rendaPorIntegrante(lancamentos)
  const total = somar([...renda.values()])

  return {
    recebido: total,
    previsto: somar(entradas.filter(({ situacao }) => situacao === 'prevista').map(({ valor }) => valor)),
    porIntegrante: [...renda.entries()]
      .map(([id, valor]) => ({
        chave: id ?? 'familia', nome: nomeDoIntegrante(id), valor,
        percentual: percentual(valor, total),
        quantidade: recebidas.filter(({ integranteId }) => integranteId === id).length,
      }))
      .sort((esquerda, direita) => direita.valor - esquerda.valor),
    porCategoria: agrupar(recebidas, (item) => {
      const achado = acharSubcategoria(item.subcategoria)
      return achado ? { chave: achado.categoria.codigo, nome: achado.categoria.nome } : null
    }),
    fixas: somar(recebidas.filter(({ tipo }) => tipo === 'fixa').map(({ valor }) => valor)),
    variaveis: somar(recebidas.filter(({ tipo }) => tipo === 'variavel').map(({ valor }) => valor)),
  }
}

export interface RelatorioDeSaidas {
  total: Centavos
  pagas: Centavos
  pendentes: Centavos
  porCategoria: LinhaDeRelatorio[]
  porSubcategoria: LinhaDeRelatorio[]
  porIntegrante: LinhaDeRelatorio[]
  porFormaDePagamento: LinhaDeRelatorio[]
  porConta: LinhaDeRelatorio[]
  porCartao: LinhaDeRelatorio[]
  fixas: Centavos
  variaveis: Centavos
  parceladas: LinhaDeRelatorio[]
}

export function relatorioDeSaidas(
  lancamentos: readonly Lancamento[],
  nomeDoIntegrante: (id: string | null) => string,
  contas: readonly Conta[],
  cartoes: readonly Cartao[],
): RelatorioDeSaidas {
  const saidas = lancamentos.filter(({ natureza }) => natureza === 'saida')
  const pagas = saidasPagas(lancamentos)
  const tipos = fixasEVariaveis(lancamentos)

  return {
    total: somar(saidas.map(({ valor }) => valor)),
    pagas: somar(pagas.map(({ valor }) => valor)),
    pendentes: somar(saidas.filter(({ situacao }) => situacao === 'pendente').map(({ valor }) => valor)),
    porCategoria: paraOndeFoi(lancamentos).map((fatia) => ({
      chave: fatia.categoria, nome: fatia.nome, valor: fatia.valor, percentual: fatia.percentual,
      quantidade: pagas.filter((item) => acharSubcategoria(item.subcategoria)?.categoria.codigo === fatia.categoria).length,
    })),
    porSubcategoria: agrupar(pagas, (item) => {
      const achado = acharSubcategoria(item.subcategoria)
      return achado ? { chave: achado.subcategoria.codigo, nome: achado.subcategoria.nome } : null
    }),
    porIntegrante: agrupar(pagas, (item) => ({ chave: item.integranteId ?? 'familia', nome: nomeDoIntegrante(item.integranteId) })),
    porFormaDePagamento: agrupar(pagas, (item) => item.formaDePagamento
      ? { chave: item.formaDePagamento, nome: FORMA_DE_PAGAMENTO_LABELS[item.formaDePagamento] }
      : { chave: 'sem-forma', nome: 'Não informada' }),
    porConta: agrupar(pagas.filter(({ contaId }) => contaId), (item) => ({
      chave: item.contaId!, nome: contas.find(({ id }) => id === item.contaId)?.nome ?? 'Conta removida',
    })),
    porCartao: agrupar(pagas.filter(({ cartaoId }) => cartaoId), (item) => ({
      chave: item.cartaoId!, nome: cartoes.find(({ id }) => id === item.cartaoId)?.nome ?? 'Cartão removido',
    })),
    fixas: tipos.fixas,
    variaveis: tipos.variaveis,
    parceladas: agrupar(saidas.filter(({ parcelamento }) => parcelamento), (item) => ({
      chave: item.parcelamento!.serie, nome: item.descricao,
    })),
  }
}

export interface RelatorioDeDividas {
  /** O que ainda falta pagar de tudo que está parcelado. */
  saldo: Centavos
  /** Quanto sai por mês em parcelas. */
  mensal: Centavos
  parcelasRestantes: number
  /** `AAAA-MM` da última parcela conhecida. */
  ultimaParcela: string | null
  /** Quanto das entradas do período está comprometido com parcelas. */
  comprometimento: number
}

/**
 * O peso das dívidas.
 *
 * Sem score inventado: só o que sai por mês, o que falta e quanto disso pesa
 * sobre o que entra. Um número entre zero e cem que ninguém sabe como foi
 * calculado não ajuda a decidir nada.
 */
export function relatorioDeDividas(lancamentos: readonly Lancamento[], mesAtual: string): RelatorioDeDividas {
  const parcelas = lancamentos.filter(({ natureza, parcelamento }) => natureza === 'saida' && parcelamento)
  const emAberto = parcelas.filter(({ situacao }) => situacao === 'pendente')
  const doMes = emAberto.filter((item) => (item.vencimento || item.data).slice(0, 7) === mesAtual)
  const entradas = lancamentos.filter(({ natureza, situacao }) => natureza === 'entrada' && situacao === 'recebida')
  const renda = somar(entradas.map(({ valor }) => valor))
  const mensal = somar(doMes.map(({ valor }) => valor))
  const vencimentos = emAberto.map((item) => (item.vencimento || item.data).slice(0, 7)).sort()

  return {
    saldo: somar(emAberto.map(({ valor }) => valor)),
    mensal,
    parcelasRestantes: emAberto.length,
    ultimaParcela: vencimentos.at(-1) ?? null,
    comprometimento: percentual(mensal, renda),
  }
}

export interface RelatorioDeMetas {
  total: Centavos
  guardado: Centavos
  falta: Centavos
  linhas: Array<LinhaDeRelatorio & { objetivo: Centavos; especie: Meta['especie'] }>
}

export function relatorioDeMetas(metas: readonly Meta[], aportes: readonly Aporte[]): RelatorioDeMetas {
  const ativas = metas.filter(({ status }) => status !== 'cancelada')
  const linhas = ativas.map((meta) => {
    const objetivo = objetivoDaMeta(meta)
    const guardado = guardadoNaMeta(aportes, meta.id)
    return {
      chave: meta.id, nome: meta.nome, valor: guardado, objetivo, especie: meta.especie,
      percentual: percentual(guardado, objetivo),
      quantidade: aportes.filter(({ metaId }) => metaId === meta.id).length,
    }
  }).sort((esquerda, direita) => direita.objetivo - esquerda.objetivo)

  const total = somar(linhas.map(({ objetivo }) => objetivo))
  const guardado = somar(linhas.map(({ valor }) => valor))
  return { total, guardado, falta: Math.max(0, total - guardado), linhas }
}

export interface Patrimonio {
  ativos: Centavos
  passivos: Centavos
  liquido: Centavos
  porConta: LinhaDeRelatorio[]
}

/**
 * O patrimônio líquido.
 *
 * O saldo de cada conta é o saldo inicial mais o que entrou, menos o que saiu,
 * mais e menos as transferências. As transferências entram aqui — e só aqui —
 * porque mudar dinheiro de lugar altera o saldo de duas contas sem alterar o
 * patrimônio: é justamente o que a soma precisa enxergar para não errar.
 */
export function patrimonio(
  contas: readonly Conta[],
  lancamentos: readonly Lancamento[],
  transferencias: readonly Transferencia[],
  dividas: RelatorioDeDividas,
): Patrimonio {
  const porConta = contas.filter(({ ativa }) => ativa).map((conta) => {
    const entrou = somar(lancamentos.filter((item) => item.contaId === conta.id && item.natureza === 'entrada' && item.situacao === 'recebida').map(({ valor }) => valor))
    const saiu = somar(lancamentos.filter((item) => item.contaId === conta.id && item.natureza === 'saida' && item.situacao === 'paga').map(({ valor }) => valor))
    const recebeu = somar(transferencias.filter(({ destinoContaId }) => destinoContaId === conta.id).map(({ valor }) => valor))
    const mandou = somar(transferencias.filter(({ origemContaId }) => origemContaId === conta.id).map(({ valor }) => valor))
    return { conta, saldo: conta.saldoInicial + entrou - saiu + recebeu - mandou }
  })

  const ativos = somar(porConta.map(({ saldo }) => saldo))
  return {
    ativos,
    passivos: dividas.saldo,
    liquido: ativos - dividas.saldo,
    porConta: porConta
      .map(({ conta, saldo }) => ({
        chave: conta.id, nome: conta.nome, valor: saldo,
        percentual: percentual(saldo, ativos), quantidade: 0,
      }))
      .sort((esquerda, direita) => direita.valor - esquerda.valor),
  }
}

export interface FluxoFuturo {
  entradasPrevistas: Centavos
  saidasPrevistas: Centavos
  saldoProjetado: Centavos
  /** Quantos dias a projeção cobre. */
  dias: number
}

/**
 * O que está para acontecer nos próximos dias.
 *
 * Como o aplicativo já conhece as entradas previstas, as contas pendentes e as
 * parcelas geradas, a projeção não é adivinhação: é a soma do que já está
 * marcado no calendário.
 */
export function fluxoFuturo(lancamentos: readonly Lancamento[], hoje: string, dias = 30): FluxoFuturo {
  const limite = new Date(`${hoje}T12:00:00`)
  limite.setDate(limite.getDate() + dias)
  const ate = `${limite.getFullYear()}-${String(limite.getMonth() + 1).padStart(2, '0')}-${String(limite.getDate()).padStart(2, '0')}`

  const naJanela = (item: Lancamento) => {
    const quando = item.vencimento || item.data
    return quando >= hoje && quando <= ate
  }

  const entradasPrevistas = somar(lancamentos
    .filter((item) => item.natureza === 'entrada' && item.situacao === 'prevista' && naJanela(item))
    .map(({ valor }) => valor))
  const saidasPrevistas = somar(lancamentos
    .filter((item) => item.natureza === 'saida' && item.situacao === 'pendente' && naJanela(item))
    .map(({ valor }) => valor))

  return { entradasPrevistas, saidasPrevistas, saldoProjetado: entradasPrevistas - saidasPrevistas, dias }
}

export interface RelatorioFamiliar {
  renda: Centavos
  despesas: Centavos
  economia: Centavos
  taxaDeEconomia: number
  guardadoEmMetas: Centavos
  fixas: Centavos
  variaveis: Centavos
  comprometimentoComDividas: number
}

export function relatorioFamiliar(
  lancamentos: readonly Lancamento[],
  aportes: readonly Aporte[],
  dividas: RelatorioDeDividas,
): RelatorioFamiliar {
  const resumo = resumoDoMes(lancamentos)
  const tipos = fixasEVariaveis(lancamentos)
  return {
    renda: resumo.recebido,
    despesas: resumo.pago,
    economia: resumo.saldo,
    taxaDeEconomia: taxaDeEconomia(resumo),
    guardadoEmMetas: somar(aportes.map(({ valor }) => valor)),
    fixas: tipos.fixas,
    variaveis: tipos.variaveis,
    comprometimentoComDividas: dividas.comprometimento,
  }
}
