import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AgendaService } from '../agenda/service'
import { generateMasterKey } from '../crypto/vault'
import { ApoioDatabase } from '../db/database'
import type { ChurchEntity } from '../district/types'
import { alvosDaEscolha } from './jaPregado'
import { JaPregadoService } from './jaPregadoService'

vi.mock('../auth/supabase', async (importarOriginal) => ({
  ...await importarOriginal<Record<string, unknown>>(),
  hasSupabaseConfiguration: false,
  ensureRemoteDevice: vi.fn(() => Promise.resolve()),
}))

const CONTA = 'conta-ficticia-ja-pregado'
const SERMAO = 'sermao-ficticio'
const bancos: ApoioDatabase[] = []

const igrejas = [
  { id: 'igreja-a', name: 'Igreja Fictícia A', status: 'active' },
  { id: 'igreja-b', name: 'Igreja Fictícia B', status: 'active' },
  { id: 'igreja-c', name: 'Igreja Fictícia C', status: 'active' },
  { id: 'igreja-arquivada', name: 'Igreja Fictícia Arquivada', status: 'archived' },
] as ChurchEntity[]

beforeEach(() => localStorage.clear())
afterEach(async () => {
  await Promise.all(bancos.splice(0).map((banco) => banco.delete()))
  localStorage.clear()
})

async function preparar() {
  const banco = new ApoioDatabase(`ja-pregado-${crypto.randomUUID()}`)
  bancos.push(banco)
  return { banco, chave: await generateMasterKey(), servico: new JaPregadoService(banco) }
}

const igrejasRegistradas = (lista: Array<{ churchId: string | null }>) => lista.map(({ churchId }) => churchId).sort()

describe('registro de pregação já feita', () => {
  it('uma igreja sem data', async () => {
    const { chave, servico } = await preparar()
    await servico.registrar(CONTA, chave, SERMAO, alvosDaEscolha('uma', igrejas, ['igreja-a'], ''), '', [])

    const registros = await servico.listar(CONTA, chave, SERMAO)
    expect(registros).toHaveLength(1)
    expect(registros[0]).toMatchObject({ churchId: 'igreja-a', data: '', sermonId: SERMAO })
  })

  it('várias igrejas sem data', async () => {
    const { chave, servico } = await preparar()
    await servico.registrar(CONTA, chave, SERMAO, alvosDaEscolha('varias', igrejas, ['igreja-a', 'igreja-b'], ''), '', [])

    expect(igrejasRegistradas(await servico.listar(CONTA, chave, SERMAO))).toEqual(['igreja-a', 'igreja-b'])
  })

  it('todas as igrejas do distrito registra só as que faltam', async () => {
    const { chave, servico } = await preparar()
    await servico.registrar(CONTA, chave, SERMAO, alvosDaEscolha('uma', igrejas, ['igreja-b'], ''), '', [])

    const plano = await servico.registrar(CONTA, chave, SERMAO, alvosDaEscolha('todas', igrejas, [], ''), '', [])

    expect(igrejasRegistradas(plano.jaConstam)).toEqual(['igreja-b'])
    expect(igrejasRegistradas(plano.registrar)).toEqual(['igreja-a', 'igreja-c'])
    expect(igrejasRegistradas(await servico.listar(CONTA, chave, SERMAO))).toEqual(['igreja-a', 'igreja-b', 'igreja-c'])
  })

  it('igreja que já estava registrada não ganha outro registro', async () => {
    const { chave, servico } = await preparar()
    const alvos = alvosDaEscolha('uma', igrejas, ['igreja-a'], '')
    await servico.registrar(CONTA, chave, SERMAO, alvos, '', [])

    const segunda = await servico.registrar(CONTA, chave, SERMAO, alvos, '2026-02-01', [])

    expect(segunda.registrar).toEqual([])
    expect(igrejasRegistradas(segunda.jaConstam)).toEqual(['igreja-a'])
    const registros = await servico.listar(CONTA, chave, SERMAO)
    expect(registros).toHaveLength(1)
    expect(registros[0]?.data).toBe('')
  })

  it('não duplica nem com o mesmo pedido repetido, nem com igreja escolhida duas vezes', async () => {
    const { banco, chave, servico } = await preparar()
    const repetidas = [{ churchId: 'igreja-a', lugar: '' }, { churchId: 'igreja-a', lugar: '' }, { churchId: null, lugar: 'Capela Fictícia' }]
    await servico.registrar(CONTA, chave, SERMAO, repetidas, '', [])
    await servico.registrar(CONTA, chave, SERMAO, [{ churchId: null, lugar: 'capela ficticia' }], '', [])

    expect(await servico.listar(CONTA, chave, SERMAO)).toHaveLength(2)
    expect(await banco.vaultRecords.where('recordType').equals('sermon_preaching').count()).toBe(2)
  })

  it('a data pode ser acrescentada depois', async () => {
    const { chave, servico } = await preparar()
    await servico.registrar(CONTA, chave, SERMAO, alvosDaEscolha('uma', igrejas, ['igreja-a'], ''), '', [])
    const [registro] = await servico.listar(CONTA, chave, SERMAO)

    await servico.atualizar(CONTA, chave, registro!.id, { data: '2026-03-14' })

    const [atualizado] = await servico.listar(CONTA, chave, SERMAO)
    expect(atualizado).toMatchObject({ id: registro!.id, churchId: 'igreja-a', data: '2026-03-14' })
    await expect(servico.atualizar(CONTA, chave, registro!.id, { data: '14/03/2026' })).rejects.toThrow('Data inválida.')
  })

  it('o registro retroativo pode ser excluído e registrado de novo', async () => {
    const { chave, servico } = await preparar()
    await servico.registrar(CONTA, chave, SERMAO, alvosDaEscolha('varias', igrejas, ['igreja-a', 'igreja-b'], ''), '', [])
    const registroA = (await servico.listar(CONTA, chave, SERMAO)).find(({ churchId }) => churchId === 'igreja-a')!

    await servico.remover(CONTA, chave, registroA.id)
    expect(igrejasRegistradas(await servico.listar(CONTA, chave, SERMAO))).toEqual(['igreja-b'])

    await servico.registrar(CONTA, chave, SERMAO, alvosDaEscolha('uma', igrejas, ['igreja-a'], ''), '', [])
    expect(igrejasRegistradas(await servico.listar(CONTA, chave, SERMAO))).toEqual(['igreja-a', 'igreja-b'])
  })

  it('nenhum compromisso é criado na Agenda', async () => {
    const { banco, chave, servico } = await preparar()
    await servico.registrar(CONTA, chave, SERMAO, alvosDaEscolha('todas', igrejas, [], ''), '', [])
    await servico.registrar(CONTA, chave, SERMAO, alvosDaEscolha('outra', igrejas, [], 'Capela Fictícia'), '2026-01-10', [])
    const [registro] = await servico.listar(CONTA, chave, SERMAO)
    await servico.atualizar(CONTA, chave, registro!.id, { data: '2026-04-04' })
    await servico.remover(CONTA, chave, registro!.id)

    expect(await new AgendaService(banco).listEvents(CONTA, chave)).toEqual([])
    expect(await banco.vaultRecords.where('recordType').equals('agenda_event').count()).toBe(0)
  })
})
