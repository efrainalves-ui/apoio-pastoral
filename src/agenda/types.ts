import type { SermonSnapshot } from '../sermons/types'
export const AGENDA_CATEGORIES = ['visit', 'preaching', 'committee', 'meeting', 'bible_study', 'baptism', 'communion', 'wedding', 'child_dedication', 'training', 'event', 'travel', 'council', 'pgp', 'personal', 'other'] as const
export type AgendaCategory = (typeof AGENDA_CATEGORIES)[number]

export const AGENDA_CATEGORY_LABELS: Record<AgendaCategory, string> = {
  visit: 'Visita', preaching: 'Pregação', committee: 'Comissão', meeting: 'Reunião', bible_study: 'Estudo Bíblico', baptism: 'Batismo', communion: 'Ceia do Senhor', wedding: 'Casamento', child_dedication: 'Dedicação de criança', training: 'Treinamento', event: 'Evento', travel: 'Viagem', council: 'Concílio', pgp: 'PGP', personal: 'Pessoal', other: 'Outro',
}

/**
 * O que se pode criar hoje.
 *
 * `travel` e `pgp` continuam em `AGENDA_CATEGORIES` porque há compromissos
 * antigos gravados com eles: tirá-los do tipo faria esses registros deixarem de
 * abrir. Viagem continua visível na agenda e no histórico, mas não se cria mais;
 * PGP virou subtipo de Concílio, e os antigos são migrados.
 */
export const NEW_EVENT_CATEGORIES = AGENDA_CATEGORIES.filter((category) => category !== 'travel' && category !== 'pgp')

/** Reunião, Treinamento, Evento e Concílio perguntam a mesma coisa. */
export const ENCONTRO_CATEGORIES = ['meeting', 'training', 'event', 'council'] as const
export type EncontroCategory = (typeof ENCONTRO_CATEGORIES)[number]
export const isEncontroCategory = (category: AgendaCategory): category is EncontroCategory =>
  (ENCONTRO_CATEGORIES as readonly string[]).includes(category)

export type FormatoDoEncontro = 'presencial' | 'online'
export type AlcanceDoEncontro = 'distrital' | 'igreja' | 'departamento'
export type PublicoDistrital = 'todos_lideres' | 'lideres_departamentos' | 'administrativo' | 'pastores_anciaos' | 'outro'
export const PUBLICO_DISTRITAL_LABELS: Record<PublicoDistrital, string> = {
  todos_lideres: 'Todos os líderes', lideres_departamentos: 'Líderes de departamentos', administrativo: 'Administrativo',
  pastores_anciaos: 'Pastores e anciãos', outro: 'Outro público',
}
export type TipoDeConcilio = 'concilio' | 'pgp'

export interface DetalhesDoEncontro {
  formato: FormatoDoEncontro | null
  alcance: AlcanceDoEncontro | null
  publico: PublicoDistrital | null
  publicoOutro: string
  departamento: string
  /** Só em Concílio. */
  tipoConcilio?: TipoDeConcilio | null
}

/** Onde uma pregação acontece. */
export type EscolhaDeIgreja = 'uma' | 'todas' | 'varias' | 'outra'

export type TipoDeComissao = 'diretiva' | 'administrativa' | 'nomeacoes' | 'outra'
export const TIPO_DE_COMISSAO_LABELS: Record<TipoDeComissao, string> = {
  diretiva: 'Comissão Diretiva', administrativa: 'Comissão Administrativa', nomeacoes: 'Comissão de Nomeações', outra: 'Outra comissão',
}
export type AndamentoDaPauta = 'pendente' | 'em_andamento' | 'concluida'
export interface PautaDeComissao { id: string; titulo: string; andamento: AndamentoDaPauta }
export interface DetalhesDaComissao {
  tipo: TipoDeComissao | null
  outraNome: string
  /** Vínculo estável com a reunião criada no módulo de Comissões. */
  meetingId?: string | null
  /** Vínculo com o processo de nomeações da igreja, quando houver. */
  processId?: string | null
  /** "Outra comissão" não tem módulo próprio: a pauta mora no compromisso. */
  pautas?: PautaDeComissao[]
}

export type PapelNaCeia = 'primeiro_diacono' | 'primeira_diaconisa' | 'outro'
export interface ResponsavelDaCeia { papel: PapelNaCeia; personId: string | null; nome: string }
export type ItemDaCeia = 'bacias' | 'panos' | 'pao' | 'vinho' | 'outro'
export const ITEM_DA_CEIA_LABELS: Record<ItemDaCeia, string> = { bacias: 'Bacias', panos: 'Panos', pao: 'Pão', vinho: 'Vinho', outro: 'Outro' }
export interface MaterialDaCeia { item: ItemDaCeia; quantidade: number | null; outro: string }
export interface DetalhesDaCeia {
  responsaveis: ResponsavelDaCeia[]
  materiaisCompletos: boolean | null
  precisaProvidenciar: boolean | null
  materiais: MaterialDaCeia[]
}

