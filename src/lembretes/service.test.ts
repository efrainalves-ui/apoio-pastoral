import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { CareService } from '../care/service'
import { generateMasterKey } from '../crypto/vault'
import { ApoioDatabase } from '../db/database'
import { FamilyBudgetDatabase } from '../family-budget/database'
import { opcoesDeAdiamento } from './adiamento'
import { itensDoBloco } from './central'
import { LembreteService, lembreteVazio } from './service'

const FUSO = 'America/Belem'
const bancos: Array<ApoioDatabase | FamilyBudgetDatabase> = []
afterEach(async () => { await Promise.all(bancos.splice(0).map((banco) => banco.delete())) })

async function cenario() {
  const database = new ApoioDatabase(`lembretes-${crypto.randomUUID()}`)
  const orcamento = new FamilyBudgetDatabase(`lembretes-orcamento-${crypto.randomUUID()}`)
  bancos.push(database, orcamento)
  await database.syncState.put({ accountId: 'conta-ficticia', cursor: null, lastSyncedAt: '2026-09-14T12:00:00Z', firstSyncAt: '2026-09-14T12:00:00Z' })
  return { database, key: await generateMasterKey(), accountId: 'conta-ficticia', servico: new LembreteService(database, orcamento, true), care: new CareService(database) }
}

describe('listas', () => {
  it('as listas iniciais nascem uma vez só, mesmo abrindo de novo — e esperam a primeira sincronização', async () => {
    const c = await cenario()
    await c.database.syncState.update(c.accountId, { firstSyncAt: null })
    expect(await c.servico.prepararListasIniciais(c.accountId, c.key)).toBe(0)
    await c.database.syncState.update(c.accountId, { firstSyncAt: '2026-09-14T12:00:00Z' })
    expect(await c.servico.prepararListasIniciais(c.accountId, c.key)).toBe(3)
    expect(await c.servico.prepararListasIniciais(c.accountId, c.key)).toBe(0)
    expect((await c.servico.listas(c.accountId, c.key)).map(({ nome }) => nome)).toEqual(['Pessoal', 'Rotinas', 'Compras'])
  })

  it('outro aparelho da mesma conta chega aos mesmos identificadores, e lista excluída não volta', async () => {
    const a = await cenario()
    await a.servico.prepararListasIniciais(a.accountId, a.key)
    const idsA = (await a.servico.listas(a.accountId, a.key)).map(({ id }) => id)
    const b = await cenario()
    await b.servico.prepararListasIniciais(a.accountId, b.key)
    expect((await b.servico.listas(a.accountId, b.key)).map(({ id }) => id)).toEqual(idsA)

    await a.servico.excluirLista(a.accountId, a.key, idsA[2]!)
    expect(await a.servico.prepararListasIniciais(a.accountId, a.key)).toBe(0)
    expect((await a.servico.listas(a.accountId, a.key)).map(({ nome }) => nome)).toEqual(['Pessoal', 'Rotinas'])
  })

  it('criar, editar, reordenar e arquivar', async () => {
    const c = await cenario()
    const igreja = await c.servico.salvarLista(c.accountId, c.key, { nome: 'Igreja', descricao: '', icone: 'igreja', cor: 'verde' })
    const casa = await c.servico.salvarLista(c.accountId, c.key, { nome: 'Casa', descricao: '', icone: 'casa', cor: 'azul' })
    await c.servico.salvarLista(c.accountId, c.key, { nome: 'Igreja de Curuçá', descricao: 'Pendências', icone: 'igreja', cor: 'roxo' }, igreja.id)
    await c.servico.reordenarListas(c.accountId, c.key, [casa.id, igreja.id])
    await c.servico.arquivarLista(c.accountId, c.key, casa.id, true)
    expect((await c.servico.listas(c.accountId, c.key)).map(({ nome, ordem, arquivada, cor }) => [nome, ordem, arquivada, cor])).toEqual([['Casa', 1, true, 'azul'], ['Igreja de Curuçá', 2, false, 'roxo']])
  })

  it('excluir lista com tarefas exige escolher: mover ou excluir — nada some em silêncio', async () => {
    const c = await cenario()
    const origem = await c.servico.salvarLista(c.accountId, c.key, { nome: 'Origem', descricao: '', icone: 'lista', cor: 'grafite' })
    const destino = await c.servico.salvarLista(c.accountId, c.key, { nome: 'Destino', descricao: '', icone: 'lista', cor: 'azul' })
    await c.servico.salvarLembrete(c.accountId, c.key, { ...lembreteVazio(origem.id, FUSO), titulo: 'Comprar hinários' })
    await expect(c.servico.excluirLista(c.accountId, c.key, origem.id)).rejects.toThrow('escolha')
    expect(await c.servico.lembretes(c.accountId, c.key)).toHaveLength(1)
    await c.servico.excluirLista(c.accountId, c.key, origem.id, { moverPara: destino.id })
    expect((await c.servico.lembretes(c.accountId, c.key))[0]?.listaId).toBe(destino.id)
    await c.servico.excluirLista(c.accountId, c.key, destino.id, 'excluir_tarefas')
    expect(await c.servico.lembretes(c.accountId, c.key)).toHaveLength(0)
  })
})

