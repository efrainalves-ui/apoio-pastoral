import { describe, expect, it } from 'vitest'
import type { NominationCandidate, NominationOffice, NominationProcessEntity } from '../nominations/types'
import type { PersonEntity } from '../people/types'
import { cargosPendentes, responsaveisPadraoDaCeia } from './ceia'

const pessoa = (id: string, name: string) => ({ id, name } as PersonEntity)
const cargo = (id: string, title: string): NominationOffice => ({
  id, area: 'Diaconato', title, vacancies: 1, multiplePeople: false, description: '', status: 'open',
  indicatedByOtherCommittee: false, officialStatus: 'pending',
})
const pronto = (officeId: string, personId: string): NominationCandidate => ({
  id: crypto.randomUUID(), officeId, personId, status: 'recommended', confidentialNote: '', conversationDate: '',
  consent: true, refusalReason: '', eligibility: 'confirmed', fidelityAlert: false,
  vote: { favorable: 5, against: 0, abstentions: 0, result: 'approved', required: 3, participantIds: [], votedAt: '' },
})
const processo = (overrides: Partial<NominationProcessEntity>): NominationProcessEntity => ({
  id: crypto.randomUUID(), churchId: 'igreja-a', period: '2026', status: 'completed',
  offices: [], candidates: [], meetings: [], reports: [], objections: [], officialVotes: [], vacancyProcesses: [],
  ...overrides,
} as unknown as NominationProcessEntity)

const PESSOAS = [pessoa('d1', 'Diácono Fictício'), pessoa('d2', 'Diaconisa Fictícia'), pessoa('d3', 'Outro Diácono Fictício')]

describe('responsáveis padrão da Ceia do Senhor', () => {
  it('traz o primeiro diácono e a primeira diaconisa indicados', () => {
    const atual = processo({
      offices: [cargo('o1', 'Primeiro diácono'), cargo('o2', 'Primeira diaconisa')],
      candidates: [pronto('o1', 'd1'), pronto('o2', 'd2')],
    })
    expect(responsaveisPadraoDaCeia('igreja-a', [atual], PESSOAS)).toEqual([
      { papel: 'primeiro_diacono', personId: 'd1', nome: 'Diácono Fictício' },
      { papel: 'primeira_diaconisa', personId: 'd2', nome: 'Diaconisa Fictícia' },
    ])
  })

  /* Só um cadastrado: preenche esse e deixa o outro pendente, sem chutar. */
  it('com só um dos dois, o outro fica pendente', () => {
    const atual = processo({ offices: [cargo('o1', 'Primeiro diácono'), cargo('o2', 'Primeira diaconisa')], candidates: [pronto('o1', 'd1')] })
    const responsaveis = responsaveisPadraoDaCeia('igreja-a', [atual], PESSOAS)
    expect(responsaveis[1]).toEqual({ papel: 'primeira_diaconisa', personId: null, nome: '' })
    expect(cargosPendentes(responsaveis)).toBe(1)
  })

  it('sem registro nenhum, os dois ficam pendentes para escrever', () => {
    const responsaveis = responsaveisPadraoDaCeia('igreja-a', [], PESSOAS)
    expect(responsaveis.map(({ personId, nome }) => ({ personId, nome }))).toEqual([{ personId: null, nome: '' }, { personId: null, nome: '' }])
    expect(cargosPendentes(responsaveis)).toBe(2)
  })

  it('indicação sem consentimento não conta como quem ocupa o cargo', () => {
    const semConsentimento = { ...pronto('o1', 'd1'), consent: false }
    const atual = processo({ offices: [cargo('o1', 'Primeiro diácono')], candidates: [semConsentimento] })
    expect(responsaveisPadraoDaCeia('igreja-a', [atual], PESSOAS)[0]?.personId).toBeNull()
  })

  it('usa o processo mais recente da igreja, e ignora outra igreja e arquivados', () => {
    const antigo = processo({ period: '2024', offices: [cargo('o1', 'Primeiro diácono')], candidates: [pronto('o1', 'd3')] })
    const atual = processo({ period: '2026', offices: [cargo('o1', 'Primeiro diácono')], candidates: [pronto('o1', 'd1')] })
    const arquivado = processo({ period: '2027', status: 'archived', offices: [cargo('o1', 'Primeiro diácono')], candidates: [pronto('o1', 'd2')] })
    const outraIgreja = processo({ churchId: 'igreja-b', period: '2028', offices: [cargo('o1', 'Primeiro diácono')], candidates: [pronto('o1', 'd2')] })
    expect(responsaveisPadraoDaCeia('igreja-a', [antigo, atual, arquivado, outraIgreja], PESSOAS)[0]?.personId).toBe('d1')
  })

  it('acha o cargo mesmo escrito sem acento ou em maiúsculas', () => {
    const atual = processo({ offices: [cargo('o1', 'PRIMEIRO DIACONO')], candidates: [pronto('o1', 'd1')] })
    expect(responsaveisPadraoDaCeia('igreja-a', [atual], PESSOAS)[0]?.personId).toBe('d1')
  })
})
