import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { currentDeviceId } from '../auth/device'
import { encryptPayload, generateMasterKey } from '../crypto/vault'
import { ApoioDatabase } from '../db/database'
import { FamilyBudgetDatabase } from '../family-budget/database'
import { VaultRepository } from '../db/repository'
import { pendingRemotePurge } from '../db/purge'
import { ReadingDatabase } from '../reading/database'
import { ReadingService } from '../reading/service'
import { CloseDistrictService, districtClosureStage, isPersonalRecord, pendingDistrictClosure, type CloseDistrictRemote } from './closeDistrict'

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

/** Dois aparelhos fictícios da conta: este e um segundo, que precisa cair junto. */
async function doisAparelhos(banco: ApoioDatabase) {
  const este = currentDeviceId(CONTA)
  await banco.devices.put({ id: este, accountId: CONTA, label: 'Computador Fictício', status: 'active', createdAt: '', lastSeenAt: '' })
  await banco.devices.put({ id: 'celular-ficticio', accountId: CONTA, label: 'Celular Fictício', status: 'active', createdAt: '', lastSeenAt: '' })
  return este
}

/**
 * Serviço remoto fictício.
 *
 * A sincronização padrão faz o que a de verdade faz quando dá tudo certo:
 * confirma a rodada e limpa a fila de expurgo. Os testes de interrupção
 * substituem essa função para parar em uma etapa escolhida.
 */
function servicoFicticio(banco: ApoioDatabase, overrides: Partial<CloseDistrictRemote> = {}): CloseDistrictRemote {
  return {
    listDevices: () => Promise.resolve([
      { id: currentDeviceId(CONTA), label: 'Computador Fictício', status: 'active' as const, lastSeenAt: null },
      { id: 'celular-ficticio', label: 'Celular Fictício', status: 'active' as const, lastSeenAt: null },
    ]),
    revokeAll: () => Promise.resolve(2),
    synchronize: async () => { await banco.pendingActions.delete(`${CONTA}:purge_history`); return true },
    ...overrides,
  }
}