describe('lembretes manuais', () => {
  it('criar, editar, concluir, adiar e excluir', async () => {
    const c = await cenario()
    await expect(c.servico.salvarLembrete(c.accountId, c.key, lembreteVazio(null, FUSO))).rejects.toThrow('lembrar')
    const criado = await c.servico.salvarLembrete(c.accountId, c.key, { ...lembreteVazio(null, FUSO), titulo: 'Ligar para o ancião', data: '2026-09-14', hora: '15:00' })
    await c.servico.salvarLembrete(c.accountId, c.key, { ...lembreteVazio(null, FUSO), titulo: 'Ligar para o ancião Fictício', data: '2026-09-14', hora: '15:00', prioridade: 'urgente' }, criado.id)
    await c.servico.adiar(c.accountId, c.key, criado.id, null, { data: '2026-09-15', hora: '09:00' })
    expect((await c.servico.lembretes(c.accountId, c.key))[0]).toMatchObject({ titulo: 'Ligar para o ancião Fictício', prioridade: 'urgente', data: '2026-09-15', hora: '09:00' })
    await c.servico.concluir(c.accountId, c.key, criado.id, null)
    expect((await c.servico.lembretes(c.accountId, c.key))[0]).toMatchObject({ estado: 'concluido' })
    await c.servico.excluirLembrete(c.accountId, c.key, criado.id)
    expect(await c.servico.lembretes(c.accountId, c.key)).toHaveLength(0)
  })

  it('série: concluir uma ocorrência não conclui a série; editar só esta não mexe nas outras; esta e as próximas começa série nova', async () => {
    const c = await cenario()
    const relatorio = await c.servico.salvarLembrete(c.accountId, c.key, { ...lembreteVazio(null, FUSO), titulo: 'Fazer o relatório mensal', data: '2026-09-05', hora: '08:00', repeticao: { frequencia: 'mensal', intervalo: 1, diaDoMes: 5 } })
    await c.servico.concluir(c.accountId, c.key, relatorio.id, '2026-09-05')
    await c.servico.concluir(c.accountId, c.key, relatorio.id, '2026-09-05')
    let { itens } = await c.servico.carregar(c.accountId, c.key, new Date('2026-09-14T13:00:00Z'), FUSO)
    expect(itens.filter(({ lembreteId }) => lembreteId === relatorio.id).map(({ chave, concluido }) => [chave, concluido])).toEqual([[`lembrete:${relatorio.id}:2026-09-05`, true], [`lembrete:${relatorio.id}:2026-10-05`, false]])

    const entrada = { ...lembreteVazio(null, FUSO), titulo: 'Relatório de outubro com a igreja', data: '2026-10-06', hora: '08:00', repeticao: { frequencia: 'mensal' as const, intervalo: 1, diaDoMes: 5 } }
    await c.servico.editar(c.accountId, c.key, relatorio.id, '2026-10-05', 'esta', entrada)
    ;({ itens } = await c.servico.carregar(c.accountId, c.key, new Date('2026-09-14T13:00:00Z'), FUSO))
    expect(itens.find((item) => item.chave === `lembrete:${relatorio.id}:2026-10-05`)).toMatchObject({ titulo: 'Relatório de outubro com a igreja', data: '2026-10-06' })
    await c.servico.concluir(c.accountId, c.key, relatorio.id, '2026-10-05')
    ;({ itens } = await c.servico.carregar(c.accountId, c.key, new Date('2026-09-14T13:00:00Z'), FUSO))
    expect(itens.find((item) => item.chave === `lembrete:${relatorio.id}:2026-11-05`)).toMatchObject({ titulo: 'Fazer o relatório mensal', data: '2026-11-05' })

    await c.servico.editar(c.accountId, c.key, relatorio.id, '2026-11-05', 'proximas', { ...entrada, titulo: 'Relatório novo formato', data: '2026-11-05', hora: '09:00' })
    const series = await c.servico.lembretes(c.accountId, c.key)
    expect(series).toHaveLength(2)
    expect(series.find(({ id }) => id === relatorio.id)?.repeticao?.ate).toBe('2026-11-04')
    expect(series.find(({ id }) => id !== relatorio.id)).toMatchObject({ titulo: 'Relatório novo formato', data: '2026-11-05', hora: '09:00' })
  })

  it('tarefa sem data: em Todos e na lista, fora de Hoje e Próximos', async () => {
    const c = await cenario()
    await c.servico.salvarLembrete(c.accountId, c.key, { ...lembreteVazio('lista-x', FUSO), titulo: 'Comprar pão da ceia' })
    const { itens } = await c.servico.carregar(c.accountId, c.key, new Date('2026-09-14T13:00:00Z'), FUSO)
    const agora = new Date('2026-09-14T13:00:00Z')
    expect(itensDoBloco(itens, 'todos', agora, FUSO)).toHaveLength(1)
    expect(itensDoBloco(itens, 'hoje', agora, FUSO)).toHaveLength(0)
    expect(itensDoBloco(itens, 'proximos', agora, FUSO)).toHaveLength(0)
    expect(itens[0]?.listaId).toBe('lista-x')
  })
})

