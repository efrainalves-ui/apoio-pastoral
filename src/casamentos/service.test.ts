import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { AgendaService } from '../agenda/service'
import type { AgendaEventInput } from '../agenda/types'
import { CareService } from '../care/service'
import type { VisitCompletionInput } from '../care/types'
import { CommissionService } from '../commissions/service'
import { encryptPayload, generateMasterKey } from '../crypto/vault'
import { ApoioDatabase } from '../db/database'
import { VaultRepository } from '../db/repository'
import { idDoCasamentoDoCompromisso } from './core'
import { CasamentoService } from './service'

const bancos: ApoioDatabase[] = []
afterEach(async () => { await Promise.all(bancos.splice(0).map((banco) => banco.delete())) })

async function cenario() {
  const database = new ApoioDatabase(`casamentos-${crypto.randomUUID()}`)
  bancos.push(database)
  return {
    database, key: await generateMasterKey(), accountId: 'conta-ficticia',
    casamentos: new CasamentoService(database), agenda: new AgendaService(database), care: new CareService(database),
    commissions: new CommissionService(database), repo: new VaultRepository(database),
  }
}

const noivos = { noiva: { personId: null, nome: 'Ana Fictícia', igrejaId: null, igrejaNome: '' }, noivo: { personId: null, nome: 'Bruno Fictício', igrejaId: null, igrejaNome: '' } }

const cerimonia = (casamentoId: string, extra: Partial<AgendaEventInput> = {}): AgendaEventInput => ({
  title: 'Casamento de Ana Fictícia e Bruno Fictício', category: 'wedding', churchId: 'igreja-a', location: 'Templo fictício', address: '',
  visitTarget: 'none', sermonId: null, sermonSnapshot: null, ceremonyDetails: null, startAt: '2027-01-10T16:00', endAt: '2027-01-10T17:30',
  allDay: false, reminderMinutes: null, notes: '', includeInItinerary: true, mondayException: false,
  casamentoId, papelNoCasamento: 'cerimonia', ...extra,
})

const visita = (casamentoId: string, startAt: string): VisitCompletionInput => ({
  targetType: 'person', targetId: '', churchId: 'igreja-a', scheduledEventId: null, casamentoId, mode: 'quick', participants: [],
  reason: 'wedding', startAt, endAt: startAt.replace(/T(\d\d)/u, (_, hora: string) => `T${String(Number(hora) + 1).padStart(2, '0')}`),
  notes: '', answers: [], prayerText: '', prayerReviewAt: '', followUp: null, task: null, incomeAnswers: [], roundId: null,
})

