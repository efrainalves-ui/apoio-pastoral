import { mesesEntre } from './calculos'
import type { Centavos } from './dinheiro'
import { somar } from './dinheiro'

/**
 * Metas, fundos e reserva: o dinheiro que se guarda.
 *
 * Guardar não é gastar. Transferir quinhentos da corrente para a reserva não
 * deixou a família mais pobre — o dinheiro mudou de lugar dentro da própria
 * casa. Por isso aporte em meta não é lançamento de saída e não entra em "para
 * onde o dinheiro foi": misturar as duas coisas faria a taxa de economia
 * castigar justamente quem economiza.
 */

export const MODELOS_DE_META = [
  ['seguranca', 'Segurança financeira', ['Reserva de emergência', 'Guardar dinheiro', 'Quitar dívida', 'Quitar cartão', 'Quitar empréstimo']],
  ['casa', 'Casa', ['Entrada da casa própria', 'Comprar casa', 'Construção', 'Reforma', 'Móveis', 'Eletrodomésticos', 'Mudança']],
  ['transporte', 'Transporte', ['Comprar carro', 'Comprar moto', 'Trocar veículo', 'Manutenção do veículo', 'IPVA/licenciamento', 'Seguro']],
  ['familia', 'Família', ['Enxoval/bebê', 'Aniversário', 'Casamento', 'Natal', 'Projeto familiar']],
  ['educacao', 'Educação', ['Faculdade', 'Curso', 'Intercâmbio', 'Pós-graduação', 'Equipamento para estudo', 'Educação dos filhos']],
  ['experiencias', 'Experiências', ['Viagem', 'Férias', 'Evento', 'Projeto missionário']],
  ['patrimonio', 'Patrimônio', ['Investimentos', 'Imóvel', 'Veículo', 'Computador', 'Celular/eletrônico']],
  ['futuro', 'Futuro', ['Aposentadoria', 'Fundo para os filhos', 'Faculdade dos filhos', 'Patrimônio familiar']],
  ['generosidade', 'Generosidade', ['Doação', 'Projeto da igreja', 'Missão', 'Ajuda a alguém']],
] as const

export type CategoriaDeMeta = (typeof MODELOS_DE_META)[number][0] | 'personalizada'

export const STATUS_DE_META = ['ativa', 'alcancada', 'pausada', 'cancelada'] as const
export type StatusDeMeta = (typeof STATUS_DE_META)[number]
export const STATUS_DE_META_LABELS: Record<StatusDeMeta, string> = {
  ativa: 'Ativa', alcancada: 'Alcançada', pausada: 'Pausada', cancelada: 'Cancelada',
}

/**
 * Uma meta é sempre uma meta; o que muda é o que ela representa.
 *
 * Fundo planejado e reserva de emergência não são estruturas diferentes: são
 * metas com uma conta própria por trás. O fundo sabe quando a despesa vence e
 * divide o valor pelos meses que faltam; a reserva sabe quantos meses de
 * despesa essencial quer cobrir. Criar três tabelas para isso daria três
 * lugares para o mesmo aporte se perder.
 */
export type EspecieDeMeta = 'meta' | 'fundo' | 'reserva'

export interface MetaData {
  especie: EspecieDeMeta
  nome: string
  categoria: CategoriaDeMeta
  /** De quem é a meta. Nulo quando é da família. */
  integranteId: string | null
  objetivo: Centavos
  dataInicial: string
  /** `AAAA-MM` do prazo, ou vazio quando não há. */
  prazo: string
  contribuicaoPlanejada: Centavos
  contaId: string | null
  /** Só para reserva: quantos meses de despesa essencial cobrir. */
  mesesDeReserva: number
  /** Só para reserva: a despesa essencial média informada. */
  despesaEssencial: Centavos
  observacao: string
  status: StatusDeMeta
  createdAt: string
  updatedAt: string
}

export type Meta = MetaData & { id: string }

export interface AporteData {
  metaId: string
  valor: Centavos
  data: string
  contaId: string | null
  integranteId: string | null
  observacao: string
  createdAt: string
  updatedAt: string
}

export type Aporte = AporteData & { id: string }

/** O objetivo de uma reserva vem da despesa essencial vezes os meses. */
export function objetivoDaMeta(meta: MetaData): Centavos {
  if (meta.especie === 'reserva' && meta.despesaEssencial > 0 && meta.mesesDeReserva > 0) {
    return meta.despesaEssencial * meta.mesesDeReserva
  }
  return meta.objetivo
}

