import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { currentDeviceId } from '../auth/device'
import { encryptPayload, generateMasterKey } from '../crypto/vault'
import { readPayloads } from '../db/corrupted'
import { ApoioDatabase } from '../db/database'
import { VaultRepository } from '../db/repository'
import type { VaultRecord } from '../db/types'
import { CloseDistrictService } from '../district/closeDistrict'
import { NewDistrictService } from '../district/newDistrict'
import { JaPregadoService } from './jaPregadoService'
import { listPreachings } from './preachings'
import { PreservacaoDosSermoes } from './preservacao'
import { SermonService } from './service'

vi.mock('../auth/supabase', async (importarOriginal) => ({
  ...await importarOriginal<Record<string, unknown>>(),
  hasSupabaseConfiguration: false,
  ensureRemoteDevice: vi.fn(() => Promise.resolve()),
  revokeRemoteDevice: vi.fn(() => Promise.resolve()),
}))

/*
  Só dados fictícios. O distrito antigo tem três igrejas; o sermão da série foi
  pregado em duas delas num mesmo compromisso, marcado como já pregado na
  terceira e numa igreja de fora do distrito.
*/
const CONTA = 'conta-ficticia-sermoes'
const bancos: ApoioDatabase[] = []
beforeEach(() => localStorage.clear())
afterEach(async () => { localStorage.clear(); await Promise.all(bancos.splice(0).map((banco) => banco.delete())) })

function novoBanco() {
  const banco = new ApoioDatabase(`sermoes-${crypto.randomUUID()}`)
  bancos.push(banco)
  return banco
}

async function gravar(banco: ApoioDatabase, chave: CryptoKey, tipo: VaultRecord['recordType'], dados: object, id: string = crypto.randomUUID()) {
  await new VaultRepository(banco).saveEncrypted(CONTA, currentDeviceId(CONTA), id, await encryptPayload(chave, { schemaVersion: 1, type: tipo, data: dados }, id), tipo)
  return id
}

const SERMAO = { theme: '', mainText: 'João 3:16', complementaryTexts: '', objective: '', introduction: 'Introdução fictícia', content: 'Rascunho fictício', conclusion: '', appeal: '', notes: 'Anotação fictícia do pastor', tags: ['série fictícia'], status: 'draft', createdAt: '2025-01-01T00:00:00.000Z', updatedAt: '2025-01-01T00:00:00.000Z' }
const agenda = (dados: object) => ({ title: 'Pregação', location: '', address: '', visitTarget: 'none', sermonSnapshot: null, endAt: '', allDay: false, reminderMinutes: null, notes: '', includeInItinerary: true, mondayException: false, createdAt: '', updatedAt: '', ...dados })

async function distritoComSermoes(banco: ApoioDatabase, chave: CryptoKey) {
  await gravar(banco, chave, 'district', { name: 'Distrito Antigo Fictício' })
  const central = await gravar(banco, chave, 'church', { name: 'Igreja Central Fictícia', address: 'Rua Fictícia, 100', administrativeNotes: 'Nota administrativa fictícia' })
  const norte = await gravar(banco, chave, 'church', { name: 'Igreja Norte Fictícia', address: 'Avenida Fictícia, 200' })
  const sul = await gravar(banco, chave, 'church', { name: 'Igreja Sul Fictícia', address: 'Travessa Fictícia, 300' })
  await gravar(banco, chave, 'person', { name: 'Membro Fictício', currentChurchId: central })
  const semHistorico = await gravar(banco, chave, 'sermon', { ...SERMAO, title: 'Sermão Fictício sem histórico' })
  const serie = await gravar(banco, chave, 'sermon', { ...SERMAO, title: 'Sermão Fictício da série', status: 'ready' })
  const pregacaoNaAgenda = await gravar(banco, chave, 'agenda_event', agenda({ category: 'preaching', sermonId: serie, churchId: central, churchIds: [central, norte], escolhaDeIgreja: 'varias', startAt: '2026-03-07T09:00' }))
  await gravar(banco, chave, 'agenda_event', agenda({ category: 'preaching', sermonId: serie, churchId: sul, churchIds: [sul], escolhaDeIgreja: 'uma', startAt: '2099-01-03T09:00' }))
  await gravar(banco, chave, 'sermon_preaching', { sermonId: serie, churchId: sul, lugar: '', data: '2025-11-15', createdAt: '', updatedAt: '' })
  await gravar(banco, chave, 'sermon_preaching', { sermonId: serie, churchId: null, lugar: 'Igreja Visitante Fictícia', data: '', createdAt: '', updatedAt: '' })
  return { central, norte, sul, semHistorico, serie, pregacaoNaAgenda }
}