describe('um processo só', () => {
  it('criado pela aba Casamentos, sem data, sem local e sem nada na Agenda', async () => {
    const c = await cenario()
    const criado = await c.casamentos.criar(c.accountId, c.key, 'casamentos', { ...noivos, dataPretendida: '2027-03-01' })
    expect(await c.casamentos.obter(c.accountId, c.key, criado.id)).toMatchObject({ dataPretendida: '2027-03-01', cerimonia: { data: '' }, etapa: 'primeiro_contato' })
    expect(await c.agenda.listEvents(c.accountId, c.key)).toHaveLength(0)
    expect(criado.historico.map(({ texto }) => texto)).toEqual(['Acompanhamento criado pela aba Casamentos'])
  })

  it('várias visitas de noivos que não são membros apontam para o mesmo registro', async () => {
    const c = await cenario()
    const criado = await c.casamentos.criar(c.accountId, c.key, 'visitacao', noivos)
    await c.care.completeVisit(c.accountId, c.key, visita(criado.id, '2026-09-15T19:00'))
    await c.care.completeVisit(c.accountId, c.key, visita(criado.id, '2026-09-22T19:00'))
    expect(await c.casamentos.visitas(c.accountId, c.key, criado.id)).toHaveLength(2)
    expect(await c.casamentos.listar(c.accountId, c.key)).toHaveLength(1)
  })

  it('visita sem pessoa só é aceita quando é de um casamento', async () => {
    const c = await cenario()
    await expect(c.care.completeVisit(c.accountId, c.key, { ...visita('', '2026-09-15T19:00'), casamentoId: null })).rejects.toThrow('Selecione a pessoa')
  })

  it('a Agenda cria o compromisso já apontando para o acompanhamento criado com o mesmo id', async () => {
    const c = await cenario()
    const id = crypto.randomUUID()
    const evento = await c.agenda.createEvent(c.accountId, c.key, cerimonia(id))
    await c.casamentos.criar(c.accountId, c.key, 'agenda', { ...noivos, cerimonia: { data: '2027-01-10', inicio: '16:00', fim: '17:30', igrejaId: 'igreja-a', local: 'Templo fictício' } }, id)
    expect((await c.casamentos.compromissos(c.accountId, c.key, id)).map(({ id: eventoId }) => eventoId)).toEqual([evento.id])
  })

  it('salvar acrescenta ao histórico; cancelar preserva entrevistas e histórico', async () => {
    const c = await cenario()
    const criado = await c.casamentos.criar(c.accountId, c.key, 'casamentos', noivos)
    const comEntrevista = await c.casamentos.salvar(c.accountId, c.key, {
      ...criado, entrevistas: [{ id: 'e1', data: '2026-09-20', realizadaPor: 'Pastor Fictício', respostas: { vestuario: 'sim', principios: 'sim', recepcao: null, ornamentacao: 'nao' }, cursoNaData: null, visitaId: null, registradaEm: '' }],
    }, 'Entrevista pastoral registrada')
    const cancelado = await c.casamentos.salvar(c.accountId, c.key, { ...comEntrevista, etapa: 'cancelado' }, 'Casamento cancelado')
    const lido = await c.casamentos.obter(c.accountId, c.key, cancelado.id)
    expect(lido?.etapa).toBe('cancelado')
    expect(lido?.entrevistas[0]?.respostas).toEqual({ vestuario: 'sim', principios: 'sim', recepcao: null, ornamentacao: 'nao' })
    expect(lido?.historico.map(({ texto }) => texto)).toEqual(['Acompanhamento criado pela aba Casamentos', 'Entrevista pastoral registrada', 'Casamento cancelado'])
  })
})

