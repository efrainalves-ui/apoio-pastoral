import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { AgendaService } from '../agenda/service'
import { generateMasterKey } from '../crypto/vault'
import { ApoioDatabase } from '../db/database'
import { trackGoal } from './goalTracking'
import { defaultCampaignChecklist, EvangelismPlanningService } from './service'
import type { AnnualGoalInput, EvangelismCampaignInput } from './types'

const CONTA = 'conta-ficticia-consolidacao'
const IGREJA = 'igreja-ficticia-central'
const bancos: ApoioDatabase[] = []

afterEach(async () => {
  await Promise.all(bancos.splice(0).map((banco) => banco.delete()))
  localStorage.clear()
})

async function preparar() {
  const banco = new ApoioDatabase(`consolidacao-${crypto.randomUUID()}`); bancos.push(banco)
  return { chave: await generateMasterKey(), servico: new EvangelismPlanningService(banco), agenda: new AgendaService(banco) }
}

const campanha = (partes: Partial<EvangelismCampaignInput> = {}): EvangelismCampaignInput => ({
  name: 'Primavera Fictícia', objective: 'spring_evangelism', churchIds: [IGREJA], startDate: '2026-09-11', endDate: '2026-09-20', location: 'Templo Fictício', address: '',
  responsibleGeneral: 'Responsável Fictício', mainSpeaker: '', team: [], status: 'planning', description: '', notes: '', goalId: null, planningAreas: ['discipleship'],
  additionalSchedule: 'none', points: [], tasks: [], checklist: defaultCampaignChecklist(), plannedBudget: 0, budgetItems: [], followUps: [], learnings: '', ...partes,
})

/** Exatamente o que a tela antiga gravava antes de conferir a campanha. */
const metaDaTelaAntiga = (area: 'bible_studies' | 'baptisms', partes: Partial<AnnualGoalInput> = {}): AnnualGoalInput => ({
  title: 'Primavera Fictícia', description: '', area: 'discipleship', year: 2026, churchIds: [IGREJA], responsible: '', dueDate: '2026-12-31', startDate: '2026-09-11',
  priority: 'normal', status: 'planned', notes: '', references: [], linkedArea: area, target: area === 'bible_studies' ? 30 : 5, ...partes,
})

describe('a campanha e as metas dela gravam juntas', () => {
  it('campanha recusada não deixa meta nenhuma para trás', async () => {
    const { chave, servico } = await preparar()
    await expect(servico.saveCampaign(CONTA, chave, campanha({ churchIds: [] }), undefined, undefined, { bible_studies: 30, baptisms: 5 })).rejects.toThrow('igreja')
    await expect(servico.saveCampaign(CONTA, chave, campanha({ endDate: '2026-09-01' }), undefined, undefined, { bible_studies: 30, baptisms: 5 })).rejects.toThrow('período')
    expect(await servico.listGoals(CONTA, chave)).toEqual([])
  })

  it('as metas nascem com o período da campanha e acompanham a mudança de datas e de nome', async () => {
    const { chave, servico } = await preparar()
    const { campaign } = await servico.saveCampaign(CONTA, chave, campanha(), undefined, undefined, { bible_studies: 30, baptisms: 5 })
    let metas = await servico.listGoals(CONTA, chave)
    expect(metas).toHaveLength(2)
    expect(metas.map(({ startDate, dueDate, campaignIds }) => [startDate, dueDate, campaignIds])).toEqual([['2026-09-11', '2026-09-20', [campaign.id]], ['2026-09-11', '2026-09-20', [campaign.id]]])

    await servico.saveCampaign(CONTA, chave, { ...campanha({ name: 'Primavera Renovada', startDate: '2026-09-12', endDate: '2026-09-21' }), studyGoalId: campaign.studyGoalId ?? null, baptismGoalId: campaign.baptismGoalId ?? null }, campaign.id)
    metas = await servico.listGoals(CONTA, chave)
    expect(metas).toHaveLength(2)
    expect(metas.every(({ title, startDate, dueDate }) => title === 'Primavera Renovada' && startDate === '2026-09-12' && dueDate === '2026-09-21')).toBe(true)
  })

  it('a meta da campanha só conta o que aconteceu no período e nas igrejas dela', async () => {
    const { chave, servico } = await preparar()
    await servico.saveCampaign(CONTA, chave, campanha(), undefined, undefined, { bible_studies: 3, baptisms: 1 })
    const estudos = (await servico.listGoals(CONTA, chave)).find(({ linkedArea }) => linkedArea === 'bible_studies')!
    const lancamento = (date: string, churchId = IGREJA) => ({ id: crypto.randomUUID(), churchId, metric: 'bible_studies' as const, date, amount: 2, source: 'pdf' as const, reference: 'fictício', createdAt: '' })
    const fontes = { entries: [lancamento('2026-03-31'), lancamento('2026-09-12', 'outra-igreja-ficticia'), lancamento('2026-09-14')], studies: [], uapgs: [] }
    const acompanhamento = trackGoal(estudos, fontes, new Date('2026-09-15T15:00:00Z'))
    expect(acompanhamento.result).toBe(2)
    expect(acompanhamento.status).toBe('in_progress')
  })
})

