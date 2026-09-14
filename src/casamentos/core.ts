import {
  ITENS_MANUAIS, type CasamentoData, type CursoDeNoivos, type EtapaDoCasamento, type ItemDoChecklist, type NoivoDoCasamento,
  type OrigemDoCasamento, type SimNao, type SituacaoDoItem,
} from './types'

export const noivoVazio = (): NoivoDoCasamento => ({ personId: null, nome: '', igrejaId: null, igrejaNome: '' })

export function casamentoVazio(origem: OrigemDoCasamento, agora = new Date()): CasamentoData {
  const carimbo = agora.toISOString()
  return {
    noiva: noivoVazio(), noivo: noivoVazio(), contato: '',
    primeiroContato: '', dataSolicitacao: '', dataPretendida: '', igrejaPretendidaId: null, localPretendido: '',
    cerimonia: { data: '', inicio: '', fim: '', igrejaId: null, local: '' },
    pastorResponsavel: '', pastorOficiante: '',
    civil: { data: '', cartorio: '', efeitoCivil: null },
    ensaio: { data: '', inicio: '', local: '' },
    curso: { situacao: null, dataConclusao: '', local: '', responsavel: '' },
    comissao: { igrejaId: null, meetingId: null, situacao: 'pendente', data: '', voto: '', precisaCarta: null, carta: null },
    entrevistas: [],
    checklist: Object.fromEntries(ITENS_MANUAIS.map((item) => [item, { situacao: 'pendente', data: '' }])) as Record<(typeof ITENS_MANUAIS)[number], ItemDoChecklist>,
    orientacoes: { apresentadas: null, data: '', apresentadasPor: '' },
    etapa: 'primeiro_contato', historico: [], origem, createdAt: carimbo, updatedAt: carimbo,
  }
}

/**
 * Um registro gravado por uma versão anterior deste modelo abre com os campos
 * que faltarem vazios. Nada do que existe é trocado.
 */
export function normalizarCasamento(dados: Partial<CasamentoData>): CasamentoData {
  const vazio = casamentoVazio(dados.origem ?? 'casamentos')
  return {
    ...vazio, ...dados,
    noiva: { ...vazio.noiva, ...dados.noiva }, noivo: { ...vazio.noivo, ...dados.noivo },
    cerimonia: { ...vazio.cerimonia, ...dados.cerimonia }, civil: { ...vazio.civil, ...dados.civil },
    ensaio: { ...vazio.ensaio, ...dados.ensaio }, curso: { ...vazio.curso, ...dados.curso },
    comissao: { ...vazio.comissao, ...dados.comissao }, orientacoes: { ...vazio.orientacoes, ...dados.orientacoes },
    checklist: { ...vazio.checklist, ...dados.checklist },
    entrevistas: dados.entrevistas ?? [], historico: dados.historico ?? [],
    createdAt: dados.createdAt ?? vazio.createdAt, updatedAt: dados.updatedAt ?? vazio.updatedAt,
  }
}

export function nomeDoCasal(casamento: Pick<CasamentoData, 'noiva' | 'noivo'>): string {
  const nomes = [casamento.noiva.nome.trim(), casamento.noivo.nome.trim()].filter(Boolean)
  return nomes.length ? nomes.join(' e ') : 'Casal sem nome'
}

export function tituloDaCerimonia(casamento: Pick<CasamentoData, 'noiva' | 'noivo'>): string {
  const nomes = [casamento.noiva.nome.trim(), casamento.noivo.nome.trim()].filter(Boolean)
  return nomes.length ? `Casamento de ${nomes.join(' e ')}` : 'Casamento'
}

export function validarCasamento(casamento: Pick<CasamentoData, 'noiva' | 'noivo'>): void {
  if (!casamento.noiva.nome.trim() && !casamento.noivo.nome.trim()) throw new Error('Informe o nome da noiva ou do noivo.')
}

const semAcento = (texto: string) => texto.normalize('NFD').replace(/[̀-ͯ]/gu, '').toLocaleLowerCase('pt-BR').replace(/\s+/gu, ' ').trim()

/**
 * Possíveis registros dos mesmos noivos.
 *
 * Mesmo cadastro de pessoa, ou os dois nomes iguais (sem distinguir acento e
 * maiúscula). O aplicativo só aponta: abrir o existente ou criar outro é
 * escolha de quem cadastra, e nada é juntado sozinho.
 */
