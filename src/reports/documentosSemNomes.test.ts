import { describe, expect, it } from 'vitest'
import { buildItineraryPdf } from '../agenda/itineraryPdf'
import type { ItineraryItem } from '../agenda/types'
import { CommissionService } from '../commissions/service'
import type { CommissionEntity, CommissionMeetingData } from '../commissions/types'
import { campaignReportLines } from '../evangelism/report'
import type { EvangelismCampaignEntity } from '../evangelism/types'
import { defaultFinalReport, defaultMeetingAgenda, defaultMeetingMinutes, publicReportText } from '../nominations/core'
import { NominationService } from '../nominations/service'
import type { NominationMeeting, NominationProcessEntity, NominationReportVersion } from '../nominations/types'
import { agendaReportLines, sermonReportLines } from './areaReports'
import { personNameResolver } from './redaction'

/**
 * Nomes e textos-sentinela em todos os tipos de documento.
 *
 * A regra é uma só, e vale para todo documento que sai daqui: sem "Incluir
 * nomes" confirmado, nada identificável pode aparecer — nome, convidado,
 * assinatura, campo livre, oração, reflexão, aprendizado, pauta, observação.
 *
 * A auditoria mostrou que a versão anterior escondia o campo Nome e deixava
 * passar todo o resto: a ata da comissão trazia a oração inicial, a reflexão,
 * os convidados e as observações; o itinerário trazia o local e o endereço; o
 * relatório da campanha trazia o texto dos aprendizados; a assinatura da ata
 * trazia o nome do pastor digitado à mão. Cada sentinela abaixo corresponde a
 * um desses caminhos.
 */
const SENTINELAS_DE_PESSOA = [
  'Fulana Sentinela', 'Beltrano Sentinela', 'Convidada Sentinela', 'Pastor Sentinela',
  'Secretária Sentinela', 'Responsável Sentinela',
]

const SENTINELAS_DE_TEXTO_LIVRE = [
  'Oração pela irmã Sentinela', 'Reflexão sobre o irmão Sentinela',
  'Assunto sobre a família Sentinela', 'Proposta a respeito de Sentinela',
  'Observação reservada sobre Sentinela', 'Aprendizado sobre a Sentinela',
  'Rua Sentinela, 123', 'Casa da irmã Sentinela', 'Nota pública sobre Sentinela',
  'Item de pauta sobre Sentinela',
]

const TODAS = [...SENTINELAS_DE_PESSOA, ...SENTINELAS_DE_TEXTO_LIVRE]

function exigirSemSentinela(documento: string, tipo: string) {
  for (const sentinela of TODAS) {
    expect(documento, `${tipo} sem nomes confirmados não pode conter "${sentinela}"`).not.toContain(sentinela)
  }
}

const nomeReal = (id: string) => ({
  'pessoa-1': 'Fulana Sentinela',
  'pessoa-2': 'Beltrano Sentinela',
  'pessoa-3': 'Secretária Sentinela',
  'pessoa-4': 'Responsável Sentinela',
}[id] ?? `Pessoa ${id}`)

// --------------------------------------------------------------- fixtures

function reuniaoDeComissao(): CommissionEntity<CommissionMeetingData> {
  return {
    id: 'reuniao-ficticia',
    churchId: 'igreja-ficticia',
    kind: 'board',
    date: '2026-09-01',
    time: '19:00',
    location: 'Casa da irmã Sentinela',
    presidentId: '',
    presidentLabel: 'Pastor Sentinela',
    secretaryId: 'pessoa-3',
    participantIds: ['pessoa-1', 'pessoa-2'],
    guestNames: ['Convidada Sentinela'],
    votingGuestNames: [],
    openingPrayer: 'Oração pela irmã Sentinela',
    reflection: 'Reflexão sobre o irmão Sentinela',
    notes: 'Observação reservada sobre Sentinela',
    agenda: [{
      id: 'assunto-1', order: 1, title: 'Assunto sobre a família Sentinela',
      department: 'Secretaria', description: '', proposal: 'Proposta a respeito de Sentinela',
      decisionType: 'approve', customDecisionType: '', destination: 'internal',
      responsibleId: 'pessoa-4', dueDate: '2026-10-01', privateNotes: '',
      vote: { favorable: 3, against: 0, abstentions: 1, result: 'approved', voteNumber: '2026-001', finalText: 'Proposta a respeito de Sentinela', confirmedAt: '2026-09-01T20:00:00.000Z', presidentVoted: false, presidentTieBreak: null },
    }],
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  }
}