describe('Agenda e acompanhamento sincronizados', () => {
  it('mudar data, horário ou local na Agenda atualiza o acompanhamento, uma vez', async () => {
    const c = await cenario()
    const criado = await c.casamentos.criar(c.accountId, c.key, 'agenda', noivos)
    const evento = await c.agenda.createEvent(c.accountId, c.key, cerimonia(criado.id))
    const { id, createdAt: _c, updatedAt: _u, ...dados } = evento
    void _c; void _u
    const movido = await c.agenda.updateEvent(c.accountId, c.key, id, { ...dados, startAt: '2027-01-12T10:00', endAt: '2027-01-12T11:00', location: 'Salão fictício' })
    const depois = await c.casamentos.sincronizarDaAgenda(c.accountId, c.key, movido)
    expect(depois?.cerimonia).toEqual({ data: '2027-01-12', inicio: '10:00', fim: '11:00', igrejaId: 'igreja-a', local: 'Salão fictício' })
    await c.casamentos.sincronizarDaAgenda(c.accountId, c.key, movido)
    expect((await c.casamentos.obter(c.accountId, c.key, criado.id))?.historico.filter(({ texto }) => texto.includes('alterados na Agenda')).length).toBe(1)
  })

  it('mudar no acompanhamento atualiza o compromisso, sem regravar quando nada mudou', async () => {
    const c = await cenario()
    const criado = await c.casamentos.criar(c.accountId, c.key, 'agenda', noivos)
    const evento = await c.agenda.createEvent(c.accountId, c.key, cerimonia(criado.id))
    const alterado = { ...criado, noiva: { ...criado.noiva, nome: 'Ana Maria Fictícia' }, cerimonia: { data: '2027-02-01', inicio: '15:00', fim: '16:00', igrejaId: 'igreja-a', local: 'Templo novo fictício' } }
    const atualizado = await c.casamentos.sincronizarParaAgenda(c.accountId, c.key, alterado)
    expect(atualizado).toMatchObject({ id: evento.id, startAt: '2027-02-01T15:00', endAt: '2027-02-01T16:00', location: 'Templo novo fictício', title: 'Casamento de Ana Maria Fictícia e Bruno Fictício' })
    const deNovo = await c.casamentos.sincronizarParaAgenda(c.accountId, c.key, alterado)
    expect(deNovo?.updatedAt).toBe(atualizado?.updatedAt)
    expect(await c.agenda.listEvents(c.accountId, c.key)).toHaveLength(1)
  })

  it('sem data confirmada, o compromisso existente não é esvaziado', async () => {
    const c = await cenario()
    const criado = await c.casamentos.criar(c.accountId, c.key, 'agenda', noivos)
    await c.agenda.createEvent(c.accountId, c.key, cerimonia(criado.id))
    const evento = await c.casamentos.sincronizarParaAgenda(c.accountId, c.key, criado)
    expect(evento?.startAt).toBe('2027-01-10T16:00')
  })

  it('ensaio é um só; entrevistas podem ser várias', async () => {
    const c = await cenario()
    const criado = await c.casamentos.criar(c.accountId, c.key, 'casamentos', noivos)
    await c.casamentos.agendarCompromisso(c.accountId, c.key, criado, 'ensaio', { data: '2027-01-09', inicio: '19:00', fim: '', local: 'Templo fictício' })
    await c.casamentos.agendarCompromisso(c.accountId, c.key, criado, 'ensaio', { data: '2027-01-08', inicio: '19:30', fim: '', local: 'Templo fictício' })
    await c.casamentos.agendarCompromisso(c.accountId, c.key, criado, 'entrevista', { data: '2026-10-01', inicio: '19:00', fim: '', local: 'Gabinete fictício' })
    await c.casamentos.agendarCompromisso(c.accountId, c.key, criado, 'entrevista', { data: '2026-10-15', inicio: '19:00', fim: '', local: 'Gabinete fictício' })
    const compromissos = await c.casamentos.compromissos(c.accountId, c.key, criado.id)
    expect(compromissos.filter(({ papelNoCasamento }) => papelNoCasamento === 'ensaio').map(({ startAt }) => startAt)).toEqual(['2027-01-08T19:30'])
    expect(compromissos.filter(({ papelNoCasamento }) => papelNoCasamento === 'entrevista')).toHaveLength(2)
  })
})

describe('comissão', () => {
  it('vincula a reunião com uma pauta identificável, uma só, e não cria decisão', async () => {
    const c = await cenario()
    const criado = await c.casamentos.criar(c.accountId, c.key, 'casamentos', noivos)
    const agora = new Date().toISOString()
    const reuniao = await c.commissions.saveMeeting(c.accountId, c.key, {
      churchId: 'igreja-a', kind: 'board', date: '2026-10-05', time: '19:30', location: '', presidentId: '', secretaryId: '', participantIds: [],
      guestNames: [], votingGuestNames: [], openingPrayer: '', reflection: '', notes: '', agenda: [], createdAt: agora, updatedAt: agora,
    })
    const vinculado = await c.casamentos.vincularComissao(c.accountId, c.key, criado, reuniao.id)
    await c.casamentos.vincularComissao(c.accountId, c.key, vinculado, reuniao.id)
    const pautas = (await c.commissions.meeting(c.accountId, c.key, reuniao.id))!.agenda
    expect(pautas.map(({ title }) => title)).toEqual(['Recomendação do casamento de Ana Fictícia e Bruno Fictício'])
    expect(pautas[0]?.vote).toBeUndefined()
    const lido = await c.casamentos.obter(c.accountId, c.key, criado.id)
    expect(lido?.comissao).toMatchObject({ meetingId: reuniao.id, igrejaId: 'igreja-a', situacao: 'pendente' })
  })
})

