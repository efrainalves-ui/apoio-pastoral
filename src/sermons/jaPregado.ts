import { igrejasDoCompromisso } from '../agenda/detalhes'
import type { AgendaEventEntity } from '../agenda/types'
import type { ChurchEntity } from '../district/types'

/**
 * Pregação já feita, registrada depois, fora da Agenda.
 *
 * Não tem horário nem compromisso: é só "este sermão já foi pregado ali". A
 * data é opcional e fica vazia quando o pastor não lembra; nunca se preenche
 * com a data de hoje.
 */
export interface PregacaoAnteriorData {
  sermonId: string
  churchId: string | null
  /** Nome escrito quando foi em outra igreja, fora do distrito. */
  lugar: string
  /** AAAA-MM-DD, ou vazio quando a data não é lembrada. */
  data: string
  /** Nome do distrito em que a igreja estava, guardado quando o distrito é encerrado. */
  distrito?: string
  /** Compromisso da Agenda de onde o registro veio, para não aparecer em dobro nem ser copiado de novo. */
  origemEventoId?: string
  createdAt: string
  updatedAt: string
}

export interface PregacaoAnteriorEntity extends PregacaoAnteriorData { id: string }

export type EscolhaDoJaPregado = 'uma' | 'varias' | 'todas' | 'outra'

export const ESCOLHAS_DO_JA_PREGADO: ReadonlyArray<{ valor: EscolhaDoJaPregado; rotulo: string }> = [
  { valor: 'uma', rotulo: 'Uma igreja do distrito' },
  { valor: 'varias', rotulo: 'Duas ou mais igrejas' },
  { valor: 'todas', rotulo: 'Todas as igrejas ativas do distrito' },
  { valor: 'outra', rotulo: 'Outra igreja' },
]

export const DATA_NAO_INFORMADA = 'Data não informada'

export interface AlvoDoJaPregado { churchId: string | null; lugar: string }

const normalizar = (texto: string) => texto.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLocaleLowerCase('pt-BR')

export function igrejasAtivas(churches: readonly ChurchEntity[]): ChurchEntity[] {
  return churches.filter(({ status }) => status !== 'archived')
}

/** A chave que identifica o registro: um por sermão e igreja. */
export function chaveDoJaPregado(accountId: string, sermonId: string, alvo: AlvoDoJaPregado): string {
  return `sermao:ja-pregado:${accountId}:${sermonId}:${alvo.churchId ?? `outra:${normalizar(alvo.lugar)}`}`
}

export function alvosDaEscolha(
  escolha: EscolhaDoJaPregado,
  churches: readonly ChurchEntity[],
  igrejaIds: readonly string[],
  outroNome: string,
): AlvoDoJaPregado[] {
  if (escolha === 'outra') return outroNome.trim() ? [{ churchId: null, lugar: outroNome.trim() }] : []
  const ativas = igrejasAtivas(churches)
  const ids = escolha === 'todas' ? ativas.map(({ id }) => id) : igrejaIds.filter((id) => churches.some((church) => church.id === id))
  return [...new Set(ids)].map((churchId) => ({ churchId, lugar: '' }))
}

/** Se o sermão já consta no histórico daquela igreja: registro anterior ou pregação já feita na Agenda. */
export function jaConsta(
  alvo: AlvoDoJaPregado,
  sermonId: string,
  events: readonly AgendaEventEntity[],
  anteriores: readonly PregacaoAnteriorEntity[],
  agora: Date = new Date(),
): boolean {
  const doSermao = anteriores.filter((registro) => registro.sermonId === sermonId)
  const pregadas = events.filter((event) => event.category === 'preaching'
    && (event.sermonId === sermonId || event.sermonSnapshot?.id === sermonId)
    && new Date(event.startAt).getTime() <= agora.getTime())
  if (alvo.churchId) {
    return doSermao.some(({ churchId }) => churchId === alvo.churchId)
      || pregadas.some((event) => igrejasDoCompromisso(event).includes(alvo.churchId!))
  }
  const nome = normalizar(alvo.lugar)
  return doSermao.some((registro) => !registro.churchId && normalizar(registro.lugar) === nome)
    || pregadas.some((event) => !event.churchId && !event.churchIds?.length && normalizar(event.location) === nome)
}

export interface PlanoDoJaPregado { registrar: AlvoDoJaPregado[]; jaConstam: AlvoDoJaPregado[] }

/** Separa o que falta registrar do que já consta, sem repetir igreja. */
export function planejarJaPregado(
  sermonId: string,
  alvos: readonly AlvoDoJaPregado[],
  events: readonly AgendaEventEntity[],
  anteriores: readonly PregacaoAnteriorEntity[],
  agora: Date = new Date(),
): PlanoDoJaPregado {
  const plano: PlanoDoJaPregado = { registrar: [], jaConstam: [] }
  const vistos = new Set<string>()
  for (const alvo of alvos) {
    const chave = alvo.churchId ?? `outra:${normalizar(alvo.lugar)}`
    if (vistos.has(chave)) continue
    vistos.add(chave)
    if (jaConsta(alvo, sermonId, events, anteriores, agora)) plano.jaConstam.push(alvo)
    else plano.registrar.push(alvo)
  }
  return plano
}

export function nomeDoAlvo(alvo: AlvoDoJaPregado, churches: readonly ChurchEntity[]): string {
  return alvo.churchId ? churches.find(({ id }) => id === alvo.churchId)?.name ?? 'Igreja' : alvo.lugar
}

export function validarDataDoJaPregado(data: string): void {
  if (data && !/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new Error('Data inválida.')
}
