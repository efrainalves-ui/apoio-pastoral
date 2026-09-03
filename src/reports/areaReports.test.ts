import { describe, expect, it } from 'vitest'
import type { AgendaEventEntity } from '../agenda/types'
import type { VisitEntity, VisitRoundEntity } from '../care/types'
import { agendaReportLines, goalsReportLines, sermonReportLines, visitReportLines } from './areaReports'
import { CommissionService } from '../commissions/service'
import { campaignReportLines } from '../evangelism/report'
import { publicReportText } from '../nominations/core'
import { NominationService } from '../nominations/service'
import { NOME_OMITIDO, personNameResolver } from './includeNames'

const IGREJA = 'igreja-ficticia'
const nomeIgreja = (id: string | null) => (id === IGREJA ? 'Igreja Fictícia' : 'Distrito')

const visita = (targetType: 'person' | 'family'): VisitEntity => ({
  id: crypto.randomUUID(), targetType, targetId: 'alvo-ficticio', churchId: IGREJA, scheduledEventId: null, mode: 'quick', status: 'completed',
  currentVersion: 1, versions: [], createdAt: '', updatedAt: '',
})

const rodada = (alvos: number, visitadas: number): VisitRoundEntity => ({
  id: crypto.randomUUID(), name: 'Rodada Fictícia', churchId: IGREJA, status: 'active',
  targetFamilyIds: Array.from({ length: alvos }, (_, indice) => `familia-${indice}`),
  visitedFamilyIds: Array.from({ length: visitadas }, (_, indice) => `familia-${indice}`),
  startedAt: '2026-09-01T12:00:00.000Z', completedAt: null, createdAt: '', updatedAt: '',
})

const evento = (partes: Partial<AgendaEventEntity>): AgendaEventEntity => ({
  id: crypto.randomUUID(), title: 'Compromisso Fictício', category: 'event', churchId: IGREJA, location: 'Salão Fictício', address: '',
  visitTarget: 'none', sermonId: null, sermonSnapshot: null, ceremonyDetails: null, linkedSource: null,
  startAt: '2026-09-10T19:00', endAt: '2026-09-10T20:30', allDay: false, reminderMinutes: 60, notes: '', includeInItinerary: true,
  mondayException: false, createdAt: '', updatedAt: '', ...partes,
})

describe('relatórios de cada área', () => {
  it('resume as visitas e o que falta nas rodadas', () => {
    const linhas = visitReportLines([visita('person'), visita('family')], [rodada(4, 1)], 'Igreja Fictícia')

    expect(linhas).toEqual([
      'Abrangência: Igreja Fictícia',
      'Visitas: 2',
      'Pessoas: 1',
      'Famílias: 1',
      'Pendentes na rodada: 3',
    ])
  })

  // A observação do compromisso só entra quando o pastor pede.
  it('monta o itinerário da agenda e só inclui observações quando pedido', () => {
    const evento1 = evento({ title: 'Reunião Fictícia', notes: 'Observação reservada' })

    expect(agendaReportLines([evento1], nomeIgreja).join('\n')).not.toContain('Observação reservada')
    expect(agendaReportLines([evento1], nomeIgreja, true).join('\n')).toContain('Observação reservada')
    expect(agendaReportLines([evento1], nomeIgreja)[0]).toBe('Compromissos incluídos: 1')
  })

  it('leva metas e missão no mesmo relatório', () => {
    const linhas = goalsReportLines(2026, [
      { area: 'baptisms', target: 40, result: 10, percent: 25 },
      { area: 'bible_studies', target: 0, result: 3, percent: 0 },
    ], { interests: 5, studies: 3, pairs: 2, classes: 4, groups: 6, uapgs: 1 })

    expect(linhas).toContain('Batismos: 10 de 40 · 25%')
    expect(linhas).toContain('Estudos Bíblicos: 3 de meta a definir')
    expect(linhas).toContain('Duplas missionárias ativas: 2')
    expect(linhas).toContain('UAPG ativas: 1')
  })

  it('lista as pregações com data e igreja', () => {
    const linhas = sermonReportLines([evento({ category: 'preaching', title: 'Pregação Fictícia' })], 7, nomeIgreja)

    expect(linhas[0]).toBe('Pregações: 1')
    // Por padrão o título fica de fora: ele pode carregar nome de pessoa.
    expect(linhas[1]).toContain('Igreja Fictícia')
    expect(linhas.join('\n')).not.toContain('Pregação Fictícia')
    expect(linhas.at(-1)).toBe('Sermões no acervo: 7')
  })

  it('só inclui o título da pregação quando o pastor pede nomes', () => {
    const linhas = sermonReportLines([evento({ category: 'preaching', title: 'Batismo de Pessoa Fictícia' })], 7, nomeIgreja, true)

    expect(linhas[1]).toContain('Batismo de Pessoa Fictícia')
  })

  it('o relatório de agenda também guarda os títulos por padrão', () => {
    const linhas = agendaReportLines([evento({ category: 'visit', title: 'Visita a Pessoa Fictícia' })], nomeIgreja)

    expect(linhas.join('\n')).not.toContain('Pessoa Fictícia')
    expect(agendaReportLines([evento({ category: 'visit', title: 'Visita a Pessoa Fictícia' })], nomeIgreja, true).join('\n'))
      .toContain('Visita a Pessoa Fictícia')
  })

})

