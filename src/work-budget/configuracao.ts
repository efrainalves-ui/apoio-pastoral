import type { Centavos } from '../family-budget/dinheiro'
import type { BaseDeCalculo, ValorComVigencia } from './parametros'

/**
 * A configuração do Trabalho de um pastor.
 *
 * Nada aqui é obrigatório para começar. O módulo pede o parâmetro quando ele
 * faz falta a um cálculo específico — exigir dezoito campos na primeira tela é
 * como se garante que ninguém chegue à segunda.
 *
 * Nenhum valor de nenhum pastor é escrito no código. FPE, Percentual de Audit,
 * tetos e percentuais são todos configuração, e todos têm vigência.
 */

export const CONDICOES_MINISTERIAIS = ['ordenado', 'aspirante', 'outra'] as const
export type CondicaoMinisterial = (typeof CONDICOES_MINISTERIAIS)[number]
export const CONDICAO_LABELS: Record<CondicaoMinisterial, string> = {
  ordenado: 'Ordenado', aspirante: 'Aspirante', outra: 'Outra',
}

export const TIPOS_DE_MORADIA = ['casa_pastoral', 'alugada', 'propria', 'outra'] as const
export type TipoDeMoradia = (typeof TIPOS_DE_MORADIA)[number]
export const TIPO_DE_MORADIA_LABELS: Record<TipoDeMoradia, string> = {
  casa_pastoral: 'Casa pastoral da obra', alugada: 'Imóvel alugado',
  propria: 'Imóvel próprio', outra: 'Outra situação',
}

/**
 * Quem paga cada conta da casa.
 *
 * O tipo de moradia e quem paga a conta são coisas separadas: morar em casa
 * pastoral não diz se a energia é da obra ou do pastor, e é a segunda pergunta
 * que decide o reembolso.
 */
export const RESPONSABILIDADES = [
  'nao_se_aplica', 'paga_pela_obra', 'reembolso_integral', 'reembolso_parcial', 'do_pastor',
] as const
export type Responsabilidade = (typeof RESPONSABILIDADES)[number]
export const RESPONSABILIDADE_LABELS: Record<Responsabilidade, string> = {
  nao_se_aplica: 'Não se aplica',
  paga_pela_obra: 'Paga diretamente pela obra',
  reembolso_integral: 'Pago pelo pastor, reembolso integral',
  reembolso_parcial: 'Pago pelo pastor, reembolso parcial',
  do_pastor: 'Responsabilidade do pastor',
}

export interface RegraDeItem {
  responsabilidade: Responsabilidade
  /** Percentual reembolsado, quando parcial. */
  percentual: number | null
  /** Teto absoluto em centavos, quando houver. */
  teto: Centavos | null
  tetoPercentual: number | null
  tetoBase: BaseDeCalculo | null
  /**
   * Chave do teto compartilhado com outros itens.
   *
   * Internet e telefone com a mesma chave dividem um teto só — que é como o
   * limite conjunto deixa de ser concedido duas vezes.
   */
  limiteConjunto: string
  referencia: string
  vigenciaInicio: string
}

export function regraDeItemVazia(): RegraDeItem {
  return {
    responsabilidade: 'do_pastor', percentual: null, teto: null,
    tetoPercentual: null, tetoBase: null, limiteConjunto: '', referencia: '', vigenciaInicio: '',
  }
}

export const SITUACOES_DE_AGUA = ['tem_conta', 'poco_sem_conta', 'outra'] as const
export type SituacaoDeAgua = (typeof SITUACOES_DE_AGUA)[number]
export const SITUACAO_DE_AGUA_LABELS: Record<SituacaoDeAgua, string> = {
  tem_conta: 'Tem conta de água', poco_sem_conta: 'Poço, sem conta de água', outra: 'Outra situação',
}

export interface LimiteConjunto {
  chave: string
  nome: string
  teto: Centavos
  tetoPercentual: number | null
  tetoBase: BaseDeCalculo | null
  referencia: string
  vigenciaInicio: string
}

export interface ConfiguracaoDoTrabalhoData {
  pais: string
  moeda: string
  uniao: string
  campo: string
  instituicao: string
  funcao: string
  condicao: CondicaoMinisterial
  credencial: string
  dataDeIngresso: string

  /** FPE ao longo do tempo. Nunca um número solto. */
  fpe: Array<ValorComVigencia<Centavos>>
  /**
   * Percentual individual do FPE atribuído ao obreiro para cálculo da
   * subsistência. Varia entre obreiros, instituições e períodos — nunca é um
   * percentual universal da função.
   */
  percentualDeAudit: Array<ValorComVigencia<number>>

