import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { CommissionService } from '../commissions/service'
import { generateMasterKey } from '../crypto/vault'
import { ApoioDatabase } from '../db/database'
import { DistrictService } from '../district/service'
import { emptyChurchInput } from '../district/types'
import { NominationService } from '../nominations/service'
import { comissaoVazia } from './detalhes'
import { AgendaService } from './service'
import type { AgendaEventInput, TipoDeComissao } from './types'
import { VinculoAgendaComissao } from './vinculoComissao'

const bancos: ApoioDatabase[] = []
afterEach(async () => { await Promise.all(bancos.splice(0).map((banco) => banco.delete())) })

async function cenario() {
  const database = new ApoioDatabase(`agenda-comissao-${crypto.randomUUID()}`)
  bancos.push(database)
  const key = await generateMasterKey()
  const accountId = 'conta-ficticia'
  const districts = new DistrictService(database)
  const district = await districts.createDistrict(accountId, key, 'Distrito Fictício')
  const church = await districts.createChurch(accountId, key, district.id, { ...emptyChurchInput(), name: 'Igreja Fictícia', type: 'organized_church' })
  return {
    database, key, accountId, churchId: church.id,
    agenda: new AgendaService(database), commissions: new CommissionService(database),
    nominations: new NominationService(database), vinculo: new VinculoAgendaComissao(database),
  }
}

const compromisso = (churchId: string | null, tipo: TipoDeComissao, extra: Partial<AgendaEventInput> = {}): AgendaEventInput => ({
  title: 'Comissão fictícia', category: 'committee', churchId, location: 'Sala fictícia', address: '', visitTarget: 'none',
  sermonId: null, sermonSnapshot: null, ceremonyDetails: null, startAt: '2026-10-06T19:30', endAt: '2026-10-06T21:00',
  allDay: false, reminderMinutes: null, notes: '', includeInItinerary: true, mondayException: false,
  comissao: { ...comissaoVazia(), tipo }, ...extra,
})