describe('a confirmação de nomes é a mesma em todo documento', () => {
  it('a pauta e a ata da comissão saem sem nomear ninguém por padrão', () => {
    const reuniao = {
      id: 'r1', churchId: 'i1', kind: 'board' as const, date: '2026-05-01', time: '19:30', location: 'Igreja Fictícia',
      presidentId: 'p1', secretaryId: 'p2', participantIds: ['p1', 'p2'], guestNames: [], votingGuestNames: [],
      openingPrayer: '', reflection: '', notes: '', agenda: [], createdAt: '', updatedAt: '',
    }
    const nome = (id: string) => (id === 'p1' ? 'Pessoa Fictícia Presidente' : 'Pessoa Fictícia Secretária')
    const service = new CommissionService()

    const semNomes = service.agendaDocument(reuniao, 'Igreja Fictícia', personNameResolver(false, nome))
    const comNomes = service.agendaDocument(reuniao, 'Igreja Fictícia', personNameResolver(true, nome))

    expect(semNomes).not.toContain('Pessoa Fictícia Presidente')
    expect(semNomes).toContain(NOME_OMITIDO)
    expect(comNomes).toContain('Pessoa Fictícia Presidente')

    const ata = service.minutesDocument(reuniao, 'Igreja Fictícia', 2, personNameResolver(false, nome))
    expect(ata).not.toContain('Pessoa Fictícia Secretária')
  })

  it('o relatório da comissão de nomeações sai sem os indicados por padrão', () => {
    const processo = { period: '2026-2027', formation: {}, offices: [], candidates: [], meetings: [], reports: [], objections: [], officialVotes: [], vacancyProcesses: [], tasks: [], history: [], churchId: 'i1', status: 'ready', createdAt: '', updatedAt: '' } as never
    const versao = { id: 'v1', version: 1, createdAt: '', presentationDate: '2026-06-01', officialVoteDate: '', lines: [{ officeId: 'o1', officeTitle: 'Ancião', personId: 'p1', personName: 'Pessoa Fictícia Indicada' }], openOffices: [], publicNote: '' }

    expect(publicReportText('Igreja Fictícia', processo, versao)).not.toContain('Pessoa Fictícia Indicada')
    expect(publicReportText('Igreja Fictícia', processo, versao)).toContain('Ancião')
    expect(publicReportText('Igreja Fictícia', processo, versao, true)).toContain('Pessoa Fictícia Indicada')
  })

  it('o relatório da campanha só nomeia quem está em acompanhamento quando pedido', () => {
    const campanha = {
      id: 'c1', name: 'Campanha Fictícia', objective: 'other' as const, churchIds: [], startDate: '2026-01-01', endDate: '2026-01-10',
      location: '', address: '', responsibleGeneral: '', mainSpeaker: '', team: [], status: 'completed' as const, description: '', notes: '',
      goalId: null, planningAreas: [], additionalSchedule: 'none' as const, mainAgendaEventId: null, additionalAgendaEventIds: [],
      points: [], tasks: [], checklist: [], plannedBudget: 0, budgetItems: [],
      followUps: [{ id: 'f1', type: 'person' as const, recordId: 'p1', churchId: null, displayName: 'Pessoa Fictícia Acompanhada', status: 'following' as const, notes: '' }],
      learnings: '', history: [], createdAt: '', updatedAt: '',
    }

    expect(campaignReportLines(campanha).join('\n')).not.toContain('Pessoa Fictícia Acompanhada')
    expect(campaignReportLines(campanha, true).join('\n')).toContain('Pessoa Fictícia Acompanhada')
  })


  it('o modelo salvo pelo pastor não é servido sem a confirmação de nomes', () => {
    // Um modelo salvo é texto livre: o aplicativo não sabe quais palavras ali
    // são nomes. Servi-lo com a caixa desmarcada seria dizer "sem nomes" e
    // entregar os nomes que o pastor digitou.
    const service = new NominationService()
    const processo = { period: '2026-2027', formation: {}, offices: [], candidates: [], meetings: [], reports: [], objections: [], officialVotes: [], vacancyProcesses: [], tasks: [], history: [], churchId: 'i1', status: 'ready', createdAt: '', updatedAt: '' } as never
    const reuniao = {
      id: 'r1', date: '2026-05-01', time: '19:30', location: 'Igreja Fictícia', presidentId: 'p1', secretaryId: 'p2',
      participantIds: ['p1'], guestNames: [], quorum: 2, openingPrayer: '', reflection: '', agenda: [], confidentialNotes: '',
      nextMeetingDate: '', corrections: [],
      agendaTemplate: 'Pauta escrita à mão citando Pessoa Fictícia Presidente',
      minutesTemplate: 'Ata escrita à mão citando Pessoa Fictícia Presidente',
    }
    const nome = (id: string) => (id === 'p1' ? 'Pessoa Fictícia Presidente' : 'Pessoa Fictícia Secretária')

    for (const gerar of [
      (incluir: boolean) => service.meetingAgendaTemplate('Igreja Fictícia', processo, reuniao, personNameResolver(incluir, nome), incluir),
      (incluir: boolean) => service.meetingMinutesTemplate('Igreja Fictícia', processo, reuniao, personNameResolver(incluir, nome), incluir),
    ]) {
      expect(gerar(false)).not.toContain('Pessoa Fictícia Presidente')
      expect(gerar(false)).toContain(NOME_OMITIDO)
      expect(gerar(true)).toContain('Pessoa Fictícia Presidente')
    }
  })

  it('o modelo do relatório final segue a mesma regra', () => {
    const service = new NominationService()
    const processo = { period: '2026-2027', formation: {}, offices: [], candidates: [], meetings: [], reports: [], objections: [], officialVotes: [], vacancyProcesses: [], tasks: [], history: [], churchId: 'i1', status: 'ready', createdAt: '', updatedAt: '' } as never
    const versao = {
      id: 'v1', version: 1, createdAt: '', presentationDate: '2026-06-01', officialVoteDate: '',
      lines: [{ officeId: 'o1', officeTitle: 'Ancião', personId: 'p1', personName: 'Pessoa Fictícia Indicada' }],
      openOffices: [], publicNote: '', reportTemplate: 'Relatório à mão com Pessoa Fictícia Indicada',
    }

    expect(service.finalReportTemplate('Igreja Fictícia', processo, versao)).not.toContain('Pessoa Fictícia Indicada')
    expect(service.finalReportTemplate('Igreja Fictícia', processo, versao, true)).toContain('Pessoa Fictícia Indicada')
  })

  it('o registro confidencial da reunião também obedece à confirmação', () => {
    const service = new NominationService()
    const processo = { period: '2026-2027', formation: {}, offices: [], candidates: [], meetings: [], reports: [], objections: [], officialVotes: [], vacancyProcesses: [], tasks: [], history: [], churchId: 'i1', status: 'ready', createdAt: '', updatedAt: '' } as never
    const reuniao = {
      id: 'r1', date: '2026-05-01', time: '19:30', location: 'Igreja Fictícia', presidentId: 'p1', secretaryId: 'p2',
      participantIds: ['p1'], guestNames: [], quorum: 2, openingPrayer: '', reflection: '', agenda: [], confidentialNotes: '',
      nextMeetingDate: '', corrections: [],
    }
    const nome = () => 'Pessoa Fictícia Presidente'

    expect(service.internalRecord(processo, reuniao, personNameResolver(false, nome))).not.toContain('Pessoa Fictícia Presidente')
    expect(service.internalRecord(processo, reuniao, personNameResolver(true, nome))).toContain('Pessoa Fictícia Presidente')
  })
})
