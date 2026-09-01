import { requiredMajority, voteResult } from '../commissions/core'
import type { PersonEntity } from '../people/types'
import type { NominationCandidate, NominationMeeting, NominationOffice, NominationProcessData, NominationReportVersion } from './types'

export const COMMON_OFFICES: Array<{ area: string; title: string; vacancies: number }> = [
  { area: 'Anciãos', title: 'Ancião(ã)', vacancies: 2 }, { area: 'Secretaria', title: 'Secretário(a)', vacancies: 1 }, { area: 'Tesouraria', title: 'Tesoureiro(a)', vacancies: 1 }, { area: 'Diaconato', title: 'Diácono/Diaconisa', vacancies: 4 },
  { area: 'Escola Sabatina', title: 'Diretor(a) da Escola Sabatina', vacancies: 1 }, { area: 'Ministério Pessoal', title: 'Diretor(a) de Ministério Pessoal', vacancies: 1 }, { area: 'Ministério Jovem', title: 'Diretor(a) de Jovens', vacancies: 1 },
  { area: 'Ministério da Criança', title: 'Diretor(a) do Ministério da Criança', vacancies: 1 }, { area: 'Música', title: 'Diretor(a) de Música', vacancies: 1 }, { area: 'Comunicação', title: 'Diretor(a) de Comunicação', vacancies: 1 },
  { area: 'Saúde', title: 'Diretor(a) de Saúde', vacancies: 1 }, { area: 'Família', title: 'Diretor(a) do Ministério da Família', vacancies: 1 }, { area: 'Mordomia', title: 'Diretor(a) de Mordomia', vacancies: 1 },
  { area: 'Missão', title: 'Coordenador(a) de Missão', vacancies: 1 }, { area: 'Pequenos Grupos', title: 'Coordenador(a) de Pequenos Grupos', vacancies: 1 },
]
export function fidelityNeedsReview(person: PersonEntity): boolean { return person.fidelity?.category !== 'tither' }
export function internalVote(favorable: number, against: number, abstentions: number, participants: number, quorum: number) { const hasQuorum = quorum > 0 && participants >= quorum; return { result: voteResult(favorable, against, abstentions, hasQuorum), required: requiredMajority(favorable, against), hasQuorum } }
export function candidateReady(candidate: NominationCandidate): boolean { return candidate.consent && candidate.eligibility === 'confirmed' && candidate.vote?.result === 'approved' }
export function officeRecommendedCount(process: NominationProcessData, officeId: string): number { return process.candidates.filter((candidate) => candidate.officeId === officeId && candidateReady(candidate)).length }
export function processMetrics(process: NominationProcessData) { const active = process.offices.filter((office) => office.status !== 'archived' && office.status !== 'not_applicable'); return { filled: active.filter((office) => officeRecommendedCount(process, office.id) >= office.vacancies).length, vacant: active.filter((office) => officeRecommendedCount(process, office.id) < office.vacancies).length, awaitingConsent: process.candidates.filter((candidate) => !candidate.consent && !['declined', 'withdrawn', 'not_recommended'].includes(candidate.status)).length, awaitingEligibility: process.candidates.filter((candidate) => candidate.eligibility === 'pending').length, readyToVote: process.candidates.filter((candidate) => candidate.consent && candidate.eligibility === 'confirmed' && !candidate.vote).length, objections: process.objections.filter((objection) => objection.decision === 'pending').length } }
export function publicReport(process: NominationProcessData, people: PersonEntity[]): Omit<NominationReportVersion, 'id' | 'version' | 'createdAt'> { const lines = process.candidates.filter(candidateReady).map((candidate) => ({ officeId: candidate.officeId, officeTitle: process.offices.find((office) => office.id === candidate.officeId)?.title ?? 'Cargo', personId: candidate.personId, personName: people.find((person) => person.id === candidate.personId)?.name ?? 'Pessoa cadastrada' })); const openOffices = process.offices.filter((office) => office.status === 'open' && lines.filter((line) => line.officeId === office.id).length < office.vacancies).map((office) => office.title); return { presentationDate: '', officialVoteDate: '', lines, openOffices, publicNote: '' } }
export function publicReportText(churchName: string, process: NominationProcessData, report: NominationReportVersion): string { return [churchName, 'Relatório da Comissão de Nomeações', `Período: ${process.period}`, report.presentationDate ? `Data de apresentação: ${report.presentationDate}` : 'Data de apresentação: a definir', ...report.lines.map((line) => `${line.officeTitle}: ${line.personName}`), ...(report.openOffices.length ? ['Vagas ainda abertas:', ...report.openOffices.map((office) => `- ${office}`)] : []), report.publicNote].filter(Boolean).join('\n\n') }
export function officeDefault(area: string, title: string, vacancies = 1): NominationOffice { return { id: crypto.randomUUID(), area, title, vacancies, multiplePeople: vacancies > 1, description: '', status: 'open', indicatedByOtherCommittee: false, officialStatus: 'pending' } }

