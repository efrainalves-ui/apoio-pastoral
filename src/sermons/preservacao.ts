import { igrejasDoCompromisso } from '../agenda/detalhes'
import type { AgendaEventData } from '../agenda/types'
import { currentDeviceId } from '../auth/device'
import { encryptPayload } from '../crypto/vault'
import { readPayloads } from '../db/corrupted'
import { db, type ApoioDatabase } from '../db/database'
import { VaultRepository, type EncryptedMutation } from '../db/repository'
import { idDerivado } from '../shared/idDerivado'
import type { PregacaoAnteriorData } from './jaPregado'

const TIPO = 'sermon_preaching'

/**
 * Os sermões são do pastor, e não do distrito.
 *
 * Encerrar ou recomeçar um distrito apaga igrejas, pessoas e Agenda. Antes
 * disso, o histórico de pregações deixa de depender delas:
 *
 * - o registro "já pregado" que aponta para uma igreja passa a guardar só o
 *   nome dela e o nome do distrito, e o vínculo com a igreja sai;
 * - a pregação feita que só existia na Agenda vira registro de histórico, um
 *   por igreja, com a data e os mesmos nomes.
 *
 * Nada além do nome atravessa: endereço, membros e o cadastro da igreja ficam
 * com o distrito. Compromisso futuro não entra — ele não aconteceu.
 *
 * Rodar de novo não duplica: o registro já desvinculado não muda, e a pregação
 * vinda da Agenda leva o identificador do compromisso de origem.
 */
export interface RegistroAberto { id: string; type: string; data: unknown }

export interface PlanoDePreservacao {
  atualizar: Array<{ id: string; dados: PregacaoAnteriorData }>
  criar: Array<{ chave: string; dados: PregacaoAnteriorData }>
}

const normalizar = (texto: string) => texto.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLocaleLowerCase('pt-BR')
const nomeDe = (data: unknown) => {
  const nome = (data as { name?: unknown } | null)?.name
  return typeof nome === 'string' ? nome.trim() : ''
}

export function planejarPreservacaoDosSermoes(registros: readonly RegistroAberto[], agora: Date = new Date()): PlanoDePreservacao {
  const nomeDaIgreja = new Map(registros.filter(({ type }) => type === 'church').map(({ id, data }) => [id, nomeDe(data)]))
  const distrito = registros.filter(({ type }) => type === 'district').map(({ data }) => nomeDe(data)).find(Boolean) ?? ''
  const pregacoes = registros.filter(({ type }) => type === TIPO).map(({ id, data }) => ({ id, ...(data as PregacaoAnteriorData) }))
  const carimbo = agora.toISOString()

  const atualizar = pregacoes.filter(({ churchId }) => Boolean(churchId)).map(({ id, ...dados }) => {
    const nome = dados.lugar.trim() || nomeDaIgreja.get(dados.churchId!) || ''
    const doDistrito = dados.distrito || distrito
    return { id, dados: { ...dados, churchId: null, lugar: nome, ...(doDistrito ? { distrito: doDistrito } : {}), updatedAt: carimbo } }
  })

  const jaVieramDaAgenda = new Set(pregacoes.map(({ origemEventoId }) => origemEventoId).filter(Boolean))
  const criar: PlanoDePreservacao['criar'] = []
  for (const { id, type, data } of registros) {
    if (type !== 'agenda_event') continue
    const evento = data as Partial<AgendaEventData>
    const sermonId = evento.sermonId ?? evento.sermonSnapshot?.id
    if (evento.category !== 'preaching' || !sermonId || !evento.startAt || jaVieramDaAgenda.has(id)) continue
    if (new Date(evento.startAt).getTime() > agora.getTime()) continue
    const dia = evento.startAt.slice(0, 10)
    const igrejas = igrejasDoCompromisso({ churchId: evento.churchId ?? null, churchIds: evento.churchIds ?? [] })
    const alvos = igrejas.length
      ? igrejas.map((churchId) => ({ chave: churchId, churchId, lugar: nomeDaIgreja.get(churchId) ?? '', distrito }))
      : [{ chave: 'lugar', churchId: null, lugar: (evento.location ?? '').trim(), distrito: '' }]
    for (const alvo of alvos) {
      // O mesmo sermão já marcado como pregado ali, no mesmo dia, não ganha outro registro.
      const repetida = pregacoes.some((registro) => registro.sermonId === sermonId && registro.data === dia
        && (alvo.churchId ? registro.churchId === alvo.churchId : Boolean(alvo.lugar) && normalizar(registro.lugar) === normalizar(alvo.lugar)))
      if (repetida) continue
      criar.push({
        chave: `${id}:${alvo.chave}`,
        dados: { sermonId, churchId: null, lugar: alvo.lugar, data: dia, ...(alvo.distrito ? { distrito: alvo.distrito } : {}), origemEventoId: id, createdAt: carimbo, updatedAt: carimbo },
      })
    }
  }
  return { atualizar, criar }
}

export class PreservacaoDosSermoes {
  private readonly repository: VaultRepository

  constructor(private readonly database: ApoioDatabase = db) {
    this.repository = new VaultRepository(database)
  }

  async preservar(accountId: string, key: CryptoKey, agora: Date = new Date()): Promise<{ desvinculadas: number; trazidasDaAgenda: number }> {
    const registros = await this.database.vaultRecords.where('accountId').equals(accountId).filter((record) => !record.deletedAt).toArray()
    const { opened } = await readPayloads(key, registros, this.database)
    const plano = planejarPreservacaoDosSermoes(opened.map(({ record, payload }) => ({ id: record.id, type: payload.type, data: payload.data })), agora)
    const mutacoes: EncryptedMutation[] = [
      ...await Promise.all(plano.atualizar.map(async ({ id, dados }) => ({
        recordId: id, recordType: TIPO, envelope: await encryptPayload(key, { schemaVersion: 1, type: TIPO, data: dados }, id),
      }) satisfies EncryptedMutation)),
      ...await Promise.all(plano.criar.map(async ({ chave, dados }) => {
        const id = await idDerivado(`sermao:preservado:${accountId}:${chave}`)
        return { recordId: id, recordType: TIPO, envelope: await encryptPayload(key, { schemaVersion: 1, type: TIPO, data: dados }, id) } satisfies EncryptedMutation
      })),
    ]
    if (mutacoes.length) await this.repository.applyEncryptedMutations(accountId, currentDeviceId(accountId), mutacoes)
    return { desvinculadas: plano.atualizar.length, trazidasDaAgenda: plano.criar.length }
  }
}
