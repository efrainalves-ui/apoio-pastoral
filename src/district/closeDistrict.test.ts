import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { currentDeviceId } from '../auth/device'
import { encryptPayload, generateMasterKey } from '../crypto/vault'
import { ApoioDatabase } from '../db/database'
import { FamilyBudgetDatabase } from '../family-budget/database'
import { VaultRepository } from '../db/repository'
import { ReadingDatabase } from '../reading/database'
import { ReadingService } from '../reading/service'
import { CloseDistrictService, isPersonalRecord, pendingDistrictClosure, resumeDistrictClosure, type CloseDistrictRemote } from './closeDistrict'

vi.mock('../auth/supabase', async (importarOriginal) => ({
  ...await importarOriginal<Record<string, unknown>>(),
  hasSupabaseConfiguration: false,
  ensureRemoteDevice: vi.fn(() => Promise.resolve()),
  revokeRemoteDevice: vi.fn(() => Promise.resolve()),
}))

const CONTA = 'conta-ficticia-encerramento'
const OUTRA_CONTA = 'conta-ficticia-vizinha'
const bancos: ApoioDatabase[] = []
const bancosFamilia: FamilyBudgetDatabase[] = []
const bancosLeitura: ReadingDatabase[] = []

beforeEach(() => localStorage.clear())
afterEach(async () => {
  localStorage.clear()
  await Promise.all(bancos.splice(0).map((banco) => banco.delete()))
  await Promise.all(bancosFamilia.splice(0).map((banco) => banco.delete()))
  await Promise.all(bancosLeitura.splice(0).map((banco) => banco.delete()))
})

function novoBanco() {
  const banco = new ApoioDatabase(`encerramento-${crypto.randomUUID()}`)
  bancos.push(banco)
  return banco
}

async function gravar(banco: ApoioDatabase, accountId: string, chave: CryptoKey, tipo: string, dados: object) {
  const id = crypto.randomUUID()
  await new VaultRepository(banco).saveEncrypted(
    accountId, currentDeviceId(accountId), id,
    await encryptPayload(chave, { schemaVersion: 1, type: tipo, data: dados }, id),
    tipo === 'agenda_event' ? 'agenda_event' : 'person',
  )
  return id
}

/** Distrito fictício completo, com um compromisso pessoal no meio. */
async function distritoFicticio(banco: ApoioDatabase, chave: CryptoKey) {
  const distrito = await gravar(banco, CONTA, chave, 'district', { name: 'Distrito Fictício' })
  const igreja = await gravar(banco, CONTA, chave, 'church', { name: 'Igreja Fictícia' })
  const pessoa = await gravar(banco, CONTA, chave, 'person', { name: 'Pessoa Fictícia' })
  const visita = await gravar(banco, CONTA, chave, 'visit', { notes: 'Visita fictícia' })
  const oracao = await gravar(banco, CONTA, chave, 'prayer_request', { text: 'Pedido fictício' })
  const sermao = await gravar(banco, CONTA, chave, 'sermon', { title: 'Sermão Fictício' })
  const agendaDistrito = await gravar(banco, CONTA, chave, 'agenda_event', { title: 'Reunião fictícia', category: 'meeting', churchId: 'igreja-ficticia' })
  const agendaPessoal = await gravar(banco, CONTA, chave, 'agenda_event', { title: 'Compromisso pessoal fictício', category: 'personal', churchId: null })
  return { distrito, igreja, pessoa, visita, oracao, sermao, agendaDistrito, agendaPessoal }
}