export function possiveisDuplicados<T extends Pick<CasamentoData, 'noiva' | 'noivo'> & { id: string }>(
  candidato: Pick<CasamentoData, 'noiva' | 'noivo'>,
  existentes: readonly T[],
  ignorarId?: string,
): T[] {
  const mesmaPessoa = (a: NoivoDoCasamento, b: NoivoDoCasamento) => Boolean(a.personId) && a.personId === b.personId
  const mesmoNome = (a: NoivoDoCasamento, b: NoivoDoCasamento) => Boolean(semAcento(a.nome)) && semAcento(a.nome) === semAcento(b.nome)
  return existentes.filter((existente) => existente.id !== ignorarId && (
    mesmaPessoa(candidato.noiva, existente.noiva) || mesmaPessoa(candidato.noivo, existente.noivo)
    || (mesmoNome(candidato.noiva, existente.noiva) && mesmoNome(candidato.noivo, existente.noivo))
  ))
}

/** A quinta pergunta da entrevista é a situação do curso lida como Sim, Não ou Pendente. */
export function respostaDoCurso(curso: CursoDeNoivos): SimNao {
  if (curso.situacao === 'concluido') return 'sim'
  if (curso.situacao === 'nao_iniciado' || curso.situacao === 'em_andamento') return 'nao'
  return null
}

/** Responder a quinta pergunta muda o curso, e só no que a resposta afirma. */
export function cursoComResposta(curso: CursoDeNoivos, resposta: Exclude<SimNao, null>, dataDaEntrevista: string): CursoDeNoivos {
  if (resposta === 'sim') return { ...curso, situacao: 'concluido', dataConclusao: curso.dataConclusao || dataDaEntrevista }
  if (curso.situacao === 'concluido') return { ...curso, situacao: 'em_andamento', dataConclusao: '' }
  return { ...curso, situacao: curso.situacao ?? 'nao_iniciado' }
}

const diaUtc = (chave: string) => { const [ano, mes, dia] = chave.split('-').map(Number); return Date.UTC(ano ?? 0, (mes ?? 1) - 1, dia ?? 1) }

/** Pedido com menos de três meses de antecedência: só um aviso, nunca um bloqueio. */
export function pedidoComPoucaAntecedencia(casamento: Pick<CasamentoData, 'dataSolicitacao' | 'primeiroContato' | 'dataPretendida' | 'cerimonia'>): boolean {
  const pedido = casamento.dataSolicitacao || casamento.primeiroContato
  const alvo = casamento.cerimonia.data || casamento.dataPretendida
  if (!pedido || !alvo) return false
  const limite = new Date(diaUtc(pedido)); limite.setUTCMonth(limite.getUTCMonth() + 3)
  return diaUtc(alvo) < limite.getTime()
}

export interface ItemDaPreparacao { id: string; rotulo: string; situacao: SituacaoDoItem; data: string; derivado: boolean }

export const ROTULOS_DOS_ITENS: Record<string, string> = {
  entrevista: 'Entrevista pastoral realizada', curso: 'Curso de noivos concluído', comissao: 'Comissão da igreja realizada',
  carta: 'Carta de recomendação recebida', civil: 'Casamento civil realizado ou programado', certidao: 'Certidão de casamento apresentada',
  oficiante: 'Pastor oficiante confirmado', local: 'Local reservado', ensaio: 'Ensaio marcado', programa: 'Programa da cerimônia revisado',
  musicas: 'Músicas e participantes conferidos', orientacoes: 'Orientações apresentadas ao casal',
}

/**
 * O checklist de preparação.
 *
 * O que já tem lugar próprio na página — entrevista, curso, comissão, carta,
 * civil, ensaio, orientações — é lido de lá, e não perguntado outra vez: um
 * item marcado aqui e desmentido lá seria informação contraditória. Os demais
 * são marcados à mão.
 */
export function itensDaPreparacao(casamento: CasamentoData): ItemDaPreparacao[] {
  const ultimaEntrevista = [...casamento.entrevistas].sort((a, b) => b.data.localeCompare(a.data))[0]
  const derivado = (id: string, feito: boolean, data: string, naoSeAplica = false): ItemDaPreparacao =>
    ({ id, rotulo: ROTULOS_DOS_ITENS[id]!, situacao: naoSeAplica ? 'nao_se_aplica' : feito ? 'concluido' : 'pendente', data: feito ? data : '', derivado: true })
  const manual = (id: (typeof ITENS_MANUAIS)[number]): ItemDaPreparacao => ({ id, rotulo: ROTULOS_DOS_ITENS[id]!, ...casamento.checklist[id], derivado: false })
  const comissaoFeita = casamento.comissao.situacao !== 'pendente'
  return [
    derivado('entrevista', Boolean(ultimaEntrevista), ultimaEntrevista?.data ?? ''),
    derivado('curso', casamento.curso.situacao === 'concluido', casamento.curso.dataConclusao),
    derivado('comissao', comissaoFeita, casamento.comissao.data),
    derivado('carta', casamento.comissao.carta === 'recebida' || casamento.comissao.carta === 'emitida', '', casamento.comissao.precisaCarta === false),
    derivado('civil', Boolean(casamento.civil.data), casamento.civil.data),
    manual('certidao'),
    manual('oficiante'),
    manual('local'),
    derivado('ensaio', Boolean(casamento.ensaio.data), casamento.ensaio.data),
    manual('programa'),
    manual('musicas'),
    derivado('orientacoes', casamento.orientacoes.apresentadas === true, casamento.orientacoes.data),
  ]
}