describe('Agenda e Comissões ligadas', () => {
  it('Comissão Diretiva cria a reunião com data, horário e local da Agenda', async () => {
    const c = await cenario()
    const evento = await c.agenda.createEvent(c.accountId, c.key, compromisso(c.churchId, 'diretiva'))
    const situacao = await c.vinculo.vincular(c.accountId, c.key, evento)
    expect(situacao.tipo).toBe('comissao')

    const [reuniao] = await c.commissions.meetings(c.accountId, c.key, c.churchId)
    expect(reuniao).toMatchObject({ kind: 'board', date: '2026-10-06', time: '19:30', location: 'Sala fictícia', agendaEventId: evento.id })
    expect((await c.agenda.getEvent(c.accountId, c.key, evento.id))?.comissao?.meetingId).toBe(reuniao!.id)
  })

  it('salvar de novo atualiza a mesma reunião, sem criar outra', async () => {
    const c = await cenario()
    const evento = await c.agenda.createEvent(c.accountId, c.key, compromisso(c.churchId, 'administrativa'))
    await c.vinculo.vincular(c.accountId, c.key, evento)
    const ligado = (await c.agenda.getEvent(c.accountId, c.key, evento.id))!
    const { id, createdAt: _c, updatedAt: _u, ...dados } = ligado
    void _c; void _u
    const movido = await c.agenda.updateEvent(c.accountId, c.key, id, { ...dados, startAt: '2026-10-08T20:00', endAt: '2026-10-08T21:30', location: 'Templo fictício' })
    await c.vinculo.vincular(c.accountId, c.key, movido)
    await c.vinculo.vincular(c.accountId, c.key, movido)

    const reunioes = await c.commissions.meetings(c.accountId, c.key)
    expect(reunioes).toHaveLength(1)
    expect(reunioes[0]).toMatchObject({ kind: 'administrative', date: '2026-10-08', time: '20:00', location: 'Templo fictício' })
  })

  /* A segunda gravação falhou antes: o compromisso não sabe da reunião, mas a reunião sabe dele. */
  it('acha a reunião pelo compromisso mesmo quando o vínculo não chegou ao compromisso', async () => {
    const c = await cenario()
    const evento = await c.agenda.createEvent(c.accountId, c.key, compromisso(c.churchId, 'diretiva'))
    await c.vinculo.vincular(c.accountId, c.key, evento)
    await c.vinculo.vincular(c.accountId, c.key, evento) // o evento em memória ainda sem meetingId
    expect(await c.commissions.meetings(c.accountId, c.key)).toHaveLength(1)
  })

  it('preserva pauta e participantes já registrados na reunião', async () => {
    const c = await cenario()
    const evento = await c.agenda.createEvent(c.accountId, c.key, compromisso(c.churchId, 'diretiva'))
    await c.vinculo.vincular(c.accountId, c.key, evento)
    const [reuniao] = await c.commissions.meetings(c.accountId, c.key)
    const { id, ...dados } = reuniao!
    const pauta = { id: 'pauta-ficticia', order: 1, title: 'Pauta fictícia', department: '', description: '', proposal: '', decisionType: 'approve' as const, customDecisionType: '', destination: 'internal' as const, responsibleId: '', dueDate: '', priority: 'normal' as const }
    await c.commissions.saveMeeting(c.accountId, c.key, { ...dados, agenda: [pauta as never], guestNames: ['Convidado fictício'] }, id)

    await c.vinculo.vincular(c.accountId, c.key, (await c.agenda.getEvent(c.accountId, c.key, evento.id))!)
    const depois = await c.commissions.meeting(c.accountId, c.key, id)
    expect(depois?.agenda.map(({ title }) => title)).toEqual(['Pauta fictícia'])
    expect(depois?.guestNames).toEqual(['Convidado fictício'])
  })

  it('Comissão de Nomeações entra no processo aberto da igreja, uma vez só', async () => {
    const c = await cenario()
    const processo = await c.nominations.create(c.accountId, c.key, c.churchId, '2027')
    const evento = await c.agenda.createEvent(c.accountId, c.key, compromisso(c.churchId, 'nomeacoes'))
    const situacao = await c.vinculo.vincular(c.accountId, c.key, evento)
    await c.vinculo.vincular(c.accountId, c.key, evento)

    expect(situacao).toMatchObject({ tipo: 'nomeacoes', processId: processo.id })
    const atualizado = await c.nominations.get(c.accountId, c.key, processo.id)
    const ligadas = atualizado!.meetings.filter(({ agendaEventId }) => agendaEventId === evento.id)
    expect(ligadas).toHaveLength(1)
    expect(ligadas[0]).toMatchObject({ date: '2026-10-06', time: '19:30', location: 'Sala fictícia' })
  })

  it('Nomeações sem processo aberto fica pendente e não inventa processo', async () => {
    const c = await cenario()
    const evento = await c.agenda.createEvent(c.accountId, c.key, compromisso(c.churchId, 'nomeacoes'))
    expect(await c.vinculo.vincular(c.accountId, c.key, evento)).toEqual({ tipo: 'pendente', motivo: 'sem_processo' })
    expect(await c.nominations.list(c.accountId, c.key)).toHaveLength(0)
  })

  it('Outra comissão não cria reunião no módulo', async () => {
    const c = await cenario()
    const evento = await c.agenda.createEvent(c.accountId, c.key, compromisso(c.churchId, 'outra', {
      comissao: { ...comissaoVazia(), tipo: 'outra', outraNome: 'Comissão de Obras Fictícia', pautas: [{ id: 'p1', titulo: 'Telhado fictício', andamento: 'em_andamento' }] },
    }))
    expect(await c.vinculo.vincular(c.accountId, c.key, evento)).toEqual({ tipo: 'sem_vinculo' })
    expect(await c.commissions.meetings(c.accountId, c.key)).toHaveLength(0)
    expect((await c.agenda.getEvent(c.accountId, c.key, evento.id))?.comissao?.pautas).toEqual([{ id: 'p1', titulo: 'Telhado fictício', andamento: 'em_andamento' }])
  })

  it('Nomeações pendente se liga sozinha quando o processo passa a existir, sem duplicar', async () => {
    const c = await cenario()
    const evento = await c.agenda.createEvent(c.accountId, c.key, compromisso(c.churchId, 'nomeacoes'))
    expect(await c.vinculo.vincularPendentes(c.accountId, c.key)).toBe(0)

    const processo = await c.nominations.create(c.accountId, c.key, c.churchId, '2027')
    expect(await c.vinculo.vincularPendentes(c.accountId, c.key, c.churchId)).toBe(1)
    expect(await c.vinculo.vincularPendentes(c.accountId, c.key)).toBe(0)

    const ligado = await c.agenda.getEvent(c.accountId, c.key, evento.id)
    expect(ligado?.comissao).toMatchObject({ tipo: 'nomeacoes', processId: processo.id })
    const reunioes = (await c.nominations.get(c.accountId, c.key, processo.id))!.meetings.filter(({ agendaEventId }) => agendaEventId === evento.id)
    expect(reunioes).toHaveLength(1)
    expect(reunioes[0]?.id).toBe(ligado?.comissao?.meetingId)
  })

  it('compromisso de comissão antigo, sem tipo, fica como estava', async () => {
    const c = await cenario()
    const evento = await c.agenda.createEvent(c.accountId, c.key, compromisso(c.churchId, 'diretiva', { comissao: null }))
    expect(await c.vinculo.vincular(c.accountId, c.key, evento)).toEqual({ tipo: 'sem_vinculo' })
  })
})