describe('encerrar distrito', () => {
  it('separa o que é do distrito do que é pessoal', () => {
    expect(isPersonalRecord({ schemaVersion: 1, type: 'agenda_event', data: { category: 'personal', churchId: null } })).toBe(true)
    expect(isPersonalRecord({ schemaVersion: 1, type: 'agenda_event', data: { category: 'personal', churchId: 'igreja' } })).toBe(false)
    expect(isPersonalRecord({ schemaVersion: 1, type: 'agenda_event', data: { category: 'visit', churchId: null } })).toBe(false)
    expect(isPersonalRecord({ schemaVersion: 1, type: 'person', data: { name: 'Pessoa Fictícia' } })).toBe(false)
  })

  it('mostra antes o que será apagado e o que fica', async () => {
    const banco = novoBanco(); const chave = await generateMasterKey()
    await distritoFicticio(banco, chave)
    await banco.devices.put({ id: currentDeviceId(CONTA), accountId: CONTA, label: 'Computador', status: 'active', createdAt: '', lastSeenAt: '' })

    const previa = await new CloseDistrictService(banco).preview(CONTA, chave)

    expect(previa.districtRecords).toBe(7)
    expect(previa.personalRecords).toBe(1)
    expect(previa.devices).toBe(1)
    expect(previa.removedLabels).toContain('Pedidos de oração')
    expect(previa.removedLabels).toContain('Sermões')
  })

  it('apaga os dados do distrito e preserva a agenda pessoal', async () => {
    const banco = novoBanco(); const chave = await generateMasterKey()
    const ids = await distritoFicticio(banco, chave)

    await new CloseDistrictService(banco).close(CONTA, chave)

    const repositorio = new VaultRepository(banco)
    const restantes = await repositorio.list(CONTA)
    expect(restantes.map(({ id }) => id)).toEqual([ids.agendaPessoal])
    for (const id of [ids.distrito, ids.igreja, ids.pessoa, ids.visita, ids.oracao, ids.sermao, ids.agendaDistrito]) {
      expect((await banco.vaultRecords.get(id))?.deletedAt).toBeTruthy()
    }
  })

  // A remoção precisa viajar: sem isso o serviço remoto guardaria o distrito.
  it('deixa na fila uma exclusão cifrada para cada registro do distrito', async () => {
    const banco = novoBanco(); const chave = await generateMasterKey()
    const ids = await distritoFicticio(banco, chave)
    await banco.outbox.clear()

    await new CloseDistrictService(banco).close(CONTA, chave)

    const fila = await banco.outbox.where('accountId').equals(CONTA).toArray()
    expect(fila).toHaveLength(7)
    expect(fila.every(({ operation }) => operation === 'delete')).toBe(true)
    expect(fila.some(({ recordId }) => recordId === ids.agendaPessoal)).toBe(false)
    expect(JSON.stringify(fila)).not.toContain('Pedido fictício')
    expect(JSON.stringify(fila)).not.toContain('Pessoa Fictícia')
  })

  it('revoga todas as autorizações e dá uma nova a este aparelho', async () => {
    const banco = novoBanco(); const chave = await generateMasterKey()
    await distritoFicticio(banco, chave)
    const antigo = currentDeviceId(CONTA)
    await banco.devices.put({ id: antigo, accountId: CONTA, label: 'Computador', status: 'active', createdAt: '', lastSeenAt: '' })
    await banco.devices.put({ id: 'aparelho-ficticio-antigo', accountId: CONTA, label: 'Celular', status: 'active', createdAt: '', lastSeenAt: '' })

    const resultado = await new CloseDistrictService(banco).close(CONTA, chave)

    expect(resultado.revokedDevices).toBe(2)
    expect(resultado.newDeviceId).not.toBe(antigo)
    expect((await banco.devices.get(antigo))?.status).toBe('revoked')
    expect((await banco.devices.get('aparelho-ficticio-antigo'))?.status).toBe('revoked')
    expect((await banco.devices.get(resultado.newDeviceId))?.status).toBe('active')
    expect(currentDeviceId(CONTA)).toBe(resultado.newDeviceId)
  })

  it('não toca em leitura nem no orçamento familiar', async () => {
    const banco = novoBanco(); const chave = await generateMasterKey()
    await distritoFicticio(banco, chave)
    const bancoLeitura = new ReadingDatabase(`leitura-${crypto.randomUUID()}`); bancosLeitura.push(bancoLeitura)
    const leitura = new ReadingService(bancoLeitura)
    await leitura.saveBook(CONTA, chave, { title: 'Livro Fictício', author: 'Autor Fictício', category: 'theology', totalPages: 100, pagesRead: 10, startDate: '2026-01-01', completedDate: null, status: 'reading', notes: '', createdAt: '', updatedAt: '' })
    const familia = new FamilyBudgetDatabase(`orcamento-${crypto.randomUUID()}`); bancosFamilia.push(familia)
    await familia.records.put({ id: 'entrada-ficticia', accountId: CONTA, recordType: 'income', algorithm: 'AES-GCM-256', ciphertext: 'x', iv: 'y', aad: 'z', keyVersion: 1, createdAt: '', updatedAt: '' })

    await new CloseDistrictService(banco).close(CONTA, chave)

    expect((await leitura.books(CONTA, chave)).map(({ title }) => title)).toEqual(['Livro Fictício'])
    expect(await familia.records.count()).toBe(1)
  })

  it('não alcança os dados de outra conta', async () => {
    const banco = novoBanco(); const chave = await generateMasterKey(); const chaveVizinha = await generateMasterKey()
    await distritoFicticio(banco, chave)
    const vizinho = await gravar(banco, OUTRA_CONTA, chaveVizinha, 'person', { name: 'Pessoa Fictícia Vizinha' })

    await new CloseDistrictService(banco).close(CONTA, chave)

    expect((await banco.vaultRecords.get(vizinho))?.deletedAt).toBeUndefined()
    const filaVizinha = await banco.outbox.where('accountId').equals(OUTRA_CONTA).toArray()
    expect(filaVizinha.some(({ operation }) => operation === 'delete')).toBe(false)
  })

  it('revoga no servidor os aparelhos que este aplicativo nunca conheceu', async () => {
    // O buraco: cada instalação guarda só a si mesma. Percorrer a lista local
    // revogava apenas este aparelho, e os outros seguiam sincronizando um
    // distrito que o pastor acabara de encerrar.
    const banco = novoBanco(); const chave = await generateMasterKey()
    await distritoFicticio(banco, chave)
    const antigo = currentDeviceId(CONTA)
    await banco.devices.put({ id: antigo, accountId: CONTA, label: 'Computador', status: 'active', createdAt: '', lastSeenAt: '' })
    let revogouTudo = 0
    const servico: CloseDistrictRemote = {
      listDevices: () => Promise.resolve([
        { id: antigo, label: 'Computador', status: 'active' as const, lastSeenAt: null },
        { id: 'celular-so-do-servico', label: 'Celular', status: 'active' as const, lastSeenAt: null },
        { id: 'tablet-so-do-servico', label: 'Tablet', status: 'active' as const, lastSeenAt: null },
      ]),
      revokeAll: () => { revogouTudo += 1; return Promise.resolve(3) },
    }

    const previa = await new CloseDistrictService(banco, servico).preview(CONTA, chave)
    const resultado = await new CloseDistrictService(banco, servico).close(CONTA, chave)

    expect(previa.devices).toBe(3)
    expect(revogouTudo).toBe(1)
    expect(resultado.revokedDevices).toBe(3)
    expect((await banco.devices.get(antigo))?.status).toBe('revoked')
    expect((await banco.devices.get(resultado.newDeviceId))?.status).toBe('active')
  })

  it('sem serviço remoto continua revogando o que este aparelho conhece', async () => {
    const banco = novoBanco(); const chave = await generateMasterKey()
    await distritoFicticio(banco, chave)
    const antigo = currentDeviceId(CONTA)
    await banco.devices.put({ id: antigo, accountId: CONTA, label: 'Computador', status: 'active', createdAt: '', lastSeenAt: '' })
    const servico: CloseDistrictRemote = { listDevices: () => Promise.resolve(null), revokeAll: () => Promise.resolve(null) }

    const resultado = await new CloseDistrictService(banco, servico).close(CONTA, chave)

    expect(resultado.revokedDevices).toBe(1)
    expect((await banco.devices.get(antigo))?.status).toBe('revoked')
  })

  it('deixa marca do encerramento e a retira quando a autorização nova está de pé', async () => {
    const banco = novoBanco(); const chave = await generateMasterKey()
    await distritoFicticio(banco, chave)
    await banco.devices.put({ id: currentDeviceId(CONTA), accountId: CONTA, label: 'Computador', status: 'active', createdAt: '', lastSeenAt: '' })
    const servico: CloseDistrictRemote = { listDevices: () => Promise.resolve(null), revokeAll: () => Promise.resolve(2) }

    await new CloseDistrictService(banco, servico).close(CONTA, chave)

    expect(await pendingDistrictClosure(CONTA, banco)).toBe(false)
  })

  it('retoma o encerramento interrompido e devolve autorização a este aparelho', async () => {
    // O instante perigoso: os aparelhos já foram revogados e este ainda não
    // recebeu autorização nova. Fechar o navegador aí deixava a conta abrindo
    // no aparelho e sem entrar mais no serviço, sem nada na tela.
    const banco = novoBanco(); const chave = await generateMasterKey()
    await distritoFicticio(banco, chave)
    const antigo = currentDeviceId(CONTA)
    await banco.devices.put({ id: antigo, accountId: CONTA, label: 'Computador', status: 'revoked', createdAt: '', lastSeenAt: '', revokedAt: new Date().toISOString() })
    await banco.pendingActions.put({ id: `${CONTA}:close_district`, accountId: CONTA, kind: 'close_district', createdAt: new Date().toISOString(), stage: 'reauthorizing' })

    expect(await pendingDistrictClosure(CONTA, banco)).toBe(true)
    const { newDeviceId } = await resumeDistrictClosure(CONTA, banco, () => Promise.resolve(0))

    expect(newDeviceId).not.toBe(antigo)
    expect((await banco.devices.get(newDeviceId))?.status).toBe('active')
    expect(currentDeviceId(CONTA)).toBe(newDeviceId)
    expect(await pendingDistrictClosure(CONTA, banco)).toBe(false)
  })

  it('retoma também quando parou antes de revogar, e não trava se o serviço recusar', async () => {
    const banco = novoBanco(); const chave = await generateMasterKey()
    await distritoFicticio(banco, chave)
    const antigo = currentDeviceId(CONTA)
    await banco.devices.put({ id: antigo, accountId: CONTA, label: 'Computador', status: 'active', createdAt: '', lastSeenAt: '' })
    await banco.pendingActions.put({ id: `${CONTA}:close_district`, accountId: CONTA, kind: 'close_district', createdAt: new Date().toISOString(), stage: 'revoking' })

    // O serviço recusa porque este aparelho já estava revogado lá: a retomada
    // segue para a autorização nova em vez de travar.
    const { newDeviceId } = await resumeDistrictClosure(CONTA, banco, () => Promise.reject(new Error('aparelho sem autorizacao ativa')))

    expect((await banco.devices.get(antigo))?.status).toBe('revoked')
    expect((await banco.devices.get(newDeviceId))?.status).toBe('active')
    expect(await pendingDistrictClosure(CONTA, banco)).toBe(false)
  })

  it('não retoma o que não começou', async () => {
    const banco = novoBanco()
    await expect(resumeDistrictClosure(CONTA, banco, () => Promise.resolve(0))).rejects.toThrow('não há encerramento pendente'.replace('não h', 'Não h'))
  })
})
