import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
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
  vi.restoreAllMocks()
  await Promise.all(bancos.splice(0).map((banco) => banco.delete()))
  localStorage.clear()
})

async function preparar() {
  const banco = new ApoioDatabase(`consolidacao-${crypto.randomUUID()}`); bancos.push(banco)
  return { banco, chave: await generateMasterKey(), servico: new EvangelismPlanningService(banco), agenda: new AgendaService(banco) }
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

/** Retrato do cofre: identificador e versão de cada registro, para provar que nada foi gravado. */
const retrato = async (banco: ApoioDatabase) => (await banco.vaultRecords.toArray()).map(({ id, version, deletedAt }) => `${id}:${version}:${deletedAt ?? ''}`).sort()

/** Campanha salva com metas, mais duas tentativas antigas que deixaram metas repetidas (uma em 31/12). */
async function comRepetidas(servico: EvangelismPlanningService, chave: CryptoKey, nome = 'Primavera Fictícia', inicio = '2026-09-11', fim = '2026-09-20') {
  const { campaign } = await servico.saveCampaign(CONTA, chave, campanha({ name: nome, startDate: inicio, endDate: fim }), undefined, undefined, { bible_studies: 30, baptisms: 5 })
  const repetidas = [
    await servico.saveGoal(CONTA, chave, metaDaTelaAntiga('bible_studies', { title: nome, startDate: inicio })),
    await servico.saveGoal(CONTA, chave, metaDaTelaAntiga('baptisms', { title: nome, startDate: inicio, dueDate: '2026-09-23' })),
  ]
  return { campaign, repetidas }
}

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

describe('campanha sem data, do Relatório Integrado', () => {
  it('é cadastrada e editada sem data; meta pedida sem período espera as datas, e a campanha salva normalmente', async () => {
    const { chave, servico, agenda } = await preparar()
    const [criada] = await servico.registrarCampanhasDoRelatorio(CONTA, chave, [{ relatorioId: 'relatorio-ficticio', churchId: IGREJA, igreja: 'Igreja Central', trimestre: '2026-1', declaradas: 1, cadastradasSemOrigem: 0, semanaSanta: false }])
    const { id, mainAgendaEventId, additionalAgendaEventIds, history, createdAt, updatedAt, ...entrada } = criada!
    void mainAgendaEventId; void additionalAgendaEventIds; void history; void createdAt; void updatedAt
    const { campaign } = await servico.saveCampaign(CONTA, chave, { ...entrada, name: 'Evangelismo Fictício sem Data', location: 'Templo Fictício' }, id, undefined, { bible_studies: 10, baptisms: 2 })
    expect(campaign).toMatchObject({ name: 'Evangelismo Fictício sem Data', startDate: '', endDate: '', origemRelatorio: { churchId: IGREJA, trimestre: '2026-1' } })
    expect(await servico.listGoals(CONTA, chave)).toEqual([])
    expect(await agenda.listEvents(CONTA, chave)).toEqual([])
  })
})

describe('revisar correções encontradas', () => {
  it('a análise não grava nada, mesmo repetida, e descreve cada correção', async () => {
    const { banco, chave, servico } = await preparar()
    const { campaign, repetidas } = await comRepetidas(servico, chave)
    const antes = await retrato(banco)

    const grupos = await servico.analisarCorrecoes(CONTA, chave)
    await servico.analisarCorrecoes(CONTA, chave)
    expect(await retrato(banco)).toEqual(antes)
    expect(servico.ultimaLimpeza(CONTA)).toBeNull()

    expect(grupos).toHaveLength(1)
    const [grupo] = grupos
    expect(grupo).toMatchObject({ chave: `metas:${campaign.id}`, tipo: 'metas_da_campanha', titulo: 'Primavera Fictícia', seguro: true })
    expect(grupo!.principal).toMatchObject({ id: campaign.id, inicio: '2026-09-11', fim: '2026-09-20', churchIds: [IGREJA], origem: 'Evangelismo' })
    expect(grupo!.registros.map(({ id, acao }) => [id, acao]).sort()).toEqual(repetidas.map(({ id }) => [id, 'Remover']).sort())
    expect(grupo!.removido).toHaveLength(2)
    expect(grupo!.removido.join(' ')).toContain('11 de set.–31 de dez.')
    expect(grupo!.motivo).toContain('sem campanha ligada')
  })

  it('manter separados preserva tudo, e o grupo não volta', async () => {
    const { chave, servico } = await preparar()
    const { campaign } = await comRepetidas(servico, chave)
    await servico.manterSeparados(CONTA, chave, `metas:${campaign.id}`)
    expect(await servico.listGoals(CONTA, chave)).toHaveLength(4)
    expect(await servico.analisarCorrecoes(CONTA, chave)).toEqual([])
    expect(servico.ultimaLimpeza(CONTA)).toBeNull()
  })

  it('aplicar uma correção mexe só naquele grupo, e desfazer devolve os registros como estavam', async () => {
    const { banco, chave, servico } = await preparar()
    const primavera = await comRepetidas(servico, chave)
    const colheita = await comRepetidas(servico, chave, 'Semana de Colheita Fictícia', '2026-09-13', '2026-09-19')
    const antes = await retrato(banco)

    const feito = await servico.aplicarCorrecoes(CONTA, chave, [`metas:${primavera.campaign.id}`])
    expect(feito).toMatchObject({ metasRemovidas: 2, copiasDeCampanha: 0 })
    const metas = await servico.listGoals(CONTA, chave)
    expect(metas.map(({ id }) => id)).not.toContain(primavera.repetidas[0]!.id)
    expect(metas.map(({ id }) => id)).toEqual(expect.arrayContaining(colheita.repetidas.map(({ id }) => id)))
    expect((await servico.analisarCorrecoes(CONTA, chave)).map(({ chave: grupo }) => grupo)).toEqual([`metas:${colheita.campaign.id}`])
    expect(servico.ultimaLimpeza(CONTA)).toMatchObject({ registros: 3 })
    // A cópia de segurança guarda só conteúdo cifrado.
    expect(JSON.stringify(localStorage)).not.toContain('Primavera Fictícia')

    expect(await servico.desfazerUltimaLimpeza(CONTA, chave)).toEqual({ restaurados: 3, ignorados: 0 })
    const restauradas = await servico.listGoals(CONTA, chave)
    expect(restauradas).toHaveLength(8)
    expect(restauradas.find(({ id }) => id === primavera.repetidas[0]!.id)?.dueDate).toBe('2026-12-31')
    expect((await retrato(banco)).map((linha) => linha.split(':')[0]).sort()).toEqual(antes.map((linha) => linha.split(':')[0]).sort())
    expect(await servico.analisarCorrecoes(CONTA, chave)).toHaveLength(2)
    expect(servico.ultimaLimpeza(CONTA)).toBeNull()
  })

  it('aplicar todas as correções seguras, desfazer em ordem, e nada alterado depois é sobrescrito', async () => {
    const { chave, servico } = await preparar()
    const primavera = await comRepetidas(servico, chave)
    await comRepetidas(servico, chave, 'Semana de Colheita Fictícia', '2026-09-13', '2026-09-19')
    const seguros = (await servico.analisarCorrecoes(CONTA, chave)).filter(({ seguro }) => seguro).map(({ chave: grupo }) => grupo)
    expect(seguros).toHaveLength(2)

    await servico.aplicarCorrecoes(CONTA, chave, seguros)
    expect(await servico.listGoals(CONTA, chave)).toHaveLength(4)
    expect(await servico.analisarCorrecoes(CONTA, chave)).toEqual([])

    // Depois da limpeza, o pastor mudou a campanha: essa mudança fica.
    const atual = (await servico.getCampaign(CONTA, chave, primavera.campaign.id))!
    const { id, mainAgendaEventId, additionalAgendaEventIds, history, createdAt, updatedAt, ...entrada } = atual
    void mainAgendaEventId; void additionalAgendaEventIds; void history; void createdAt; void updatedAt
    await servico.saveCampaign(CONTA, chave, { ...entrada, description: 'Anotação fictícia posterior' }, id)

    // Quatro metas e o histórico de uma campanha voltam; a campanha editada depois fica como o pastor deixou.
    const desfeito = await servico.desfazerUltimaLimpeza(CONTA, chave)
    expect(desfeito).toEqual({ restaurados: 5, ignorados: 1 })
    expect((await servico.getCampaign(CONTA, chave, primavera.campaign.id))?.description).toBe('Anotação fictícia posterior')
    expect(await servico.listGoals(CONTA, chave)).toHaveLength(8)
  })

  it('sem conseguir guardar a cópia de segurança, nada é alterado', async () => {
    const { banco, chave, servico } = await preparar()
    const { campaign } = await comRepetidas(servico, chave)
    const antes = await retrato(banco)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('armazenamento cheio') })
    await expect(servico.aplicarCorrecoes(CONTA, chave, [`metas:${campaign.id}`])).rejects.toThrow('cópia de segurança')
    expect(await retrato(banco)).toEqual(antes)
  })

  it('meta com anotação própria é preservada e ligada; meta de campanha homônima de datas diferentes não é apontada', async () => {
    const { chave, servico } = await preparar()
    const comAnotacao = await servico.saveGoal(CONTA, chave, metaDaTelaAntiga('bible_studies', { notes: 'Anotação fictícia do pastor' }))
    const { campaign } = await servico.saveCampaign(CONTA, chave, campanha(), undefined, undefined, { bible_studies: 30, baptisms: 5 })
    await servico.saveCampaign(CONTA, chave, campanha({ name: 'Semana Fictícia', startDate: '2026-03-01', endDate: '2026-03-07' }), undefined, undefined, { bible_studies: 1, baptisms: 1 })
    await servico.saveCampaign(CONTA, chave, campanha({ name: 'Semana Fictícia', startDate: '2026-10-01', endDate: '2026-10-07' }), undefined, undefined, { bible_studies: 1, baptisms: 1 })
    const homonima = await servico.saveGoal(CONTA, chave, metaDaTelaAntiga('baptisms', { title: 'Semana Fictícia' }))

    const grupos = await servico.analisarCorrecoes(CONTA, chave)
    expect(grupos.map(({ chave: grupo }) => grupo)).toEqual([`metas:${campaign.id}`])
    expect(grupos[0]!.registros.map(({ acao }) => acao)).toEqual(['Preservar e ligar à campanha'])
    expect(grupos[0]!.removido).toEqual([])

    await servico.aplicarCorrecoes(CONTA, chave, [`metas:${campaign.id}`])
    const metas = await servico.listGoals(CONTA, chave)
    expect(metas.find(({ id }) => id === comAnotacao.id)).toMatchObject({ notes: 'Anotação fictícia do pastor', campaignIds: [campaign.id] })
    expect(metas.find(({ id }) => id === homonima.id)?.campaignIds).toEqual([])
    expect(await servico.listCampaigns(CONTA, chave)).toHaveLength(3)
  })

  it('campanha gravada duas vezes: a revisão mostra o que cada uma tem, e aplicar une numa só, sem compromisso repetido', async () => {
    const { chave, servico, agenda } = await preparar()
    await servico.saveCampaign(CONTA, chave, campanha({ name: 'Colheita Fictícia', startDate: '2026-09-13', endDate: '2026-09-19', notes: 'Observação fictícia só da primeira' }), undefined, undefined, { bible_studies: 10, baptisms: 2 })
    await servico.saveCampaign(CONTA, chave, campanha({ name: 'Colheita Fictícia', startDate: '2026-09-13', endDate: '2026-09-19', description: 'Descrição fictícia só da cópia', followUps: [{ id: 'acompanhamento-ficticio', type: 'interest', recordId: 'interessado-ficticio', churchId: IGREJA, displayName: 'Interessado Fictício', status: 'first_contact', notes: '' }] }), undefined, undefined, { bible_studies: 10, baptisms: 2 })
    expect(await agenda.listEvents(CONTA, chave)).toHaveLength(2)

    const grupo = (await servico.analisarCorrecoes(CONTA, chave)).find(({ tipo }) => tipo === 'campanha_repetida')!
    expect(grupo.seguro).toBe(false)
    expect(grupo.registros.map(({ acao }) => acao)).toEqual(['Unir à principal'])
    expect(grupo.removido.some((item) => item.startsWith('Compromisso repetido na Agenda'))).toBe(true)
    expect(await servico.listCampaigns(CONTA, chave)).toHaveLength(2)

    await servico.aplicarCorrecoes(CONTA, chave, [grupo.chave])
    const campanhas = await servico.listCampaigns(CONTA, chave)
    expect(campanhas).toHaveLength(1)
    expect(campanhas[0]!.followUps).toHaveLength(1)
    expect(campanhas[0]!.description).toBe('Descrição fictícia só da cópia')
    expect(campanhas[0]!.notes).toBe('Observação fictícia só da primeira')
    expect(await agenda.listEvents(CONTA, chave)).toHaveLength(1)

    await servico.desfazerUltimaLimpeza(CONTA, chave)
    expect(await servico.listCampaigns(CONTA, chave)).toHaveLength(2)
    expect(await agenda.listEvents(CONTA, chave)).toHaveLength(2)
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
    expect((await agenda.listEvents(CONTA, chave)).map(({ id }) => id)).toEqual([eventId])
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