  tipoDeMoradia: TipoDeMoradia
  situacaoDeAgua: SituacaoDeAgua
  /** Regra por item da casa: aluguel, condomínio, energia, água, internet… */
  regrasPorItem: Record<string, RegraDeItem>
  limitesConjuntos: LimiteConjunto[]

  createdAt: string
  updatedAt: string
}

export type ConfiguracaoDoTrabalho = ConfiguracaoDoTrabalhoData & { id: string }

export function configuracaoVazia(): ConfiguracaoDoTrabalhoData {
  return {
    pais: 'Brasil', moeda: 'BRL', uniao: '', campo: '', instituicao: '', funcao: '',
    condicao: 'ordenado', credencial: '', dataDeIngresso: '',
    fpe: [], percentualDeAudit: [],
    tipoDeMoradia: 'outra', situacaoDeAgua: 'tem_conta',
    regrasPorItem: {}, limitesConjuntos: [],
    createdAt: '', updatedAt: '',
  }
}

/**
 * Copia a configuração para um novo ano.
 *
 * O que se repete vem junto — Campo, função, regras da casa. O que precisa ser
 * confirmado a cada ano não vem: FPE e Percentual de Audit ficam com o
 * histórico, e o novo valor é informado com a vigência dele.
 */
export function copiarConfiguracao(origem: ConfiguracaoDoTrabalhoData): ConfiguracaoDoTrabalhoData {
  return {
    ...origem,
    regrasPorItem: Object.fromEntries(Object.entries(origem.regrasPorItem).map(([chave, regra]) => [chave, { ...regra }])),
    limitesConjuntos: origem.limitesConjuntos.map((limite) => ({ ...limite })),
    fpe: [...origem.fpe],
    percentualDeAudit: [...origem.percentualDeAudit],
    createdAt: '', updatedAt: '',
  }
}

export const VINCULOS_DE_DEPENDENTE = ['filho', 'conjuge', 'outro'] as const
export type VinculoDeDependente = (typeof VINCULOS_DE_DEPENDENTE)[number]

export interface DependenteData {
  nome: string
  vinculo: VinculoDeDependente
  dataDeNascimento: string
  /** Depende do obreiro para efeito dos benefícios. */
  dependente: boolean
  nivelDeEnsino: string
  instituicao: string
  matriculaVigenteAte: string
  /** Bolsa concedida por instituição adventista, que muda a quota-pais. */
  temBolsaInstitucional: boolean
  observacao: string
  createdAt: string
  updatedAt: string
}

export type Dependente = DependenteData & { id: string }

/**
 * A quota-pais do REA Y 20 45 S.
 *
 * Muda no mês seguinte ao nono aniversário, e termina no mês do décimo oitavo.
 * Quando há bolsa de instituição adventista nos mesmos meses, os percentuais
 * são menores — porque o benefício já veio por outro caminho, e concedê-lo
 * inteiro seria pagar duas vezes pela mesma coisa.
 */
export interface QuotaPais {
  percentual: number | null
  elegivel: boolean
  motivo: string
}

export function quotaPais(
  dependente: Pick<DependenteData, 'dataDeNascimento' | 'dependente' | 'temBolsaInstitucional'>,
  competencia: string,
  percentuais = { ate9: 3, apos9: 5, ate9ComBolsa: 1, apos9ComBolsa: 3 },
): QuotaPais {
  if (!dependente.dependente) return { percentual: null, elegivel: false, motivo: 'Não consta como dependente.' }
  if (!dependente.dataDeNascimento) return { percentual: null, elegivel: false, motivo: 'Data de nascimento não informada.' }

  const [anoNascimento, mesNascimento] = dependente.dataDeNascimento.split('-').map(Number)
  const [ano, mes] = competencia.split('-').map(Number)
  if (!anoNascimento || !mesNascimento || !ano || !mes) return { percentual: null, elegivel: false, motivo: 'Datas incompletas.' }

  const mesesDeVida = (ano - anoNascimento) * 12 + (mes - mesNascimento)
  if (mesesDeVida < 0) return { percentual: null, elegivel: false, motivo: 'Ainda não nascido nesta competência.' }
  if (mesesDeVida > 18 * 12) return { percentual: null, elegivel: false, motivo: 'Passou do mês do 18º aniversário.' }

  const comBolsa = dependente.temBolsaInstitucional
  // Até o mês do nono aniversário vale o percentual menor; a partir do seguinte, o maior.
  const ateONono = mesesDeVida <= 9 * 12
  const percentual = ateONono
    ? (comBolsa ? percentuais.ate9ComBolsa : percentuais.ate9)
    : (comBolsa ? percentuais.apos9ComBolsa : percentuais.apos9)

  return {
    percentual,
    elegivel: true,
    motivo: comBolsa ? 'Percentual reduzido: há bolsa de instituição adventista.' : '',
  }
}