function reuniaoDeNomeacoes(): NominationMeeting {
  return {
    id: 'reuniao-nomeacoes',
    date: '2026-09-02', time: '20:00', location: 'Casa da irmã Sentinela',
    presidentId: 'pessoa-1', secretaryId: 'pessoa-3',
    participantIds: ['pessoa-1', 'pessoa-2'],
    guestNames: ['Convidada Sentinela'],
    quorum: 2,
    openingPrayer: 'Oração pela irmã Sentinela',
    reflection: 'Reflexão sobre o irmão Sentinela',
    agenda: ['Item de pauta sobre Sentinela'],
    confidentialNotes: 'Observação reservada sobre Sentinela',
    nextMeetingDate: '2026-09-16',
    corrections: [],
  }
}

function processoDeNomeacoes(): NominationProcessEntity {
  return {
    id: 'processo-ficticio', churchId: 'igreja-ficticia', period: '2026-2027', status: 'nominating',
    formation: { presidentId: 'pessoa-1', secretaryId: 'pessoa-3', districtLeaderId: '', organizingCommitteeIds: [], committeeMemberIds: ['pessoa-1', 'pessoa-2'], quorum: 2, startedAt: '2026-09-01' },
    offices: [{ id: 'cargo-1', area: 'Anciãos', title: 'Ancião', vacancies: 1, multiplePeople: false, allowsAssociates: false, description: '', status: 'open', indicatedByOtherCommittee: false, officialStatus: 'pending' }],
    candidates: [{ id: 'candidato-1', officeId: 'cargo-1', personId: 'pessoa-2', status: 'recommended', confidentialNote: 'Observação reservada sobre Sentinela', conversationDate: '', consent: true, refusalReason: '', eligibility: 'confirmed', fidelityAlert: false, vote: { favorable: 3, against: 0, abstentions: 0, result: 'approved', participantIds: ['pessoa-1'] } }],
    meetings: [reuniaoDeNomeacoes()], reports: [], objections: [], officialVotes: [], vacancyProcesses: [], tasks: [], history: [],
    createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
  } as unknown as NominationProcessEntity
}

function relatorioDeNomeacoes(): NominationReportVersion {
  return {
    id: 'relatorio-1', version: 1, createdAt: '2026-09-10T00:00:00.000Z',
    presentationDate: '2026-09-12', officialVoteDate: '2026-09-26',
    lines: [{ officeId: 'cargo-1', officeTitle: 'Ancião', personId: 'pessoa-2', personName: 'Beltrano Sentinela' }],
    openOffices: ['Diácono chefe'],
    publicNote: 'Nota pública sobre Sentinela',
  }
}

function campanhaFicticia(): EvangelismCampaignEntity {
  return {
    id: 'campanha-ficticia', name: 'Campanha da família Sentinela', objective: 'baptism',
    churchIds: ['igreja-ficticia'], startDate: '2026-10-01', endDate: '2026-10-10',
    location: 'Casa da irmã Sentinela', address: 'Rua Sentinela, 123',
    responsibleGeneral: 'Responsável Sentinela', mainSpeaker: 'Pastor Sentinela',
    team: [{ id: 'e1', personId: 'pessoa-1', role: 'music' }], status: 'completed',
    description: '', notes: '', goalId: null, planningAreas: [], additionalSchedule: 'none',
    mainAgendaEventId: null, additionalAgendaEventIds: [], points: [], tasks: [], checklist: [],
    plannedBudget: 0, budgetItems: [],
    followUps: [{ id: 'f1', type: 'person', recordId: 'pessoa-1', churchId: 'igreja-ficticia', displayName: 'Fulana Sentinela', status: 'pending', notes: '' }],
    learnings: 'Aprendizado sobre a Sentinela', history: [],
    createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-10T00:00:00.000Z',
  } as unknown as EvangelismCampaignEntity
}

