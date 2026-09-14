/**
 * O acompanhamento de um casamento.
 *
 * Um registro só, apontado por todos os caminhos: a visita com motivo
 * Casamento, o compromisso da cerimônia (e os de entrevista e ensaio) na
 * Agenda, e a aba Casamentos da Visitação. Os módulos guardam o identificador
 * deste registro; nenhum copia os dados dele.
 */

export const ETAPAS = [
  'primeiro_contato', 'aguardando_entrevista', 'entrevista_realizada', 'curso_em_andamento', 'aguardando_documentos',
  'aguardando_comissao', 'aguardando_confirmacao', 'pronto_para_agendar', 'agendado', 'realizado', 'cancelado',
] as const
export type EtapaDoCasamento = (typeof ETAPAS)[number]
export const ETAPA_LABELS: Record<EtapaDoCasamento, string> = {
  primeiro_contato: 'Primeiro contato', aguardando_entrevista: 'Aguardando entrevista', entrevista_realizada: 'Entrevista realizada',
  curso_em_andamento: 'Curso de noivos em andamento', aguardando_documentos: 'Aguardando documentos', aguardando_comissao: 'Aguardando comissão',
  aguardando_confirmacao: 'Aguardando confirmação', pronto_para_agendar: 'Pronto para agendar', agendado: 'Casamento agendado',
  realizado: 'Realizado', cancelado: 'Cancelado',
}

export type OrigemDoCasamento = 'casamentos' | 'visitacao' | 'agenda' | 'migracao'

/** Noiva ou noivo: pessoa cadastrada ou nome escrito, sem obrigar a ser membro. */
export interface NoivoDoCasamento {
  personId: string | null
  nome: string
  /** Igreja do distrito, quando é de uma. */
  igrejaId: string | null
  /** Igreja de fora do distrito, escrita. */
  igrejaNome: string
}

export const PERGUNTAS_DA_ENTREVISTA = [
  { id: 'vestuario', titulo: 'Vestuário e apresentação pessoal', texto: 'Ambos concordam em observar as orientações da Igreja quanto ao vestuário, maquiagem, joias e adornos durante a cerimônia, recomendando o mesmo aos familiares, padrinhos e testemunhas?' },
  { id: 'principios', titulo: 'Princípios da Igreja', texto: 'Ambos afirmam estar em harmonia com os princípios da Igreja e com os mandamentos, inclusive o sétimo mandamento?' },
  { id: 'recepcao', titulo: 'Recepção e princípios de saúde', texto: 'Ambos concordam que, na recepção, caso seja realizada, não serão servidas bebidas alcoólicas nem alimentos não aprovados pela Bíblia ou pelo Espírito de Profecia?' },
  { id: 'ornamentacao', titulo: 'Ornamentação da igreja', texto: 'Ambos estão cientes de que a ornamentação ficará sob a responsabilidade dos noivos e familiares e que todos os arranjos deverão ser retirados após a cerimônia?' },
  { id: 'curso', titulo: 'Curso de noivos', texto: 'O casal concluiu satisfatoriamente o Curso de Noivos?' },
] as const
export type PerguntaDaEntrevista = (typeof PERGUNTAS_DA_ENTREVISTA)[number]['id']
/** A quinta pergunta não é guardada na entrevista: ela é a situação do curso, para as duas nunca se contradizerem. */
export type PerguntaGuardada = Exclude<PerguntaDaEntrevista, 'curso'>
export type SimNao = 'sim' | 'nao' | null

export type SituacaoDoCurso = 'nao_iniciado' | 'em_andamento' | 'concluido'
export const SITUACAO_DO_CURSO_LABELS: Record<SituacaoDoCurso, string> = { nao_iniciado: 'Não iniciado', em_andamento: 'Em andamento', concluido: 'Concluído' }

export interface EntrevistaPastoral {
  id: string
  data: string
  realizadaPor: string
  respostas: Record<PerguntaGuardada, SimNao>
  /** Como estava o curso quando a entrevista foi registrada, para o histórico. */
  cursoNaData: SituacaoDoCurso | null
  visitaId: string | null
  registradaEm: string
}

export interface CursoDeNoivos { situacao: SituacaoDoCurso | null; dataConclusao: string; local: string; responsavel: string }

export type SituacaoDaComissao = 'pendente' | 'recomendada' | 'nao_recomendada'
export const SITUACAO_DA_COMISSAO_LABELS: Record<SituacaoDaComissao, string> = { pendente: 'Pendente', recomendada: 'Recomendada', nao_recomendada: 'Não recomendada' }
export type SituacaoDaCarta = 'pendente' | 'recebida' | 'emitida'
export const SITUACAO_DA_CARTA_LABELS: Record<SituacaoDaCarta, string> = { pendente: 'Pendente', recebida: 'Recebida', emitida: 'Emitida' }

export interface ComissaoDoCasamento {
  igrejaId: string | null
  meetingId: string | null
  situacao: SituacaoDaComissao
  data: string
  voto: string
  precisaCarta: boolean | null
  carta: SituacaoDaCarta | null
}

export const ITENS_MANUAIS = ['certidao', 'oficiante', 'local', 'programa', 'musicas'] as const
export type ItemManual = (typeof ITENS_MANUAIS)[number]
export type SituacaoDoItem = 'pendente' | 'concluido' | 'nao_se_aplica'
export const SITUACAO_DO_ITEM_LABELS: Record<SituacaoDoItem, string> = { pendente: 'Pendente', concluido: 'Concluído', nao_se_aplica: 'Não se aplica' }
export interface ItemDoChecklist { situacao: SituacaoDoItem; data: string }

export interface OrientacoesAoCasal { apresentadas: boolean | null; data: string; apresentadasPor: string }

export interface EventoDoHistorico { id: string; em: string; texto: string }

export interface CasamentoData {
  noiva: NoivoDoCasamento
  noivo: NoivoDoCasamento
  contato: string
  primeiroContato: string
  dataSolicitacao: string
  /** O que o casal pretende; não é cerimônia confirmada. */
  dataPretendida: string
  /** Igreja ou local que o casal pretende, antes de confirmar. */
  igrejaPretendidaId: string | null
  localPretendido: string
  /** O que está confirmado. Com compromisso na Agenda, os dois lados se mantêm iguais. */
  cerimonia: { data: string; inicio: string; fim: string; igrejaId: string | null; local: string }
  pastorResponsavel: string
  pastorOficiante: string
  civil: { data: string; cartorio: string; efeitoCivil: boolean | null }
  ensaio: { data: string; inicio: string; local: string }
  curso: CursoDeNoivos
  comissao: ComissaoDoCasamento
  entrevistas: EntrevistaPastoral[]
  checklist: Record<ItemManual, ItemDoChecklist>
  orientacoes: OrientacoesAoCasal
  /** Escolhida pelo pastor. O aplicativo sugere, nunca avança sozinho. */
  etapa: EtapaDoCasamento
  historico: EventoDoHistorico[]
  origem: OrigemDoCasamento
  createdAt: string
  updatedAt: string
}

export interface CasamentoEntity extends CasamentoData { id: string }

export type PapelNoCasamento = 'cerimonia' | 'entrevista' | 'ensaio'