describe('consolidação das cópias já gravadas', () => {
  it('remove as metas repetidas da tela antiga, liga a que faltava, corrige as datas e não repete nada na segunda vez', async () => {
    const { chave, servico } = await preparar()
    // Três tentativas recusadas: duas sem término (31/12) e uma com término errado (23/09).
    const orfas = [
      await servico.saveGoal(CONTA, chave, metaDaTelaAntiga('bible_studies')),
      await servico.saveGoal(CONTA, chave, metaDaTelaAntiga('baptisms')),
      await servico.saveGoal(CONTA, chave, metaDaTelaAntiga('bible_studies')),
      await servico.saveGoal(CONTA, chave, metaDaTelaAntiga('baptisms', { dueDate: '2026-09-23', target: 0 })),
    ]
    const estudosCerta = await servico.saveGoal(CONTA, chave, metaDaTelaAntiga('bible_studies', { dueDate: '2026-09-23' }))
    // A campanha que finalmente salvou ficou com a meta de estudos, sem a de batismos.
    const { campaign } = await servico.saveCampaign(CONTA, chave, { ...campanha(), studyGoalId: estudosCerta.id, baptismGoalId: orfas[1]!.id }, undefined)
    await servico.saveCampaign(CONTA, chave, { ...campanha(), studyGoalId: estudosCerta.id, baptismGoalId: null }, campaign.id)
    expect(await servico.listGoals(CONTA, chave)).toHaveLength(5)

    const primeira = await servico.consolidarCampanhasEMetas(CONTA, chave)
    expect(primeira).toMatchObject({ campanhasExaminadas: 1, metasExaminadas: 5, copiasDeCampanha: 0, metasRepetidas: 4, metasLigadas: 1, metasRemovidas: 3, metasPreservadas: 0, campanhas: ['Primavera Fictícia'] })

    const metas = await servico.listGoals(CONTA, chave)
    const atual = (await servico.getCampaign(CONTA, chave, campaign.id))!
    expect(metas).toHaveLength(2)
    expect(metas.map(({ id }) => id).sort()).toEqual([atual.studyGoalId, atual.baptismGoalId].sort())
    expect(metas.every(({ startDate, dueDate, campaignIds }) => startDate === '2026-09-11' && dueDate === '2026-09-20' && campaignIds.includes(campaign.id))).toBe(true)
    expect(metas.some(({ dueDate }) => dueDate.endsWith('-12-31'))).toBe(false)
    expect(atual.history.some(({ message }) => message.startsWith('Consolidação:'))).toBe(true)

    const segunda = await servico.consolidarCampanhasEMetas(CONTA, chave)
    expect(segunda).toMatchObject({ copiasDeCampanha: 0, metasRepetidas: 0, metasRemovidas: 0, datasCorrigidas: 0 })
    expect(await servico.listGoals(CONTA, chave)).toHaveLength(2)
    expect(await servico.listCampaigns(CONTA, chave)).toHaveLength(1)
  })

  it('nome igual não basta: meta com anotação própria fica, e meta de campanha homônima de datas diferentes não é tocada', async () => {
    const { chave, servico } = await preparar()
    const comAnotacao = await servico.saveGoal(CONTA, chave, metaDaTelaAntiga('bible_studies', { notes: 'Anotação fictícia do pastor' }))
    await servico.saveCampaign(CONTA, chave, campanha(), undefined, undefined, { bible_studies: 30, baptisms: 5 })
    const semanaA = await servico.saveCampaign(CONTA, chave, campanha({ name: 'Semana Fictícia', startDate: '2026-03-01', endDate: '2026-03-07' }), undefined, undefined, { bible_studies: 1, baptisms: 1 })
    await servico.saveCampaign(CONTA, chave, campanha({ name: 'Semana Fictícia', startDate: '2026-10-01', endDate: '2026-10-07' }), undefined, undefined, { bible_studies: 1, baptisms: 1 })
    const homonima = await servico.saveGoal(CONTA, chave, metaDaTelaAntiga('baptisms', { title: 'Semana Fictícia' }))

    const resultado = await servico.consolidarCampanhasEMetas(CONTA, chave)
    expect(resultado).toMatchObject({ copiasDeCampanha: 0, metasRemovidas: 0, metasPreservadas: 1 })
    const metas = await servico.listGoals(CONTA, chave)
    expect(metas.find(({ id }) => id === comAnotacao.id)?.notes).toBe('Anotação fictícia do pastor')
    expect(metas.find(({ id }) => id === homonima.id)?.campaignIds).toEqual([])
    expect(await servico.listCampaigns(CONTA, chave)).toHaveLength(3)
    expect(semanaA.campaign.id).toBeTruthy()
  })

  it('campanha gravada duas vezes vira uma só, com o que só a cópia tinha e sem compromisso repetido na Agenda', async () => {
    const { chave, servico, agenda } = await preparar()
    const principal = await servico.saveCampaign(CONTA, chave, campanha({ name: 'Colheita Fictícia', startDate: '2026-09-13', endDate: '2026-09-19' }), undefined, undefined, { bible_studies: 10, baptisms: 2 })
    const copia = await servico.saveCampaign(CONTA, chave, campanha({ name: 'Colheita Fictícia', startDate: '2026-09-13', endDate: '2026-09-19', description: 'Descrição fictícia só da cópia', followUps: [{ id: 'acompanhamento-ficticio', type: 'interest', recordId: 'interessado-ficticio', churchId: IGREJA, displayName: 'Interessado Fictício', status: 'first_contact', notes: '' }] }), undefined, undefined, { bible_studies: 10, baptisms: 2 })
    expect(await agenda.listEvents(CONTA, chave)).toHaveLength(2)

    const resultado = await servico.consolidarCampanhasEMetas(CONTA, chave)
    expect(resultado.copiasDeCampanha).toBe(1)
    const campanhas = await servico.listCampaigns(CONTA, chave)
    expect(campanhas).toHaveLength(1)
    const [unida] = campanhas
    expect([principal.campaign.id, copia.campaign.id]).toContain(unida!.id)
    expect(unida!.followUps).toHaveLength(1)
    expect(unida!.description).toBe('Descrição fictícia só da cópia')
    expect(await agenda.listEvents(CONTA, chave)).toHaveLength(1)
    expect((await servico.listGoals(CONTA, chave)).every(({ campaignIds }) => campaignIds.includes(unida!.id))).toBe(true)

    expect(await servico.consolidarCampanhasEMetas(CONTA, chave)).toMatchObject({ copiasDeCampanha: 0, metasRepetidas: 0, datasCorrigidas: 0 })
  })
})