export interface DetalhesDoCasamento {
  noivo: string
  noiva: string
  cursoDeNoivos: boolean | null
  passouPelaComissao: boolean | null
  dataCivil: string
  /** A data religiosa é o dia do compromisso; fica aqui para a ficha do casal. */
  dataReligiosa: string
}

export interface ResponsavelPelaCrianca { personId: string | null; nome: string }
export interface DetalhesDaDedicacao { crianca: string; responsaveis: ResponsavelPelaCrianca[] }

export type ComoDoPessoal = 'presencial' | 'online' | 'telefone' | 'outra'
export interface DetalhesDoPessoal {
  categoria: string
  subcategoria: string
  outro: string
  oQue: string
  onde: string
  como: ComoDoPessoal | null
  comoOutro: string
}

export const CATEGORIAS_PESSOAIS: ReadonlyArray<{ id: string; label: string; subcategorias: readonly string[] }> = [
  { id: 'saude', label: 'Saúde', subcategorias: ['Consulta', 'Exame', 'Dentista', 'Terapia', 'Farmácia', 'Outro'] },
  { id: 'filhos', label: 'Filhos', subcategorias: ['Escola', 'Reunião escolar', 'Consulta', 'Atividade', 'Levar ou buscar', 'Outro'] },
  { id: 'compras', label: 'Compras', subcategorias: ['Mercado', 'Compras pessoais', 'Materiais para igreja', 'Farmácia', 'Outro'] },
  { id: 'cuidados', label: 'Cuidados pessoais', subcategorias: ['Cortar cabelo', 'Barbeiro ou salão', 'Outro'] },
  { id: 'casa', label: 'Casa', subcategorias: [] },
  { id: 'banco', label: 'Banco e documentos', subcategorias: [] },
  { id: 'pagamentos', label: 'Pagamentos', subcategorias: [] },
  { id: 'estudos', label: 'Estudos', subcategorias: [] },
  { id: 'transporte', label: 'Transporte ou manutenção', subcategorias: [] },
  { id: 'outro', label: 'Outro', subcategorias: [] },
]

export const CEREMONY_CATEGORIES = ['baptism', 'communion', 'wedding', 'child_dedication'] as const
export type CeremonyCategory = (typeof CEREMONY_CATEGORIES)[number]
export interface CeremonyDetails { responsible: string; involvedPersonIds: string[]; childPersonId: string | null; parentPersonIds: string[]; checklist: Record<string, boolean> }
export const CEREMONY_CHECKLISTS: Record<CeremonyCategory, Array<{ id: string; label: string }>> = {
  baptism: [{ id: 'study_completed', label: 'Estudo concluído' }, { id: 'date_confirmed', label: 'Data confirmada' }, { id: 'materials_ready', label: 'Materiais preparados' }, { id: 'post_record', label: 'Registro posterior' }],
  communion: [{ id: 'date_confirmed', label: 'Data confirmada' }, { id: 'service_organized', label: 'Organização do serviço' }],
  wedding: [{ id: 'date_confirmed', label: 'Data confirmada' }, { id: 'documents_checked', label: 'Documentos conferidos' }, { id: 'pastoral_guidance', label: 'Orientação pastoral' }, { id: 'final_details', label: 'Detalhes finais' }],
  child_dedication: [{ id: 'date_confirmed', label: 'Data confirmada' }, { id: 'information_checked', label: 'Informações conferidas' }],
}
export const isCeremonyCategory = (category: AgendaCategory): category is CeremonyCategory => (CEREMONY_CATEGORIES as readonly string[]).includes(category)
export function emptyCeremonyDetails(category: CeremonyCategory): CeremonyDetails { return { responsible: '', involvedPersonIds: [], childPersonId: null, parentPersonIds: [], checklist: Object.fromEntries(CEREMONY_CHECKLISTS[category].map(({ id }) => [id, false])) } }