export function guardadoNaMeta(aportes: readonly Aporte[], metaId: string): Centavos {
  return somar(aportes.filter((aporte) => aporte.metaId === metaId).map(({ valor }) => valor))
}

export interface PrevisaoDaMeta {
  /** Quanto ainda falta. */
  falta: Centavos
  /** Quanto seria preciso guardar por mês para chegar no prazo. */
  necessarioPorMes: Centavos | null
  /** Em quantos meses chega mantendo a contribuição atual. */
  mesesNoRitmoAtual: number | null
  /** `AAAA-MM` em que chegaria no ritmo atual. */
  conclusaoNoRitmoAtual: string | null
  /** A contribuição atual dá conta do prazo? */
  noRitmo: boolean
}

/**
 * Quando a meta é alcançada mantendo o que se guarda hoje.
 *
 * As duas contas respondem perguntas diferentes: "quanto precisaria guardar" é
 * o que o prazo exige; "quando chego assim" é o que a realidade entrega. Mostrar
 * só a primeira faz a meta parecer viável quando não é.
 */
export function preverMeta(
  meta: MetaData,
  guardado: Centavos,
  hoje: string,
): PrevisaoDaMeta {
  const objetivo = objetivoDaMeta(meta)
  const falta = Math.max(0, objetivo - guardado)
  const mesesAtePrazo = meta.prazo ? mesesEntre(hoje.slice(0, 7), meta.prazo) : null
  const necessarioPorMes = mesesAtePrazo !== null && mesesAtePrazo > 0 ? Math.ceil(falta / mesesAtePrazo) : null

  const ritmo = meta.contribuicaoPlanejada
  const mesesNoRitmoAtual = falta === 0 ? 0 : ritmo > 0 ? Math.ceil(falta / ritmo) : null
  const conclusaoNoRitmoAtual = mesesNoRitmoAtual === null ? null : somarMeses(hoje.slice(0, 7), mesesNoRitmoAtual)

  return {
    falta,
    necessarioPorMes,
    mesesNoRitmoAtual,
    conclusaoNoRitmoAtual,
    noRitmo: necessarioPorMes === null || (ritmo > 0 && ritmo >= necessarioPorMes),
  }
}

export function somarMeses(mes: string, quantidade: number): string {
  const [ano, numero] = mes.split('-').map(Number)
  if (!ano || !numero) return mes
  const data = new Date(ano, numero - 1 + quantidade, 1)
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`
}

/**
 * Quanto guardar por mês num fundo planejado.
 *
 * IPVA de dois mil e quatrocentos que vence em doze meses são duzentos por mês.
 * O fundo existe para que a despesa previsível deixe de ser um susto anual.
 */
export function reservaMensalDoFundo(meta: MetaData, guardado: Centavos, hoje: string): Centavos | null {
  const falta = Math.max(0, objetivoDaMeta(meta) - guardado)
  if (!meta.prazo) return null
  const meses = mesesEntre(hoje.slice(0, 7), meta.prazo)
  return meses > 0 ? Math.ceil(falta / meses) : null
}

export interface PlanejamentoData {
  /** `AAAA-MM` do mês planejado. */
  mes: string
  /** Renda prevista por integrante. A chave vazia é a família. */
  rendaPrevista: Record<string, Centavos>
  /** Quanto se pretende gastar em cada categoria do catálogo. */
  orcamento: Record<string, Centavos>
  createdAt: string
  updatedAt: string
}

export type Planejamento = PlanejamentoData & { id: string }

export interface TotaisDoPlanejamento {
  renda: Centavos
  planejado: Centavos
  /** Renda menos o que já foi distribuído. Negativo quando o plano estoura. */
  aDistribuir: Centavos
  estourou: boolean
}

export function totaisDoPlanejamento(planejamento: PlanejamentoData): TotaisDoPlanejamento {
  const renda = somar(Object.values(planejamento.rendaPrevista))
  const planejado = somar(Object.values(planejamento.orcamento))
  return { renda, planejado, aDistribuir: renda - planejado, estourou: planejado > renda }
}

/**
 * O planejamento do mês anterior, pronto para virar o deste.
 *
 * Quem planeja todo mês repete quase tudo: o aluguel é o mesmo, a escola é a
 * mesma. Recomeçar do zero é o que faz a pessoa desistir de planejar no
 * segundo mês.
 */
export function copiarPlanejamento(origem: PlanejamentoData, paraOMes: string): PlanejamentoData {
  return {
    mes: paraOMes,
    rendaPrevista: { ...origem.rendaPrevista },
    orcamento: { ...origem.orcamento },
    createdAt: '',
    updatedAt: '',
  }
}
