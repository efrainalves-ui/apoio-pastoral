import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { AgendaService } from '../agenda/service'
import { generateMasterKey } from '../crypto/vault'
import { ApoioDatabase } from '../db/database'
import { EvangelismPlanningService, type PedidoDeCampanhaDoRelatorio } from './service'
import type { EvangelismCampaignEntity, EvangelismCampaignInput } from './types'

const CONTA = 'conta-ficticia-campanhas-do-relatorio'
const bancos: ApoioDatabase[] = []

afterEach(async () => {
  await Promise.all(bancos.splice(0).map((banco) => banco.delete()))
  localStorage.clear()
})

async function preparar() {
  const banco = new ApoioDatabase(`campanhas-relatorio-${crypto.randomUUID()}`); bancos.push(banco)
  return { chave: await generateMasterKey(), servico: new EvangelismPlanningService(banco), agenda: new AgendaService(banco) }
}

const pedido = (extra: Partial<PedidoDeCampanhaDoRelatorio> = {}): PedidoDeCampanhaDoRelatorio => ({
  relatorioId: 'relatorio-ficticio', churchId: 'monte-siao', igreja: 'Monte Sião', trimestre: '2026-1',
  declaradas: 1, cadastradasSemOrigem: 0, semanaSanta: false, ...extra,
})

function comoEntrada(campanha: EvangelismCampaignEntity): EvangelismCampaignInput {
  const { id, mainAgendaEventId, additionalAgendaEventIds, history, createdAt, updatedAt, ...resto } = campanha
  void id; void mainAgendaEventId; void additionalAgendaEventIds; void history; void createdAt; void updatedAt
  return resto
}

describe('campanha informada no Relatório Integrado', () => {
  it('é cadastrada sem data, como realizada, com a igreja, o trimestre e a origem, e sem compromisso na Agenda', async () => {
    const { chave, servico, agenda } = await preparar()
    const [criada] = await servico.registrarCampanhasDoRelatorio(CONTA, chave, [pedido()])

    expect(criada).toMatchObject({
      name: 'Campanha — Monte Sião', churchIds: ['monte-siao'], startDate: '', endDate: '', status: 'completed', aCompletar: true,
      mainAgendaEventId: null, origemRelatorio: { churchId: 'monte-siao', trimestre: '2026-1', indice: 1 },
    })
    expect(criada!.history[0]?.message).toBe('Informada pela igreja no Relatório Integrado do 1º trimestre de 2026.')
    expect(await agenda.listEvents(CONTA, chave)).toEqual([])
  })

  it('várias da mesma igreja recebem números, e a Semana Santa fica com o próprio nome', async () => {
    const { chave, servico } = await preparar()
    const criadas = await servico.registrarCampanhasDoRelatorio(CONTA, chave, [pedido({ declaradas: 3, semanaSanta: true })])
    expect(criadas.map(({ name, objective }) => [name, objective])).toEqual([
      ['Semana Santa', 'holy_week'], ['Campanha 2 — Monte Sião', 'other'], ['Campanha 3 — Monte Sião', 'other'],
    ])
  })

  it('tocar duas vezes ou importar o mesmo relatório de novo não duplica', async () => {
    const { chave, servico } = await preparar()
    await servico.registrarCampanhasDoRelatorio(CONTA, chave, [pedido({ declaradas: 2 })])
    expect(await servico.registrarCampanhasDoRelatorio(CONTA, chave, [pedido({ declaradas: 2 })])).toEqual([])
    expect(await servico.listCampaigns(CONTA, chave)).toHaveLength(2)
  })

  it('a campanha já cadastrada com data conta, e só a que falta é criada', async () => {
    const { chave, servico } = await preparar()
    const criadas = await servico.registrarCampanhasDoRelatorio(CONTA, chave, [pedido({ declaradas: 2, cadastradasSemOrigem: 1 })])
    expect(criadas.map(({ name }) => name)).toEqual(['Campanha 1 — Monte Sião'])
  })

  it('pode ser editada depois sem data, e ao receber a data ganha o compromisso na Agenda', async () => {
    const { chave, servico, agenda } = await preparar()
    const [criada] = await servico.registrarCampanhasDoRelatorio(CONTA, chave, [pedido()])

    const semData = await servico.saveCampaign(CONTA, chave, { ...comoEntrada(criada!), name: 'Evangelismo Fictício de Março', location: 'Templo Fictício' }, criada!.id)
    expect(semData.campaign).toMatchObject({ name: 'Evangelismo Fictício de Março', startDate: '', aCompletar: true, mainAgendaEventId: null })
    expect(await agenda.listEvents(CONTA, chave)).toEqual([])

    const comData = await servico.saveCampaign(CONTA, chave, { ...comoEntrada(semData.campaign), startDate: '2026-03-10', endDate: '2026-03-14' }, criada!.id)
    expect(comData.campaign.aCompletar).toBeUndefined()
    expect(await agenda.listEvents(CONTA, chave)).toHaveLength(1)
  })

  it('a criada sem nome pelo botão antigo recebe o nome e fica como realizada, com o mesmo identificador', async () => {
    const { chave, servico } = await preparar()
    const [criada] = await servico.registrarCampanhasDoRelatorio(CONTA, chave, [pedido()])
    await servico.saveCampaign(CONTA, chave, { ...comoEntrada(criada!), name: 'Rascunho' }, criada!.id)
    // Nome já escrito não é trocado.
    expect(await servico.nomearCampanhasDoRelatorio(CONTA, chave, [{ id: criada!.id, name: 'Campanha — Monte Sião', objective: 'other' }])).toBe(0)
    expect((await servico.getCampaign(CONTA, chave, criada!.id))?.name).toBe('Rascunho')
  })
})
