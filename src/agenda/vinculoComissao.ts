import { commissionPresident } from '../commissions/core'
import { CommissionService } from '../commissions/service'
import type { CommissionEntity, CommissionKind, CommissionMeetingData } from '../commissions/types'
import { db, type ApoioDatabase } from '../db/database'
import { DistrictService } from '../district/service'
import { NominationService } from '../nominations/service'
import { AgendaService } from './service'
import type { AgendaEventEntity, AgendaEventInput } from './types'

/** O que ficou do vínculo depois de gravar. */
export type SituacaoDoVinculo =
  | { tipo: 'sem_vinculo' }
  | { tipo: 'comissao'; meetingId: string }
  | { tipo: 'nomeacoes'; processId: string; meetingId: string }
  | { tipo: 'pendente'; motivo: 'sem_igreja' | 'sem_processo' | 'ata_finalizada' }

const KIND: Record<'diretiva' | 'administrativa', CommissionKind> = { diretiva: 'board', administrativa: 'administrative' }

const dataDe = (event: AgendaEventEntity) => event.startAt.slice(0, 10)
const horaDe = (event: AgendaEventEntity) => event.startAt.slice(11, 16)

/**
 * O compromisso de comissão e a reunião do módulo de Comissões são uma coisa só.
 *
 * O vínculo é estável nos dois sentidos: o compromisso guarda o identificador
 * da reunião (`comissao.meetingId`) e a reunião guarda o do compromisso
 * (`agendaEventId`). Salvar de novo acha a mesma reunião por qualquer um dos
 * dois e só atualiza data, horário e local — nunca cria uma segunda.
 *
 * São duas gravações, e não uma transação. Se a segunda falhar, a próxima
 * gravação do compromisso acha a reunião pelo `agendaEventId` e completa o
 * vínculo, sem duplicar.
 *
 * Nomeações vivem dentro do processo de nomeações da igreja. Sem processo
 * aberto, o vínculo fica pendente: criar um processo inteiro a partir da Agenda
 * decidiria por ele período, comissão e quórum.
 *
 * "Outra comissão" não tem módulo próprio; a pauta mora no compromisso.
 */
export class VinculoAgendaComissao {
  private readonly agenda: AgendaService
  private readonly commissions: CommissionService
  private readonly nominations: NominationService
  private readonly districts: DistrictService

  constructor(database: ApoioDatabase = db) {
    this.agenda = new AgendaService(database)
    this.commissions = new CommissionService(database)
    this.nominations = new NominationService(database)
    this.districts = new DistrictService(database)
  }

  async vincular(accountId: string, masterKey: CryptoKey, event: AgendaEventEntity): Promise<SituacaoDoVinculo> {
    const comissao = event.category === 'committee' ? event.comissao : null
    if (!comissao?.tipo || comissao.tipo === 'outra') return { tipo: 'sem_vinculo' }
    if (!event.churchId) return { tipo: 'pendente', motivo: 'sem_igreja' }
    if (comissao.tipo === 'nomeacoes') return this.vincularNomeacoes(accountId, masterKey, event)
    return this.vincularReuniao(accountId, masterKey, event, KIND[comissao.tipo])
  }

  private async vincularReuniao(accountId: string, masterKey: CryptoKey, event: AgendaEventEntity, kind: CommissionKind): Promise<SituacaoDoVinculo> {
    const churchId = event.churchId!
    const reunioes = await this.commissions.meetings(accountId, masterKey)
    const existente = reunioes.find(({ id }) => id === event.comissao?.meetingId) ?? reunioes.find(({ agendaEventId }) => agendaEventId === event.id)
    const aproveitavel = existente && (existente.kind === kind || !existente.agenda.length)
    if (existente?.finalizedAt) {
      await this.gravarVinculo(accountId, masterKey, event, { meetingId: existente.id, processId: null })
      return { tipo: 'pendente', motivo: 'ata_finalizada' }
    }

    let reuniao: CommissionEntity<CommissionMeetingData>
    const agora = new Date().toISOString()
    if (existente && aproveitavel) {
      const { id, ...dados } = existente
      reuniao = await this.commissions.saveMeeting(accountId, masterKey, {
        ...dados, kind, churchId, date: dataDe(event), time: horaDe(event), location: event.location, agendaEventId: event.id, updatedAt: agora,
      }, id)
    } else {
      const config = await this.commissions.config(accountId, masterKey, churchId)
      const church = await this.districts.getChurch(accountId, masterKey, churchId)
      const presidencia = commissionPresident(config, church?.type)
      reuniao = await this.commissions.saveMeeting(accountId, masterKey, {
        churchId, kind, date: dataDe(event), time: horaDe(event), location: event.location, agendaEventId: event.id,
        presidentId: presidencia.mode === 'elder' ? presidencia.personId : '',
        ...(presidencia.mode === 'pastor' ? { presidentLabel: presidencia.label } : {}),
        secretaryId: config?.secretaryId ?? '',
        participantIds: kind === 'board' ? config?.boardMemberIds ?? [] : [],
        guestNames: [], votingGuestNames: [], openingPrayer: '', reflection: '', notes: '', agenda: [],
        createdAt: agora, updatedAt: agora,
      })
    }
    await this.gravarVinculo(accountId, masterKey, event, { meetingId: reuniao.id, processId: null })
    return { tipo: 'comissao', meetingId: reuniao.id }
  }

  private async vincularNomeacoes(accountId: string, masterKey: CryptoKey, event: AgendaEventEntity): Promise<SituacaoDoVinculo> {
    const processos = await this.nominations.list(accountId, masterKey, event.churchId!)
    const ligado = processos
      .flatMap((processo) => processo.meetings.map((meeting) => ({ processo, meeting })))
      .find(({ meeting }) => meeting.id === event.comissao?.meetingId || meeting.agendaEventId === event.id)

    if (ligado?.meeting.finalizedAt) {
      await this.gravarVinculo(accountId, masterKey, event, { meetingId: ligado.meeting.id, processId: ligado.processo.id })
      return { tipo: 'pendente', motivo: 'ata_finalizada' }
    }

    let alvo = ligado
    if (!alvo) {
      const processo = processos.find(({ status }) => status !== 'archived' && status !== 'completed')
      if (!processo) return { tipo: 'pendente', motivo: 'sem_processo' }
      const criado = await this.nominations.createMeeting(accountId, masterKey, processo.id)
      alvo = { processo: criado, meeting: criado.meetings.at(-1)! }
    }
    await this.nominations.updateMeeting(accountId, masterKey, alvo.processo.id, {
      ...alvo.meeting, date: dataDe(event), time: horaDe(event), location: event.location, agendaEventId: event.id,
    })
    await this.gravarVinculo(accountId, masterKey, event, { meetingId: alvo.meeting.id, processId: alvo.processo.id })
    return { tipo: 'nomeacoes', processId: alvo.processo.id, meetingId: alvo.meeting.id }
  }

  /** Grava no compromisso o identificador da reunião, só se mudou. */
  private async gravarVinculo(accountId: string, masterKey: CryptoKey, event: AgendaEventEntity, ids: { meetingId: string; processId: string | null }) {
    if (event.comissao?.meetingId === ids.meetingId && (event.comissao.processId ?? null) === ids.processId) return
    const { id, createdAt: _criado, updatedAt: _atualizado, ...dados } = event
    void _criado; void _atualizado
    const input: AgendaEventInput = { ...dados, comissao: { ...event.comissao!, ...ids } }
    // O mesmo compromisso, regravado: a checagem de conflito já o exclui de si mesmo.
    await this.agenda.updateEvent(accountId, masterKey, id, input)
  }
}