describe('tarefas integradas', () => {
  it('aparece uma vez, sem cópia; concluir pela Central conclui na origem; sumir na origem some da Central', async () => {
    const c = await cenario()
    const tarefa = await c.care.createTask(c.accountId, c.key, { title: 'Levar a lição', description: '', dueAt: '2026-09-14', remindAt: null, priority: 'normal', churchId: null, relatedType: null, relatedId: null, reminderMinutes: null })
    const agora = new Date('2026-09-14T13:00:00Z')
    let { itens } = await c.servico.carregar(c.accountId, c.key, agora, FUSO)
    expect(itens.filter(({ origem }) => origem === `task:${tarefa.id}`)).toHaveLength(1)
    expect(await c.servico.lembretes(c.accountId, c.key)).toHaveLength(0)

    await c.servico.marcarTarefa(c.accountId, c.key, `task:${tarefa.id}`, { sinalizado: true })
    await c.servico.marcarTarefa(c.accountId, c.key, `task:${tarefa.id}`, { prioridade: 'urgente' })
    ;({ itens } = await c.servico.carregar(c.accountId, c.key, agora, FUSO))
    expect(itens.find(({ origem }) => origem === `task:${tarefa.id}`)).toMatchObject({ sinalizado: true, prioridade: 'urgente', titulo: 'Levar a lição' })
    expect((await c.servico.metadados(c.accountId, c.key)).size).toBe(1)

    const item = itens.find(({ origem }) => origem === `task:${tarefa.id}`)!
    expect(await c.servico.concluirNaOrigem(c.accountId, c.key, item)).toBe('concluido')
    expect((await c.care.listTasks(c.accountId, c.key))[0]?.status).toBe('completed')

    const pedidoSemConclusao = { origem: 'prayer_request:qualquer', podeConcluir: false }
    expect(await c.servico.concluirNaOrigem(c.accountId, c.key, pedidoSemConclusao)).toBe('abrir')
  })

  it('opções de adiar: mais tarde hoje, amanhã e próxima semana', () => {
    expect(opcoesDeAdiamento(new Date('2026-09-14T13:00:00Z'), FUSO)).toEqual([
      { id: 'mais_tarde', rotulo: 'Mais tarde hoje, às 13:00', data: '2026-09-14', hora: '13:00' },
      { id: 'amanha', rotulo: 'Amanhã, às 09:00', data: '2026-09-15', hora: '09:00' },
      { id: 'proxima_semana', rotulo: 'Próxima semana, segunda às 09:00', data: '2026-09-21', hora: '09:00' },
    ])
    expect(opcoesDeAdiamento(new Date('2026-09-15T01:30:00Z'), FUSO).map(({ id }) => id)).toEqual(['amanha', 'proxima_semana'])
  })
})