const compromissoFicticio = {
  id: 'evento-ficticio', title: 'Visita a Fulana Sentinela', category: 'visit' as const,
  churchId: 'igreja-ficticia', location: 'Casa da irmã Sentinela', address: 'Rua Sentinela, 123',
  visitTarget: 'person' as const, sermonId: null, sermonSnapshot: null,
  startAt: '2026-09-05T14:00', endAt: '2026-09-05T15:00', allDay: false, reminderMinutes: 15,
  notes: 'Observação reservada sobre Sentinela', includeInItinerary: true, mondayException: false,
  createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
}

const itemDeItinerario: ItineraryItem = {
  id: 'evento-ficticio', title: 'Visita a Fulana Sentinela', category: 'visit',
  startAt: '2026-09-05T14:00', endAt: '2026-09-05T15:00', allDay: false,
  churchName: 'Igreja Fictícia', location: 'Casa da irmã Sentinela', address: 'Rua Sentinela, 123',
}

// ------------------------------------------------------------------ provas

describe('nenhum documento mostra nome sem a confirmação', () => {
  const commissions = new CommissionService()
  const nominations = new NominationService()
  const semNomes = personNameResolver(false, nomeReal)
  const comNomes = personNameResolver(true, nomeReal)

  it('pauta da comissão', () => {
    const doc = commissions.agendaDocument(reuniaoDeComissao(), 'Igreja Fictícia', semNomes)
    exigirSemSentinela(doc, 'pauta da comissão')
    // O documento continua sendo uma pauta: igreja, data e ordem dos assuntos.
    expect(doc).toContain('Igreja Fictícia')
    expect(doc).toContain('2026-09-01')
    expect(doc).toContain('1.')
  })

  it('ata da comissão', () => {
    const doc = commissions.minutesDocument(reuniaoDeComissao(), 'Igreja Fictícia', 2, semNomes)
    exigirSemSentinela(doc, 'ata da comissão')
    // A decisão continua legível: número do voto, contagem e resultado.
    expect(doc).toContain('2026-001')
    expect(doc).toContain('Favoráveis: 3')
    expect(doc).toContain('Resultado: approved')
  })

  it('pauta da Comissão de Nomeações', () => {
    const doc = defaultMeetingAgenda('Igreja Fictícia', processoDeNomeacoes(), reuniaoDeNomeacoes(), semNomes)
    exigirSemSentinela(doc, 'pauta de nomeações')
    expect(doc).toContain('Comissão de Nomeações')
  })

  it('ata da Comissão de Nomeações', () => {
    const doc = defaultMeetingMinutes('Igreja Fictícia', processoDeNomeacoes(), reuniaoDeNomeacoes(), semNomes)
    exigirSemSentinela(doc, 'ata de nomeações')
    expect(doc).toContain('Quórum')
  })

  it('modelos servidos pelo serviço, inclusive o texto salvo pelo pastor', () => {
    const processo = processoDeNomeacoes()
    // Um modelo salvo é texto livre inteiro: com a caixa desmarcada ele não é
    // servido, e vale o modelo padrão, que obedece à escolha.
    const reuniao = { ...reuniaoDeNomeacoes(), agendaTemplate: 'Modelo salvo citando Fulana Sentinela', minutesTemplate: 'Ata salva citando Beltrano Sentinela' }
    exigirSemSentinela(nominations.meetingAgendaTemplate('Igreja Fictícia', processo, reuniao, semNomes), 'modelo de pauta')
    exigirSemSentinela(nominations.meetingMinutesTemplate('Igreja Fictícia', processo, reuniao, semNomes), 'modelo de ata')
    expect(nominations.meetingAgendaTemplate('Igreja Fictícia', processo, reuniao, comNomes, true)).toContain('Modelo salvo citando Fulana Sentinela')
  })

  it('registro confidencial da Comissão de Nomeações', () => {
    const doc = nominations.internalRecord(processoDeNomeacoes(), reuniaoDeNomeacoes(), semNomes)
    exigirSemSentinela(doc, 'registro confidencial')
    expect(doc).toContain('Registro confidencial')
  })

  it('relatório público e relatório final de nomeações', () => {
    const processo = processoDeNomeacoes()
    const relatorio = relatorioDeNomeacoes()
    exigirSemSentinela(publicReportText('Igreja Fictícia', processo, relatorio), 'relatório público')
    exigirSemSentinela(defaultFinalReport('Igreja Fictícia', processo, relatorio), 'relatório final')
    exigirSemSentinela(nominations.finalReportTemplate('Igreja Fictícia', processo, { ...relatorio, reportTemplate: 'Modelo salvo citando Fulana Sentinela' }), 'modelo do relatório final')
    // A estrutura dos cargos continua saindo: é ela que a igreja precisa ver.
    expect(publicReportText('Igreja Fictícia', processo, relatorio)).toContain('Ancião')
  })

  it('votação oficial de nomeações', () => {
    const vote = { id: 'v1', mode: 'complete' as const, venue: 'administrative' as const, date: '2026-09-26', time: '10:00', location: 'Casa da irmã Sentinela', presidentId: 'pessoa-1', secretaryId: 'pessoa-3', participantIds: ['pessoa-1'], quorum: 2, favorable: 10, against: 0, abstentions: 1, result: 'approved' as const, required: 6, corrections: [] }
    exigirSemSentinela(nominations.officialAgenda(processoDeNomeacoes(), vote), 'pauta da votação oficial')
    exigirSemSentinela(nominations.officialMinutes(processoDeNomeacoes(), vote, semNomes), 'ata da votação oficial')
  })

  it('itinerário em PDF', () => {
    const pdf = new TextDecoder('latin1').decode(buildItineraryPdf([itemDeItinerario], 'Semana fictícia'))
    exigirSemSentinela(pdf, 'itinerário')
    expect(pdf).toContain('Igreja Fictícia')
    expect(pdf).toContain('05/09/2026')
  })

  it('relatório de agenda', () => {
    const linhas = agendaReportLines([compromissoFicticio], () => 'Igreja Fictícia').join('\n')
    exigirSemSentinela(linhas, 'relatório de agenda')
    expect(linhas).toContain('Igreja Fictícia')
  })

  it('histórico de pregações', () => {
    const linhas = sermonReportLines([{ ...compromissoFicticio, category: 'preaching' }], 3, () => 'Igreja Fictícia').join('\n')
    exigirSemSentinela(linhas, 'histórico de pregações')
    expect(linhas).toContain('Pregações: 1')
  })

  it('relatório de encerramento da campanha', () => {
    const linhas = campaignReportLines(campanhaFicticia()).join('\n')
    exigirSemSentinela(linhas, 'relatório da campanha')
    expect(linhas).toContain('Acompanhamentos: 1')
  })
})