export interface AgendaEventData {
  title: string
  category: AgendaCategory
  churchId: string | null
  location: string
  address: string
  /** Referência futura, sem criar ou ler dados do módulo de visitas. */
  visitTarget: 'none' | 'person' | 'family'
  sermonId: string | null
  sermonSnapshot: SermonSnapshot | null
  ceremonyDetails?: CeremonyDetails | null
  /** Visita e estudo bíblico: com quem. Ausente nos compromissos antigos. */
  pessoaId?: string | null
  familiaId?: string | null
  /** Pregação: uma, todas, várias ou outra igreja. Ausente nos antigos, que usam `churchId`. */
  escolhaDeIgreja?: EscolhaDeIgreja | null
  churchIds?: string[]
  encontro?: DetalhesDoEncontro | null
  comissao?: DetalhesDaComissao | null
  ceia?: DetalhesDaCeia | null
  casamento?: DetalhesDoCasamento | null
  dedicacao?: DetalhesDaDedicacao | null
  pessoal?: DetalhesDoPessoal | null
  linkedSource?: { type: 'evangelism_campaign' | 'evangelism_point' | 'evangelism_task'; id: string; campaignId: string } | null
  startAt: string
  endAt: string
  allDay: boolean
  reminderMinutes: number | null
  notes: string
  includeInItinerary: boolean
  mondayException: boolean
  createdAt: string
  updatedAt: string
}

export interface AgendaEventEntity extends AgendaEventData { id: string }
export type AgendaEventInput = Omit<AgendaEventData, 'createdAt' | 'updatedAt'>

export interface AgendaConflict {
  kind: 'overlap' | 'short_interval' | 'monday_rest'
  message: string
  eventId?: string
}

export interface ItineraryItem { id: string; title: string; category: AgendaCategory | 'rest'; startAt: string; endAt: string; allDay: boolean; churchName?: string | undefined; location?: string; address?: string }

/**
 * A data e a hora como o pastor as vê, e não como o meridiano de Greenwich as vê.
 *
 * `toISOString()` converte para UTC. Num fuso a oeste, um compromisso marcado às
 * 22h de sábado vira domingo no texto — e o campo do formulário, que fala em
 * hora local, passa a mostrar outro dia. O deslocamento também aparecia ao
 * calcular o término: somava-se uma hora ao início e o resultado saía três
 * horas adiante.
 */
export function localDateTime(date: Date): string {
  const doisDigitos = (valor: number) => String(valor).padStart(2, '0')
  return `${date.getFullYear()}-${doisDigitos(date.getMonth() + 1)}-${doisDigitos(date.getDate())}T${doisDigitos(date.getHours())}:${doisDigitos(date.getMinutes())}`
}

/**
 * O término acompanha o início, mantendo a duração que já estava escolhida.
 *
 * Sem isto, mudar o início deixava o término onde ele estava: o padrão marcava
 * término às 09:00 de hoje, o pastor mudava o início para sábado às 19h e
 * salvava um compromisso que terminava no dia anterior ao que começava. O
 * aplicativo recusava, com razão, mas a culpa era dele. Quando não há duração
 * utilizável — término igual ou anterior ao início —, uma hora é o padrão, que
 * é a duração comum de uma pregação.
 */
export function endFollowingStart(startAt: string, endAt: string, novoInicio: string): string {
  const inicioNovo = new Date(novoInicio).getTime()
  if (!Number.isFinite(inicioNovo)) return endAt
  const inicioAntigo = new Date(startAt).getTime()
  const fimAntigo = new Date(endAt).getTime()
  const duracao = Number.isFinite(inicioAntigo) && Number.isFinite(fimAntigo) && fimAntigo > inicioAntigo
    ? fimAntigo - inicioAntigo
    : 60 * 60_000
  return localDateTime(new Date(inicioNovo + duracao))
}

/**
 * Os padrões de uma categoria nova.
 *
 * Nenhum compromisso nasce "o dia todo": a opção saiu da tela, e o Concílio,
 * que nascia assim, passa a ter início e fim como os demais.
 */
export function categoryDefaults(category: AgendaCategory, date = new Date()): Pick<AgendaEventInput, 'startAt' | 'endAt' | 'allDay' | 'reminderMinutes' | 'includeInItinerary'> {
  const isoDate = localDateTime(date).slice(0, 10)
  const longo = category === 'pgp' || category === 'council'
  const duration = category === 'committee' ? 90 : 60
  const startHour = longo ? '09:00' : '08:00'
  const endHour = longo ? '12:00' : `${String(8 + Math.floor(duration / 60)).padStart(2, '0')}:${String(duration % 60).padStart(2, '0')}`
  return { startAt: `${isoDate}T${startHour}`, endAt: `${isoDate}T${endHour}`, allDay: false, reminderMinutes: category === 'visit' ? 15 : null, includeInItinerary: category !== 'personal' }
}