export function pendencias(casamento: CasamentoData): string[] {
  if (casamento.etapa === 'cancelado' || casamento.etapa === 'realizado') return []
  return itensDaPreparacao(casamento).filter(({ situacao }) => situacao === 'pendente').map(({ rotulo }) => rotulo)
}

/**
 * A etapa que os registros sugerem. Só uma sugestão: a etapa gravada é a que o
 * pastor escolhe, e existir uma data não conta como avanço.
 */
export function etapaSugerida(casamento: CasamentoData, temCerimoniaNaAgenda: boolean): EtapaDoCasamento {
  if (casamento.etapa === 'cancelado' || casamento.etapa === 'realizado') return casamento.etapa
  if (!casamento.entrevistas.length) return 'aguardando_entrevista'
  if (casamento.curso.situacao === null) return 'entrevista_realizada'
  if (casamento.curso.situacao !== 'concluido') return 'curso_em_andamento'
  if (!casamento.civil.data || (casamento.comissao.precisaCarta && casamento.comissao.carta === 'pendente')) return 'aguardando_documentos'
  if (casamento.comissao.situacao === 'pendente') return 'aguardando_comissao'
  if (!casamento.cerimonia.data) return 'aguardando_confirmacao'
  return temCerimoniaNaAgenda ? 'agendado' : 'pronto_para_agendar'
}

export type SituacaoGeral = 'Em andamento' | 'Com pendências' | 'Casamento agendado' | 'Realizado' | 'Cancelado'
export function situacaoGeral(casamento: CasamentoData, temCerimoniaNaAgenda: boolean): SituacaoGeral {
  if (casamento.etapa === 'cancelado') return 'Cancelado'
  if (casamento.etapa === 'realizado') return 'Realizado'
  if (temCerimoniaNaAgenda) return 'Casamento agendado'
  return pendencias(casamento).length ? 'Com pendências' : 'Em andamento'
}

/** "Recomendação feita pela Comissão da Igreja de [igreja], em [data]." — só com os dados completos. */
export function textoDaRecomendacao(casamento: CasamentoData, nomeDaIgreja: string | undefined): string | null {
  if (casamento.comissao.situacao !== 'recomendada' || !nomeDaIgreja || !casamento.comissao.data) return null
  const [ano, mes, dia] = casamento.comissao.data.split('-')
  return `Recomendação feita pela Comissão da Igreja de ${nomeDaIgreja}, em ${dia}/${mes}/${ano}.`
}

/** Orientações aos noivos, na redação combinada com o pastor. */
export const ORIENTACOES_AOS_NOIVOS: readonly string[] = [
  'A cerimônia é um culto e deve preservar simplicidade, reverência e pontualidade.',
  'O pedido deve ser feito, preferencialmente, com pelo menos três meses de antecedência.',
  'Trajes, ornamentação, fotografia e filmagem devem respeitar a reverência do ambiente.',
  'Fotografias e filmagens não devem interferir na cerimônia, especialmente durante as orações.',
  'A música deve estar de acordo com as orientações da Igreja.',
  'Não será permitida a participação de pessoas não adventistas cantando ou tocando na cerimônia.',
  'O programa deve ser combinado com o pastor responsável.',
  'Quando houver outro pastor convidado, sua participação deve ser acertada com o pastor distrital.',
  'O ensaio deve ser combinado previamente.',
  'Quando o casamento ocorrer em outra igreja, poderá ser necessária uma carta de recomendação.',
  'Os convidados devem respeitar as dependências da igreja, sem cigarro, bebidas alcoólicas ou semelhantes.',
  'A ornamentação e a retirada dos arranjos são responsabilidade dos noivos e familiares.',
  'Questões civis e documentos necessários devem ser acertados antecipadamente.',
  'Situações especiais devem ser tratadas diretamente com o pastor.',
]

/**
 * Identificador do acompanhamento criado a partir de um compromisso antigo.
 *
 * Derivado do identificador do compromisso: a migração, rodada de novo — ou em
 * dois aparelhos antes de sincronizar —, chega ao mesmo registro e não cria outro.
 */
export async function idDoCasamentoDoCompromisso(eventId: string): Promise<string> {
  const resumo = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`casamento:${eventId}`))).slice(0, 16)
  resumo[6] = (resumo[6]! & 0x0f) | 0x50
  resumo[8] = (resumo[8]! & 0x3f) | 0x80
  const hex = [...resumo].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