describe('migração dos casamentos já marcados', () => {
  async function gravarAntigo(c: Awaited<ReturnType<typeof cenario>>, extra: Record<string, unknown>) {
    const id = crypto.randomUUID()
    const data = {
      ...cerimonia(''), casamentoId: undefined, papelNoCasamento: undefined, title: 'Casamento antigo fictício',
      startAt: '2025-05-11T16:00', endAt: '2025-05-11T17:00', createdAt: '2025-01-01T00:00:00.000Z', updatedAt: '2025-01-01T00:00:00.000Z', ...extra,
    }
    await c.repo.saveEncrypted(c.accountId, 'aparelho', id, await encryptPayload(c.key, { schemaVersion: 1, type: 'agenda_event', data }, id), 'agenda_event')
    return id
  }

  it('cria o acompanhamento com o que o compromisso tinha, sem inventar respostas', async () => {
    const c = await cenario()
    const eventoId = await gravarAntigo(c, { casamento: { noivo: 'Carlos Fictício', noiva: 'Dora Fictícia', cursoDeNoivos: true, passouPelaComissao: true, dataCivil: '2025-05-01', dataReligiosa: '2025-05-11' } })
    const resultado = await c.casamentos.migrarCompromissosAntigos(c.accountId, c.key)
    expect(resultado).toMatchObject({ criados: 1, vinculados: 1, ilegiveis: 0 })

    const id = await idDoCasamentoDoCompromisso(eventoId)
    const casamento = await c.casamentos.obter(c.accountId, c.key, id)
    expect(casamento).toMatchObject({
      noiva: { nome: 'Dora Fictícia' }, noivo: { nome: 'Carlos Fictício' }, origem: 'migracao',
      cerimonia: { data: '2025-05-11', inicio: '16:00', fim: '17:00', igrejaId: 'igreja-a', local: 'Templo fictício' },
      civil: { data: '2025-05-01' }, curso: { situacao: 'concluido' }, comissao: { situacao: 'pendente' }, entrevistas: [],
    })
    expect(casamento?.historico.some(({ texto }) => texto.includes('passou pela comissão: Sim'))).toBe(true)
    expect(await c.agenda.getEvent(c.accountId, c.key, eventoId)).toMatchObject({ casamentoId: id, papelNoCasamento: 'cerimonia', title: 'Casamento antigo fictício' })
  })

  it('rodar de novo não duplica, e pessoas envolvidas antigas continuam no compromisso', async () => {
    const c = await cenario()
    const eventoId = await gravarAntigo(c, { ceremonyDetails: { responsible: '', involvedPersonIds: ['p1', 'p2'], childPersonId: null, parentPersonIds: [], checklist: {} } })
    const primeira = await c.casamentos.migrarCompromissosAntigos(c.accountId, c.key)
    expect(primeira.ambiguidades[0]).toContain('não tinha os nomes')
    const antes = await c.database.vaultRecords.count()
    expect(await c.casamentos.migrarCompromissosAntigos(c.accountId, c.key)).toMatchObject({ criados: 0, vinculados: 0 })
    expect(await c.database.vaultRecords.count()).toBe(antes)
    expect(await c.casamentos.listar(c.accountId, c.key)).toHaveLength(1)
    expect((await c.agenda.getEvent(c.accountId, c.key, eventoId))?.ceremonyDetails?.involvedPersonIds).toEqual(['p1', 'p2'])
  })

  it('não mexe no que não é casamento', async () => {
    const c = await cenario()
    await gravarAntigo(c, { category: 'baptism' })
    expect(await c.casamentos.migrarCompromissosAntigos(c.accountId, c.key)).toMatchObject({ criados: 0, vinculados: 0 })
  })
})