/**
 * Modelos pastorais padrão da Comissão de Nomeações.
 *
 * A estrutura segue a prática descrita no Manual da Igreja: a comissão prepara
 * a lista de indicados, ouve os membros que queiram sugerir ou objetar, e o
 * relatório é apresentado à igreja em duas leituras antes da votação. As
 * discussões da comissão são confidenciais.
 *
 * Todo o texto é apenas um ponto de partida: o pastor edita livremente e o que
 * ele salvar passa a valer no lugar deste modelo.
 */
export function defaultMeetingAgenda(churchName: string, process: NominationProcessData, meeting: NominationMeeting, personName: (id: string) => string): string {
  return [
    `${churchName} · Comissão de Nomeações`,
    `Pauta da reunião · Período ${process.period}`,
    `Data: ${meeting.date || 'a definir'} · Horário: ${meeting.time || 'a definir'} · Local: ${meeting.location || 'a definir'}`,
    `Presidente: ${personName(meeting.presidentId)} · Secretário(a): ${personName(meeting.secretaryId)}`,
    `Quórum: ${meeting.participantIds.length} presentes; mínimo ${meeting.quorum}.`,
    '1. Oração inicial e leitura devocional.',
    '2. Lembrete de confidencialidade: tudo o que for tratado aqui não sai desta comissão.',
    '3. Conferência do quórum e das presenças.',
    '4. Leitura da lista de cargos a preencher no período.',
    '5. Análise dos nomes indicados, cargo a cargo.',
    '6. Confirmação de que cada indicado é membro em situação regular e de que a fidelidade foi conferida com discrição.',
    '7. Audiência dos membros que pediram para sugerir ou objetar, se houver.',
    '8. Consentimento dos indicados: quem fala com cada pessoa e até quando.',
    '9. Definição da lista que será apresentada à igreja.',
    '10. Data da primeira leitura do relatório e prazo para objeções.',
    ...meeting.agenda.map((item, index) => `${index + 11}. ${item}`),
    meeting.nextMeetingDate ? `Próxima reunião: ${meeting.nextMeetingDate}` : '',
    'Oração final.',
  ].filter(Boolean).join('\n\n')
}

export function defaultMeetingMinutes(churchName: string, process: NominationProcessData, meeting: NominationMeeting, personName: (id: string) => string): string {
  return [
    `${churchName} · Comissão de Nomeações`,
    `Ata da reunião · Período ${process.period}`,
    `Data: ${meeting.date || 'a definir'} · Horário: ${meeting.time || 'a definir'} · Local: ${meeting.location || 'a definir'}`,
    `Presidente: ${personName(meeting.presidentId)} · Secretário(a): ${personName(meeting.secretaryId)}`,
    `Presentes: ${meeting.participantIds.map(personName).join(', ') || 'a registrar'}`,
    meeting.guestNames.length ? `Convidados: ${meeting.guestNames.join(', ')}` : '',
    `Quórum: ${meeting.participantIds.length} presentes; mínimo ${meeting.quorum}. ${meeting.participantIds.length >= meeting.quorum ? 'Quórum confirmado.' : 'Sem quórum.'}`,
    meeting.openingPrayer ? `Oração inicial: ${meeting.openingPrayer}` : 'Oração inicial: a registrar.',
    meeting.reflection ? `Reflexão: ${meeting.reflection}` : '',
    'Decisões por cargo:',
    ...process.candidates.filter(candidateReady).map((candidate) => `- ${process.offices.find((office) => office.id === candidate.officeId)?.title ?? 'Cargo'}: ${personName(candidate.personId)} — recomendado.`),
    'Encaminhamentos: quem procura cada indicado para obter o consentimento e até quando.',
    'Membros ouvidos nesta reunião: registrar apenas que foram ouvidos, sem detalhar o conteúdo.',
    'A comissão reafirma que suas consultas e discussões são confidenciais.',
    `Assinaturas:\n${personName(meeting.presidentId)} — Presidente\n${personName(meeting.secretaryId)} — Secretário(a)`,
  ].filter(Boolean).join('\n\n')
}

export function defaultFinalReport(churchName: string, process: NominationProcessData, report: NominationReportVersion): string {
  return [
    `${churchName} · Comissão de Nomeações`,
    `Relatório final · Período ${process.period} · Versão ${report.version}`,
    report.presentationDate ? `Primeira leitura: ${report.presentationDate}` : 'Primeira leitura: a definir',
    report.officialVoteDate ? `Votação pela igreja: ${report.officialVoteDate}` : 'Votação pela igreja: a definir, uma ou duas semanas após a primeira leitura',
    'Nomes indicados:',
    ...report.lines.map((line) => `- ${line.officeTitle}: ${line.personName}`),
    ...(report.openOffices.length ? ['Cargos ainda em aberto:', ...report.openOffices.map((office) => `- ${office}`)] : []),
    'Objeções: quem quiser apresentar observações deve procurar o presidente da comissão ou o pastor antes da segunda leitura. A comissão ouvirá cada pessoa e decidirá se muda a recomendação.',
    'A aprovação de cada nome se dá por maioria dos membros presentes que votarem.',
    report.publicNote,
  ].filter(Boolean).join('\n\n')
}