describe('com a confirmação marcada, os nomes voltam', () => {
  const commissions = new CommissionService()
  const comNomes = personNameResolver(true, nomeReal)

  it('a ata da comissão volta a trazer nome, oração, reflexão e assinatura', () => {
    const doc = commissions.minutesDocument(reuniaoDeComissao(), 'Igreja Fictícia', 2, comNomes, true)
    expect(doc).toContain('Pastor Sentinela')
    expect(doc).toContain('Oração pela irmã Sentinela')
    expect(doc).toContain('Reflexão sobre o irmão Sentinela')
    expect(doc).toContain('Convidada Sentinela')
    expect(doc).toContain('Observação reservada sobre Sentinela')
    expect(doc).toContain('Pastor Sentinela — Presidente')
  })

  it('o relatório da campanha volta a trazer nome e aprendizados', () => {
    const linhas = campaignReportLines(campanhaFicticia(), true).join('\n')
    expect(linhas).toContain('Campanha da família Sentinela')
    expect(linhas).toContain('Aprendizado sobre a Sentinela')
    expect(linhas).toContain('Fulana Sentinela')
  })

  it('a ata de nomeações volta a trazer convidados, oração e reflexão', () => {
    const doc = defaultMeetingMinutes('Igreja Fictícia', processoDeNomeacoes(), reuniaoDeNomeacoes(), comNomes, true)
    expect(doc).toContain('Convidada Sentinela')
    expect(doc).toContain('Oração pela irmã Sentinela')
    expect(doc).toContain('Reflexão sobre o irmão Sentinela')
  })
})