const encerrar = (banco: ApoioDatabase, chave: CryptoKey) => new CloseDistrictService(
  banco,
  { listDevices: () => Promise.resolve(null), revokeAll: () => Promise.resolve(null), synchronize: () => Promise.resolve(null) },
  () => Promise.resolve(),
).close(CONTA, chave)

async function ativos(banco: ApoioDatabase, chave: CryptoKey) {
  const registros = await banco.vaultRecords.where('accountId').equals(CONTA).filter((record) => !record.deletedAt).toArray()
  return (await readPayloads(chave, registros, banco)).opened
}

describe('sermões ao encerrar um distrito', () => {
  it('1. o sermão sem histórico permanece, com conteúdo, rascunho e anotações', async () => {
    const banco = novoBanco(); const chave = await generateMasterKey()
    const { semHistorico } = await distritoComSermoes(banco, chave)
    const resultado = await encerrar(banco, chave)
    expect(resultado.completed).toBe(true)
    const sermao = await new SermonService(banco).get(CONTA, chave, semHistorico)
    expect(sermao).toMatchObject({ title: 'Sermão Fictício sem histórico', content: 'Rascunho fictício', notes: 'Anotação fictícia do pastor', status: 'draft', tags: ['série fictícia'] })
  })

  it('2 e 3. o sermão pregado em várias igrejas permanece, com as datas e os nomes históricos', async () => {
    const banco = novoBanco(); const chave = await generateMasterKey()
    const { serie } = await distritoComSermoes(banco, chave)
    await encerrar(banco, chave)
    expect((await new SermonService(banco).get(CONTA, chave, serie))?.title).toBe('Sermão Fictício da série')
    const historico = (await new JaPregadoService(banco).listar(CONTA, chave, serie))
      .map(({ lugar, data, distrito }) => ({ lugar, data, distrito: distrito ?? null }))
      .sort((a, b) => a.lugar.localeCompare(b.lugar, 'pt-BR'))
    expect(historico).toEqual([
      { lugar: 'Igreja Central Fictícia', data: '2026-03-07', distrito: 'Distrito Antigo Fictício' },
      { lugar: 'Igreja Norte Fictícia', data: '2026-03-07', distrito: 'Distrito Antigo Fictício' },
      { lugar: 'Igreja Sul Fictícia', data: '2025-11-15', distrito: 'Distrito Antigo Fictício' },
      { lugar: 'Igreja Visitante Fictícia', data: '', distrito: null },
    ])
  })

  it('4. nenhum vínculo ativo aponta para as igrejas apagadas, e o compromisso futuro não vira histórico', async () => {
    const banco = novoBanco(); const chave = await generateMasterKey()
    const { central, norte, sul, serie } = await distritoComSermoes(banco, chave)
    await encerrar(banco, chave)
    const historico = await new JaPregadoService(banco).listar(CONTA, chave, serie)
    expect(historico.every(({ churchId }) => churchId === null)).toBe(true)
    expect(historico.some(({ data }) => data.startsWith('2099'))).toBe(false)
    const restantes = await ativos(banco, chave)
    expect(JSON.stringify(restantes.map(({ payload }) => payload))).not.toMatch(new RegExp(`${central}|${norte}|${sul}`, 'u'))
  })

  it('5. os dados completos das antigas igrejas e dos membros não são preservados', async () => {
    const banco = novoBanco(); const chave = await generateMasterKey()
    const { central } = await distritoComSermoes(banco, chave)
    await encerrar(banco, chave)
    expect((await banco.vaultRecords.get(central))?.deletedAt).toBeTruthy()
    const restantes = await ativos(banco, chave)
    expect([...new Set(restantes.map(({ payload }) => payload.type))].sort()).toEqual(['sermon', 'sermon_preaching'])
    const texto = JSON.stringify(restantes.map(({ payload }) => payload))
    for (const proibido of ['Rua Fictícia', 'Avenida Fictícia', 'Nota administrativa fictícia', 'Membro Fictício']) expect(texto).not.toContain(proibido)
  })

  it('6. o distrito novo acessa a mesma biblioteca e o histórico anterior', async () => {
    const banco = novoBanco(); const chave = await generateMasterKey()
    const { semHistorico, serie } = await distritoComSermoes(banco, chave)
    await encerrar(banco, chave)
    await gravar(banco, chave, 'district', { name: 'Distrito Novo Fictício' })
    const nova = await gravar(banco, chave, 'church', { name: 'Igreja Nova Fictícia' })
    const sermoes = await new SermonService(banco).list(CONTA, chave)
    expect(sermoes.map(({ id }) => id).sort()).toEqual([semHistorico, serie].sort())

    const jaPregado = new JaPregadoService(banco)
    const igrejaNova = { id: nova, districtId: 'novo', name: 'Igreja Nova Fictícia', status: 'active' } as never
    await jaPregado.registrar(CONTA, chave, serie, [{ churchId: nova, lugar: '' }], '2026-09-12', [])
    const lugares = listPreachings([], [igrejaNova], serie, new Date(), await jaPregado.listar(CONTA, chave, serie)).map(({ place }) => place)
    expect(lugares).toHaveLength(5)
    expect(lugares).toEqual(expect.arrayContaining(['Igreja Nova Fictícia', 'Igreja Central Fictícia', 'Igreja Norte Fictícia', 'Igreja Sul Fictícia', 'Igreja Visitante Fictícia']))
  })

  it('6b. começar um distrito novo pelo outro caminho também mantém a biblioteca', async () => {
    const banco = novoBanco(); const chave = await generateMasterKey()
    const { semHistorico, serie } = await distritoComSermoes(banco, chave)
    await new NewDistrictService(banco).start(CONTA, chave, 'empty')
    expect((await new SermonService(banco).list(CONTA, chave)).map(({ id }) => id).sort()).toEqual([semHistorico, serie].sort())
    const historico = await new JaPregadoService(banco).listar(CONTA, chave, serie)
    expect(historico).toHaveLength(4)
    expect(historico.every(({ churchId }) => churchId === null)).toBe(true)
    expect(await banco.vaultRecords.where('accountId').equals(CONTA).filter((record) => !['sermon', 'sermon_preaching'].includes(record.recordType)).count()).toBe(0)
  })

  it('7. executar a migração de novo não duplica registros, nem antes nem depois do encerramento', async () => {
    const banco = novoBanco(); const chave = await generateMasterKey()
    const { serie, central, norte, sul, pregacaoNaAgenda } = await distritoComSermoes(banco, chave)
    const preservacao = new PreservacaoDosSermoes(banco)
    expect(await preservacao.preservar(CONTA, chave)).toEqual({ desvinculadas: 1, trazidasDaAgenda: 2 })
    expect(await preservacao.preservar(CONTA, chave)).toEqual({ desvinculadas: 0, trazidasDaAgenda: 0 })
    const jaPregado = new JaPregadoService(banco)
    expect(await jaPregado.listar(CONTA, chave, serie)).toHaveLength(4)

    // Encerramento interrompido: o compromisso ainda existe e o histórico já foi copiado. A tela não mostra em dobro.
    const igrejas = [central, norte, sul].map((id, indice) => ({ id, districtId: 'antigo', name: ['Igreja Central Fictícia', 'Igreja Norte Fictícia', 'Igreja Sul Fictícia'][indice]!, status: 'active' })) as never
    const evento = { id: pregacaoNaAgenda, ...agenda({ category: 'preaching', sermonId: serie, churchId: central, churchIds: [central, norte], escolhaDeIgreja: 'varias', startAt: '2026-03-07T09:00' }) } as never
    expect(listPreachings([evento], igrejas, serie, new Date(), await jaPregado.listar(CONTA, chave, serie))).toHaveLength(3)

    await encerrar(banco, chave)
    expect(await preservacao.preservar(CONTA, chave)).toEqual({ desvinculadas: 0, trazidasDaAgenda: 0 })
    expect(await jaPregado.listar(CONTA, chave, serie)).toHaveLength(4)
    expect(await new SermonService(banco).list(CONTA, chave)).toHaveLength(2)
  })
})