describe('excluir a campanha', () => {
  it('leva junto as projeções e as metas criadas por ela, preserva meta com vida própria e só apaga compromisso independente com confirmação', async () => {
    const { chave, servico, agenda } = await preparar()
    const { campaign } = await servico.saveCampaign(CONTA, chave, campanha(), undefined, undefined, { bible_studies: 30, baptisms: 5 })
    const independente = await servico.saveGoal(CONTA, chave, { ...metaDaTelaAntiga('bible_studies'), title: 'Meta Própria Fictícia', linkedArea: null, dueDate: '2026-12-31' })
    const { eventId } = await servico.createGoalAgendaEvent(CONTA, chave, campaign.studyGoalId!, { title: 'Culto Fictício da Primavera', date: '2026-09-14', startTime: '19:00', endTime: '20:00', churchId: IGREJA, location: '' })
    await servico.saveCampaign(CONTA, chave, { ...campanha(), studyGoalId: campaign.studyGoalId ?? null, baptismGoalId: campaign.baptismGoalId ?? null, goalId: independente.id }, campaign.id)

    const plano = await servico.planejarExclusaoDaCampanha(CONTA, chave, campaign.id)
    expect(plano.compromissosIndependentes.map(({ title }) => title)).toEqual(['Culto Fictício da Primavera'])
    expect(plano).toMatchObject({ metasRemovidas: 1, metasPreservadas: 2 })

    await servico.deleteCampaign(CONTA, chave, campaign.id)
    expect(await servico.listCampaigns(CONTA, chave)).toEqual([])
    const eventos = await agenda.listEvents(CONTA, chave)
    expect(eventos.map(({ id }) => id)).toEqual([eventId])
    const metas = await servico.listGoals(CONTA, chave)
    expect(metas.map(({ title }) => title).sort()).toEqual(['Meta Própria Fictícia', 'Primavera Fictícia'])
    expect(metas.every(({ campaignIds }) => !campaignIds.includes(campaign.id))).toBe(true)
  })

  it('com a confirmação, o compromisso independente também sai', async () => {
    const { chave, servico, agenda } = await preparar()
    const { campaign } = await servico.saveCampaign(CONTA, chave, campanha(), undefined, undefined, { bible_studies: 30, baptisms: 5 })
    const { eventId } = await servico.createGoalAgendaEvent(CONTA, chave, campaign.baptismGoalId!, { title: 'Batismo Fictício', date: '2026-09-19', startTime: '10:00', endTime: '11:00', churchId: IGREJA, location: '' })
    await servico.deleteCampaign(CONTA, chave, campaign.id, [eventId])
    expect(await agenda.listEvents(CONTA, chave)).toEqual([])
  })
})