describe('encerrar distrito', () => {
  it('separa o que é do distrito do que é pessoal', () => {
    expect(isPersonalRecord({ schemaVersion: 1, type: 'agenda_event', data: { category: 'personal', churchId: null } })).toBe(true)
    expect(isPersonalRecord({ schemaVersion: 1, type: 'agenda_event', data: { category: 'personal', churchId: 'igreja' } })).toBe(false)
    expect(isPersonalRecord({ schemaVersion: 1, type: 'agenda_event', data: { category: 'visit', churchId: null } })).toBe(false)
    expect(isPersonalRecord({ schemaVersion: 1, type: 'person', data: { name: 'Pessoa Fictícia' } })).toBe(false)
  })

  /*
    O FPE do obreiro continua o mesmo depois da mudança, e um item do LETRA
    adquirido ano passado não volta a ser elegível só porque o pastor trocou de
    cidade. Apagar esse histórico com o distrito zeraria o intervalo de
    renovação sem ninguém pedir.
  */
  it('os parâmetros do obreiro e o histórico do LETRA seguem o pastor', () => {
    expect(isPersonalRecord({ schemaVersion: 1, type: 'work_config', data: {} })).toBe(true)
    expect(isPersonalRecord({ schemaVersion: 1, type: 'work_dependent', data: {} })).toBe(true)
    expect(isPersonalRecord({ schemaVersion: 1, type: 'letra_budget', data: {} })).toBe(true)
    expect(isPersonalRecord({ schemaVersion: 1, type: 'letra_item', data: {} })).toBe(true)
    expect(isPersonalRecord({ schemaVersion: 1, type: 'letra_acquisition', data: {} })).toBe(true)
    expect(isPersonalRecord({ schemaVersion: 1, type: 'work_paycheck', data: {} })).toBe(true)
  })

  /* O trabalho feito no distrito fica com o distrito. */
  it('os lançamentos do ministério são do distrito', () => {
    expect(isPersonalRecord({ schemaVersion: 1, type: 'work_entry', data: {} })).toBe(false)
    expect(isPersonalRecord({ schemaVersion: 1, type: 'work_expense', data: {} })).toBe(false)
    expect(isPersonalRecord({ schemaVersion: 1, type: 'mileage', data: {} })).toBe(false)
  })

  it('mostra antes o que será apagado e o que fica', async () => {
    const banco = novoBanco(); const chave = await generateMasterKey()
    await distritoFicticio(banco, chave)
    await banco.devices.put({ id: currentDeviceId(CONTA), accountId: CONTA, label: 'Computador', status: 'active', createdAt: '', lastSeenAt: '' })

    const previa = await new CloseDistrictService(banco).preview(CONTA, chave)

    expect(previa.districtRecords).toBe(7)
    expect(previa.personalRecords).toBe(1)
    expect(previa.devices).toBe(1)
    expect(previa.unreadableRecords).toBe(0)
    expect(previa.removedLabels).toContain('Pedidos de oração')
    expect(previa.removedLabels).toContain('Sermões')
  })

  it('apaga os dados do distrito e preserva a agenda pessoal', async () => {
    const banco = novoBanco(); const chave = await generateMasterKey()
    const ids = await distritoFicticio(banco, chave)

    const resultado = await new CloseDistrictService(banco).close(CONTA, chave)

    expect(resultado.completed).toBe(true)
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

  it('pede o expurgo do histórico distrital no serviço', async () => {
    // Trocar o envelope por lápide resolve o presente; o histórico remoto
    // guardava o distrito inteiro, cifrado com a chave que o pastor usa todo
    // dia. Encerrar precisa pedir o expurgo, e pedir junto da lápide.
    const banco = novoBanco(); const chave = await generateMasterKey()
    const ids = await distritoFicticio(banco, chave)
    const servico = servicoFicticio(banco, { synchronize: () => Promise.resolve(null) })

    await new CloseDistrictService(banco, servico).close(CONTA, chave)

    const alvos = await pendingRemotePurge(CONTA, banco)
    expect(alvos).toHaveLength(7)
    expect(alvos.some(({ recordId }) => recordId === ids.agendaPessoal)).toBe(false)
    // Cada alvo aponta para a operação que este aparelho acabou de publicar.
    const fila = await banco.outbox.where('accountId').equals(CONTA).toArray()
    for (const alvo of alvos) {
      const operacao = fila.find(({ id }) => id === alvo.operationId)
      expect(operacao?.recordId).toBe(alvo.recordId)
    }
  })

  it('revoga todas as autorizações e dá uma nova a este aparelho', async () => {
    const banco = novoBanco(); const chave = await generateMasterKey()
    await distritoFicticio(banco, chave)
    const antigo = await doisAparelhos(banco)

    const resultado = await new CloseDistrictService(banco).close(CONTA, chave)

    expect(resultado.revokedDevices).toBe(2)
    expect(resultado.newDeviceId).not.toBe(antigo)
    expect((await banco.devices.get(antigo))?.status).toBe('revoked')
    expect((await banco.devices.get('celular-ficticio'))?.status).toBe('revoked')
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
    const servico = servicoFicticio(banco, {
      listDevices: () => Promise.resolve([
        { id: antigo, label: 'Computador', status: 'active' as const, lastSeenAt: null },
        { id: 'celular-so-do-servico', label: 'Celular', status: 'active' as const, lastSeenAt: null },
        { id: 'tablet-so-do-servico', label: 'Tablet', status: 'active' as const, lastSeenAt: null },
      ]),
      revokeAll: () => Promise.resolve(3),
    })

    const previa = await new CloseDistrictService(banco, servico).preview(CONTA, chave)
    const resultado = await new CloseDistrictService(banco, servico).close(CONTA, chave)

    expect(previa.devices).toBe(3)
    expect(resultado.revokedDevices).toBe(3)
    expect((await banco.devices.get(antigo))?.status).toBe('revoked')
    expect((await banco.devices.get(resultado.newDeviceId))?.status).toBe('active')
  })

  it('sem serviço remoto continua revogando o que este aparelho conhece', async () => {
    const banco = novoBanco(); const chave = await generateMasterKey()
    await distritoFicticio(banco, chave)
    const antigo = currentDeviceId(CONTA)
    await banco.devices.put({ id: antigo, accountId: CONTA, label: 'Computador', status: 'active', createdAt: '', lastSeenAt: '' })
    const servico: CloseDistrictRemote = { listDevices: () => Promise.resolve(null), revokeAll: () => Promise.resolve(null), synchronize: () => Promise.resolve(null) }

    const resultado = await new CloseDistrictService(banco, servico).close(CONTA, chave)

    expect(resultado.revokedDevices).toBe(1)
    expect((await banco.devices.get(antigo))?.status).toBe('revoked')
  })

  it('retira a marca quando a autorização nova está de pé', async () => {
    const banco = novoBanco(); const chave = await generateMasterKey()
    await distritoFicticio(banco, chave)
    await doisAparelhos(banco)

    await new CloseDistrictService(banco, servicoFicticio(banco)).close(CONTA, chave)

    expect(await pendingDistrictClosure(CONTA, banco)).toBe(false)
  })

  // ---------------------------------------------------------------------
  // Interrupção antes e depois de cada etapa, com dois aparelhos fictícios.
  // ---------------------------------------------------------------------

  it('grava a intenção antes de apagar o primeiro registro', async () => {
    // A ordem é o ponto: se a exclusão viesse primeiro, fechar o navegador
    // logo depois dela deixava metade do distrito apagada aqui, inteira no
    // serviço, e nada na tela dizendo que havia trabalho começado.
    const banco = novoBanco(); const chave = await generateMasterKey()
    await distritoFicticio(banco, chave)
    await doisAparelhos(banco)
    let marcaNaPrimeiraLeitura: unknown = 'nunca leu'
    const servico = servicoFicticio(banco, {
      synchronize: async () => {
        marcaNaPrimeiraLeitura = await banco.pendingActions.get(`${CONTA}:close_district`)
        await banco.pendingActions.delete(`${CONTA}:purge_history`)
        return true
      },
    })

    await new CloseDistrictService(banco, servico).close(CONTA, chave)

    expect(marcaNaPrimeiraLeitura).toBeTruthy()
  })

  it('interrupção antes do envio para o serviço para na etapa das lápides', async () => {
    const banco = novoBanco(); const chave = await generateMasterKey()
    const ids = await distritoFicticio(banco, chave)
    await doisAparelhos(banco)
    const servico = servicoFicticio(banco, { synchronize: () => Promise.resolve(false) })

    const resultado = await new CloseDistrictService(banco, servico).close(CONTA, chave)

    expect(resultado.completed).toBe(false)
    expect(resultado.stage).toBe('tombstones')
    expect(resultado.pending).toContain('não chegaram ao serviço')
    // As lápides existem, mas nenhum aparelho foi revogado ainda.
    expect((await banco.vaultRecords.get(ids.distrito))?.deletedAt).toBeTruthy()
    expect((await banco.devices.get('celular-ficticio'))?.status).toBe('active')
    expect(await districtClosureStage(CONTA, banco)).toBe('tombstones')
  })

  it('interrupção com expurgo pendente para na etapa do histórico remoto', async () => {
    const banco = novoBanco(); const chave = await generateMasterKey()
    await distritoFicticio(banco, chave)
    await doisAparelhos(banco)
    // Sincroniza, mas nunca limpa a fila de expurgo: o histórico do distrito
    // continua no serviço, e encerrar não pode terminar assim.
    const servico = servicoFicticio(banco, { synchronize: () => Promise.resolve(true) })

    const resultado = await new CloseDistrictService(banco, servico).close(CONTA, chave)

    expect(resultado.completed).toBe(false)
    expect(resultado.stage).toBe('syncing')
    expect(resultado.pending).toContain('histórico do distrito')
    expect((await banco.devices.get('celular-ficticio'))?.status).toBe('active')
  })

  it('interrupção na revogação preserva a pendência e não autoriza nada', async () => {
    const banco = novoBanco(); const chave = await generateMasterKey()
    await distritoFicticio(banco, chave)
    const antigo = await doisAparelhos(banco)
    const servico = servicoFicticio(banco, { revokeAll: () => Promise.reject(new Error('sem rede')) })

    await expect(new CloseDistrictService(banco, servico).close(CONTA, chave)).rejects.toThrow('sem rede')

    expect(await pendingDistrictClosure(CONTA, banco)).toBe(true)
    expect(currentDeviceId(CONTA)).toBe(antigo)
    expect((await banco.devices.get(antigo))?.status).toBe('active')
  })

  it('retoma de onde parou e conclui, com os dois aparelhos revogados', async () => {
    const banco = novoBanco(); const chave = await generateMasterKey()
    await distritoFicticio(banco, chave)
    const antigo = await doisAparelhos(banco)
    let comRede = false
    const servico = servicoFicticio(banco, {
      synchronize: async () => { if (!comRede) return false; await banco.pendingActions.delete(`${CONTA}:purge_history`); return true },
    })
    const service = new CloseDistrictService(banco, servico)

    const parou = await service.close(CONTA, chave)
    expect(parou.completed).toBe(false)

    comRede = true
    const concluiu = await service.resume(CONTA, chave)

    expect(concluiu.completed).toBe(true)
    expect(concluiu.newDeviceId).not.toBe(antigo)
    expect((await banco.devices.get(antigo))?.status).toBe('revoked')
    expect((await banco.devices.get('celular-ficticio'))?.status).toBe('revoked')
    expect((await banco.devices.get(concluiu.newDeviceId))?.status).toBe('active')
    expect(await pendingDistrictClosure(CONTA, banco)).toBe(false)
  })

  it('retomar várias vezes deixa exatamente um aparelho ativo e não duplica lápides', async () => {
    // O identificador é escolhido uma vez e fica gravado; as lápides já
    // publicadas não são publicadas de novo. Sem as duas coisas, cada
    // interrupção deixava um aparelho ativo a mais e uma fila maior.
    const banco = novoBanco(); const chave = await generateMasterKey()
    await distritoFicticio(banco, chave)
    await doisAparelhos(banco)
    await banco.outbox.clear()
    let tentativas = 0
    const servico = servicoFicticio(banco, {
      synchronize: async () => {
        tentativas += 1
        if (tentativas < 3) return false
        await banco.pendingActions.delete(`${CONTA}:purge_history`)
        return true
      },
    })
    const service = new CloseDistrictService(banco, servico)

    const primeira = await service.close(CONTA, chave)
    const segunda = await service.resume(CONTA, chave)
    const terceira = await service.resume(CONTA, chave)

    expect(primeira.completed).toBe(false)
    expect(segunda.completed).toBe(false)
    expect(terceira.completed).toBe(true)
    expect(terceira.newDeviceId).toBe(primeira.newDeviceId)
    const ativos = (await banco.devices.where('accountId').equals(CONTA).toArray()).filter(({ status }) => status === 'active')
    expect(ativos).toHaveLength(1)
    expect(ativos[0]!.id).toBe(terceira.newDeviceId)
    // Sete registros do distrito, sete lápides — não vinte e uma.
    const fila = await banco.outbox.where('accountId').equals(CONTA).toArray()
    expect(fila).toHaveLength(7)
  })

  it('um registro corrompido não derruba o encerramento', async () => {
    // Um único registro que não abre parava a classificação inteira, e com ela
    // a prévia e o encerramento: o pastor ficava sem nenhum caminho.
    const banco = novoBanco(); const chave = await generateMasterKey(); const outraChave = await generateMasterKey()
    const ids = await distritoFicticio(banco, chave)
    const intruso = await gravar(banco, CONTA, outraChave, 'person', { name: 'Registro Ilegível Fictício' })
    await doisAparelhos(banco)

    const previa = await new CloseDistrictService(banco).preview(CONTA, chave)
    expect(previa.unreadableRecords).toBe(1)
    expect(previa.districtRecords).toBe(7)

    const resultado = await new CloseDistrictService(banco).close(CONTA, chave)

    expect(resultado.completed).toBe(true)
    expect((await banco.vaultRecords.get(ids.distrito))?.deletedAt).toBeTruthy()
    // O ilegível continua guardado: apagar às cegas seria apagar sem saber o quê.
    expect((await banco.vaultRecords.get(intruso))?.deletedAt).toBeUndefined()
    expect(await banco.corruptedRecords.where('accountId').equals(CONTA).count()).toBe(1)
  })

  it('não retoma o que não começou', async () => {
    const banco = novoBanco(); const chave = await generateMasterKey()
    await expect(new CloseDistrictService(banco).resume(CONTA, chave)).rejects.toThrow('Não há encerramento pendente')
  })
})
