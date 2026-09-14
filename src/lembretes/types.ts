/**
 * A Central de Lembretes.
 *
 * Três registros cifrados, sincronizados como qualquer outro do cofre:
 *
 * - `reminder`: o lembrete criado à mão. Uma série recorrente é um registro só;
 *   cada ocorrência concluída, pulada ou alterada fica marcada dentro dele pela
 *   data original. Assim a próxima ocorrência é calculada, e não criada — dois
 *   aparelhos não conseguem gerar duas.
 * - `reminder_list`: as listas do usuário.
 * - `reminder_meta`: o pouco que a Central acrescenta a uma tarefa que mora em
 *   outra área (bandeira, prioridade, adiamento, lista), ligado ao identificador
 *   da origem. O conteúdo da tarefa continua só na origem.
 */

export const PRIORIDADES = ['normal', 'importante', 'urgente'] as const
export type PrioridadeDoLembrete = (typeof PRIORIDADES)[number]
export const PRIORIDADE_LABELS: Record<PrioridadeDoLembrete, string> = { normal: 'Normal', importante: 'Importante', urgente: 'Urgente' }

export const FREQUENCIAS = ['diaria', 'semanal', 'mensal', 'anual'] as const
export type Frequencia = (typeof FREQUENCIAS)[number]

export interface RegraDeRepeticao {
  frequencia: Frequencia
  /** A cada quantos dias, semanas, meses ou anos. */
  intervalo: number
  /** Semanal: 0 = domingo … 6 = sábado. Sem dias, vale o dia da semana do início. */
  diasDaSemana?: number[]
  /** Mensal: o dia do mês. Sem dia, vale o dia do início. Dia que o mês não tem vira o último dia. */
  diaDoMes?: number
  /** Última data que ainda pode ter ocorrência (inclusive). */
  ate?: string | null
}

/** O que muda só numa ocorrência. */
export interface AlteracaoDeOcorrencia {
  data?: string
  hora?: string
  titulo?: string
  prioridade?: PrioridadeDoLembrete
  sinalizado?: boolean
}

export interface RegistroDeOcorrencia {
  estado?: 'concluida' | 'pulada'
  concluidaEm?: string
  alteracao?: AlteracaoDeOcorrencia
}

export interface RelacionadoAoLembrete {
  area?: string | null
  churchId?: string | null
  personId?: string | null
}

export interface LembreteData {
  titulo: string
  observacao: string
  listaId: string | null
  /** `YYYY-MM-DD`; vazio quando o lembrete não tem data. Numa série, é o início. */
  data: string
  /** `HH:MM`; vazio quando não tem horário. */
  hora: string
  /** Fuso em que data e hora foram escolhidas. */
  fuso: string
  prioridade: PrioridadeDoLembrete
  sinalizado: boolean
  repeticao: RegraDeRepeticao | null
  notificar: boolean
  relacionado: RelacionadoAoLembrete
  /** Para lembrete sem repetição. Numa série, o estado vive em `ocorrencias`. */
  estado: 'aberto' | 'concluido'
  concluidoEm: string | null
  /** Por data original da ocorrência. */
  ocorrencias: Record<string, RegistroDeOcorrencia>
  createdAt: string
  updatedAt: string
}
export interface LembreteEntity extends LembreteData { id: string }

export const CORES_DE_LISTA = {
  vermelho: '#E5484D', laranja: '#F76B15', amarelo: '#E5A000', verde: '#18806A', turquesa: '#0891B2',
  azul: '#1769E8', indigo: '#4F46E5', roxo: '#7C3AED', rosa: '#DB2777', grafite: '#5A646D',
} as const
export type CorDeLista = keyof typeof CORES_DE_LISTA

export const ICONES_DE_LISTA = ['pessoa', 'repetir', 'carrinho', 'lista', 'coracao', 'livro', 'igreja', 'casa', 'estrela', 'sino', 'bandeira', 'maleta'] as const
export type IconeDeLista = (typeof ICONES_DE_LISTA)[number]

export type SementeDeLista = 'pessoal' | 'rotinas' | 'compras'

export interface ListaDeLembretesData {
  nome: string
  descricao: string
  icone: IconeDeLista
  cor: CorDeLista
  ordem: number
  arquivada: boolean
  /** Listas criadas pelo aplicativo na primeira vez; o usuário pode editar e excluir. */
  semente: SementeDeLista | null
  createdAt: string
  updatedAt: string
}
export interface ListaDeLembretesEntity extends ListaDeLembretesData { id: string }

export interface MetadadosDeTarefaData {
  /** Identificador estável da tarefa na área de origem, por exemplo `task:<id>`. */
  origem: string
  sinalizado: boolean
  prioridade: PrioridadeDoLembrete | null
  adiadaPara: { data: string; hora: string } | null
  listaId: string | null
  createdAt: string
  updatedAt: string
}
export interface MetadadosDeTarefaEntity extends MetadadosDeTarefaData { id: string }

export const LISTAS_INICIAIS: ReadonlyArray<Pick<ListaDeLembretesData, 'nome' | 'descricao' | 'icone' | 'cor' | 'ordem'> & { semente: SementeDeLista }> = [
  { semente: 'pessoal', nome: 'Pessoal', descricao: 'Saúde, família e compromissos particulares', icone: 'pessoa', cor: 'rosa', ordem: 1 },
  { semente: 'rotinas', nome: 'Rotinas', descricao: 'Relatório, itinerário e outros lembretes que se repetem', icone: 'repetir', cor: 'azul', ordem: 2 },
  { semente: 'compras', nome: 'Compras', descricao: 'Itens pessoais e do distrito', icone: 'carrinho', cor: 'amarelo', ordem: 3 },
]
