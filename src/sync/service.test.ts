import { afterEach, describe, expect, it } from 'vitest'
import { encryptPayload, generateMasterKey, generateVaultKeys } from '../crypto/vault'
import { PeopleService } from '../people/service'
import { ApoioDatabase } from '../db/database'
import { VaultRepository } from '../db/repository'
import type { OutboxRecord } from '../db/types'
import { SyncService, firstSyncPending } from './service'
import { MAC_VERSION, signOperation, withOperationMac } from './operationMac'
import { PURGE_BATCH_SIZE, type PurgeTarget } from '../auth/supabase'
import { LocalDevelopmentTransport, PAGE_SIZE, resetLocalDevelopmentTransport } from './transport'
import type { EncryptedOperation, PullResult, PushResult, SyncTransport } from './types'

class CaptureTransport implements SyncTransport {
  readonly name = 'local-development' as const
  pushed: EncryptedOperation[] = []
  pulls = 0
  push(operations: EncryptedOperation[]): Promise<PushResult> {
    this.pushed = operations
    return Promise.resolve({ acceptedIds: operations.map(({ id }) => id), conflicts: [] })
  }
  pull(_ownerId: string, cursor: string | null): Promise<PullResult> {
    this.pulls += 1
    return Promise.resolve({ operations: [], cursor })
  }
}

class PullTransport extends CaptureTransport {
  constructor(private readonly result: PullResult) { super() }
  override pull(): Promise<PullResult> { this.pulls += 1; return Promise.resolve(this.result) }
}

/** Entrega em páginas, como o serviço faz quando há muita coisa para receber. */
class PaginatedTransport extends CaptureTransport {
  paginas = 0
  constructor(private readonly todas: EncryptedOperation[]) { super() }
  override pull(_ownerId: string, cursor: string | null): Promise<PullResult> {
    this.paginas += 1
    const desde = cursor ? Number(cursor) : 0
    const pagina = this.todas.slice(desde, desde + PAGE_SIZE)
    return Promise.resolve({ operations: pagina, cursor: String(desde + pagina.length), hasMore: desde + pagina.length < this.todas.length })
  }
}

/**
 * Serviço que diz ter mais página e não move o cursor. É a única forma de o
 * recebimento não terminar sozinho, e a trava precisa reconhecê-la.
 */
class TravadoTransport extends CaptureTransport {
  constructor(private readonly pagina: EncryptedOperation) { super() }
  override pull(_ownerId: string, cursor: string | null): Promise<PullResult> {
    this.pulls += 1
    return Promise.resolve({ operations: [this.pagina], cursor, hasMore: true })
  }
}

describe('sincronização cifrada', () => {
  const databases: ApoioDatabase[] = []
  afterEach(async () => {
    resetLocalDevelopmentTransport()
    await Promise.all(databases.map((database) => database.delete()))
  })

  async function fixture() {
    const database = new ApoioDatabase(`sync-test-${crypto.randomUUID()}`)
    databases.push(database)
    const accountId = crypto.randomUUID()
    const deviceId = crypto.randomUUID()
    const now = new Date().toISOString()
    await database.devices.put({ id: deviceId, accountId, label: 'Dispositivo fictício', status: 'active', createdAt: now, lastSeenAt: now })
    await database.syncState.put({ accountId, cursor: null, lastSyncedAt: null, firstSyncAt: null })
    const keys = await generateVaultKeys()
    const recordId = crypto.randomUUID()
    const plaintext = 'conteúdo fictício nunca enviado'
    const envelope = await encryptPayload(keys.master, { schemaVersion: 1, type: 'foundation_fixture', data: plaintext }, recordId)
    await new VaultRepository(database).saveEncrypted(accountId, deviceId, recordId, envelope)
    return { database, accountId, deviceId, plaintext, keys }
  }

  function toOperation(record: OutboxRecord): EncryptedOperation {
    return {
      id: record.id,
      ownerId: record.accountId,
      deviceId: record.deviceId,
      recordId: record.recordId,
      operation: record.operation,
      baseVersion: record.baseVersion,
      recordVersion: record.recordVersion,
      schemaVersion: record.schemaVersion,
      payload: record.payload,
      createdAt: record.createdAt,
    }
  }

  it('mantém a fila intacta enquanto estiver offline', async () => {
    const { database, accountId, deviceId, keys } = await fixture()
    const transport = new CaptureTransport()
    const summary = await new SyncService(transport, database, () => false).synchronize(accountId, deviceId, keys.sync)

    expect(summary.status).toBe('offline')
    expect(await database.outbox.count()).toBe(1)
    expect(transport.pushed).toHaveLength(0)
  })

  it('envia somente envelopes cifrados e remove itens confirmados', async () => {
    const { database, accountId, deviceId, plaintext, keys } = await fixture()
    const transport = new CaptureTransport()
    const summary = await new SyncService(transport, database, () => true).synchronize(accountId, deviceId, keys.sync)

    expect(summary.pushed).toBe(1)
    expect(JSON.stringify(transport.pushed)).not.toContain(plaintext)
    expect(transport.pushed[0]?.payload.ciphertext).toBeTruthy()
    expect(transport.pushed[0]?.mac).toBeTruthy()
    expect(await database.outbox.count()).toBe(0)
  })

  it('isola operações entre duas contas fictícias e mantém conteúdo pastoral fora do transporte', async () => {
    const first = await fixture()
    const second = await fixture()
    const [firstOutbox] = await first.database.outbox.toArray()
    const [secondOutbox] = await second.database.outbox.toArray()
    const transport = new LocalDevelopmentTransport()

    await transport.push([toOperation(firstOutbox!), toOperation(secondOutbox!)])
    const firstPull = await transport.pull(first.accountId, null)
    const secondPull = await transport.pull(second.accountId, null)

    expect(firstPull.operations).toHaveLength(1)
    expect(firstPull.operations[0]?.ownerId).toBe(first.accountId)
    expect(secondPull.operations).toHaveLength(1)
    expect(secondPull.operations[0]?.ownerId).toBe(second.accountId)
    expect(JSON.stringify([...firstPull.operations, ...secondPull.operations]))
      .not.toContain(first.plaintext)
    expect(Object.keys(firstPull.operations[0]!.payload).sort())
      .toEqual(['aad', 'algorithm', 'ciphertext', 'iv', 'keyVersion'])
  })

  it('impede sincronização de dispositivo revogado', async () => {
    const { database, accountId, deviceId, keys } = await fixture()
    await database.devices.update(deviceId, { status: 'revoked', revokedAt: new Date().toISOString() })

    await expect(new SyncService(new CaptureTransport(), database, () => true).synchronize(accountId, deviceId, keys.sync))
      .rejects.toThrow('não está autorizado')
  })

  it('não envia nem recebe depois que outro aparelho revogou este dispositivo', async () => {
    const { database, accountId, deviceId, keys } = await fixture()
    const transport = new CaptureTransport()
    const service = new SyncService(transport, database, () => true, () => Promise.resolve('revoked'))

    await expect(service.synchronize(accountId, deviceId, keys.sync)).rejects.toThrow('removido')

    expect(transport.pushed).toHaveLength(0)
    expect(transport.pulls).toBe(0)
    expect(await database.outbox.count()).toBe(1)
    expect((await database.devices.get(deviceId))?.status).toBe('revoked')
  })

  it('recusa sincronizar enquanto não confirma a autorização do dispositivo no serviço', async () => {
    const { database, accountId, deviceId, keys } = await fixture()
    const transport = new CaptureTransport()
    const indisponivel = () => Promise.reject(new Error('Não foi possível confirmar a autorização deste aparelho.'))
    const service = new SyncService(transport, database, () => true, indisponivel)

    await expect(service.synchronize(accountId, deviceId, keys.sync)).rejects.toThrow('confirmar a autorização')

    expect(transport.pushed).toHaveLength(0)
    expect(transport.pulls).toBe(0)
    expect(await database.outbox.count()).toBe(1)
  })

  it('segue sincronizando enquanto o serviço confirma o dispositivo ativo', async () => {
    const { database, accountId, deviceId, keys } = await fixture()
    const transport = new CaptureTransport()
    const summary = await new SyncService(transport, database, () => true, () => Promise.resolve('active')).synchronize(accountId, deviceId, keys.sync)

    expect(summary.pushed).toBe(1)
    expect(transport.pulls).toBe(1)
    expect((await database.devices.get(deviceId))?.status).toBe('active')
  })

  it('torna visível no aplicativo o registro criado em outro aparelho', async () => {
    // O aparelho que recebe não tem como saber o tipo do registro: descobri-lo
    // exigiria abrir o conteúdo cifrado, o que a sincronização não faz. Se a
    // listagem confiar só no tipo gravado, o registro chega, fica guardado e
    // nunca aparece — perda silenciosa da visão do usuário.
    const { database, accountId, deviceId, keys } = await fixture()
    const recordId = crypto.randomUUID()
    const envelope = await encryptPayload(keys.master, {
      schemaVersion: 1,
      type: 'person',
      data: { name: 'Pessoa Fictícia do Outro Aparelho', churchId: crypto.randomUUID(), status: 'active' },
    }, recordId)
    const vindaDeOutroAparelho = await withOperationMac(keys.sync, {
      id: crypto.randomUUID(),
      ownerId: accountId,
      deviceId: crypto.randomUUID(),
      recordId,
      operation: 'upsert',
      baseVersion: 0,
      recordVersion: 1,
      schemaVersion: 1,
      payload: envelope,
      createdAt: '2026-09-01T00:00:00.000Z',
    })

    const summary = await new SyncService(
      new PullTransport({ operations: [vindaDeOutroAparelho], cursor: '1' }),
      database,
      () => true,
    ).synchronize(accountId, deviceId, keys.sync)

    expect(summary.pulled).toBe(1)
    const pessoas = await new PeopleService(database).listPeople(accountId, keys.master)
    expect(pessoas.map(({ name }) => name)).toContain('Pessoa Fictícia do Outro Aparelho')
  })

  it('preserva conflito cifrado e não substitui silenciosamente a versão local', async () => {
    const { database, accountId, deviceId, plaintext, keys } = await fixture()
    const local = (await database.vaultRecords.toCollection().first())!
    const remotePayload = await encryptPayload(await generateMasterKey(), { schemaVersion: 1, type: 'foundation_fixture', data: 'outra versão fictícia' }, local.id)
    const operation = await withOperationMac(keys.sync, { id: crypto.randomUUID(), ownerId: accountId, deviceId: crypto.randomUUID(), recordId: local.id, operation: 'upsert', baseVersion: 0, recordVersion: local.version, schemaVersion: 1, payload: remotePayload, createdAt: '2026-08-02T00:00:00.000Z' })
    const summary = await new SyncService(new PullTransport({ operations: [operation], cursor: '1' }), database, () => true).synchronize(accountId, deviceId, keys.sync)
    expect(summary.conflicts).toBe(1)
    expect((await database.vaultRecords.get(local.id))?.ciphertext).toBe(local.ciphertext)
    const conflict = await database.syncConflicts.get(operation.id)
    expect(conflict?.remotePayload.ciphertext).toBe(remotePayload.ciphertext)
    expect(JSON.stringify(conflict)).not.toContain(plaintext)
    expect(JSON.stringify(conflict)).not.toContain('outra versão fictícia')
  })

  it('interrompe recebimento de operação pertencente a outra conta', async () => {
    const { database, accountId, deviceId, keys } = await fixture()
    const operation = await withOperationMac(keys.sync, { id: crypto.randomUUID(), ownerId: 'outra-conta-ficticia', deviceId, recordId: crypto.randomUUID(), operation: 'upsert', baseVersion: 0, recordVersion: 1, schemaVersion: 1, payload: await encryptPayload(await generateMasterKey(), { schemaVersion: 1, type: 'foundation_fixture', data: 'registro fictício' }, 'remote-record'), createdAt: '2026-08-02T00:00:00.000Z' })
    await expect(new SyncService(new PullTransport({ operations: [operation], cursor: '1' }), database, () => true).synchronize(accountId, deviceId, keys.sync)).rejects.toThrow('outra conta')
    expect(await database.vaultRecords.get(operation.recordId)).toBeUndefined()
  })

  it('recebe mais de dez mil operações sem parar no meio', async () => {
    // Dez mil era o teto antigo: cinquenta páginas de duzentas. A conta que
    // passasse disso recebia parte, ouvia "Dados atualizados" e era mandada
    // criar um distrito por cima do que faltava chegar.
    const { database, accountId, deviceId, keys } = await fixture()
    const envelope = await encryptPayload(keys.master, { schemaVersion: 1, type: 'foundation_fixture', data: 'ficticio' }, crypto.randomUUID())
    const mac = await signOperation(keys.sync, {
      id: 'modelo', ownerId: accountId, deviceId: 'aparelho', recordId: 'registro',
      operation: 'upsert', baseVersion: 0, recordVersion: 1, schemaVersion: 1, payload: envelope, createdAt: '2026-01-01T00:00:00.000Z',
    })
    // Assinar dez mil operações uma a uma levaria minutos sem provar nada a
    // mais: o que se prova aqui é a paginação, então elas nascem iguais e a
    // assinatura é conferida do mesmo jeito, uma por uma, ao aplicar.
    const todas: EncryptedOperation[] = Array.from({ length: 10_001 }, () => ({
      id: 'modelo', ownerId: accountId, deviceId: 'aparelho', recordId: 'registro',
      operation: 'upsert' as const, baseVersion: 0, recordVersion: 1, schemaVersion: 1,
      payload: envelope, createdAt: '2026-01-01T00:00:00.000Z', mac, macVersion: MAC_VERSION,
    }))
    const transport = new PaginatedTransport(todas)

    const summary = await new SyncService(transport, database, () => true).synchronize(accountId, deviceId, keys.sync)

    expect(transport.paginas).toBe(Math.ceil(todas.length / PAGE_SIZE))
    expect(summary.incomplete).toBe(false)
    expect((await database.syncState.get(accountId))?.cursor).toBe(String(todas.length))
    expect((await database.syncState.get(accountId))?.firstSyncAt).toBeTruthy()
  }, 60_000)

  it('recebe todas as páginas, quantas forem, antes de se declarar em dia', async () => {
    // O teto antigo eram cinquenta páginas — dez mil operações — e a rodada
    // parava ali em silêncio. Um distrito grande virava "conta vazia".
    const { database, accountId, deviceId, keys } = await fixture()
    const todas = await Promise.all(Array.from({ length: PAGE_SIZE * 3 + 7 }, async () => {
      const recordId = crypto.randomUUID()
      return withOperationMac(keys.sync, {
        id: crypto.randomUUID(), ownerId: accountId, deviceId: crypto.randomUUID(), recordId,
        operation: 'upsert' as const, baseVersion: 0, recordVersion: 1, schemaVersion: 1,
        payload: await encryptPayload(keys.master, { schemaVersion: 1, type: 'foundation_fixture', data: 'ficticio' }, recordId),
        createdAt: new Date().toISOString(),
      })
    }))
    const transport = new PaginatedTransport(todas)

    const summary = await new SyncService(transport, database, () => true).synchronize(accountId, deviceId, keys.sync)

    expect(transport.paginas).toBe(4)
    expect(summary.pulled).toBe(todas.length)
    expect(summary.incomplete).toBe(false)
    expect((await database.syncState.get(accountId))?.firstSyncAt).toBeTruthy()
  })

  it('para e avisa quando o serviço diz ter mais e não anda', async () => {
    const { database, accountId, deviceId, keys } = await fixture()
    const recordId = crypto.randomUUID()
    const pagina = await withOperationMac(keys.sync, {
      id: crypto.randomUUID(), ownerId: accountId, deviceId: crypto.randomUUID(), recordId,
      operation: 'upsert' as const, baseVersion: 0, recordVersion: 1, schemaVersion: 1,
      payload: await encryptPayload(keys.master, { schemaVersion: 1, type: 'foundation_fixture', data: 'ficticio' }, recordId),
      createdAt: new Date().toISOString(),
    })
    const transport = new TravadoTransport(pagina)

    const summary = await new SyncService(transport, database, () => true).synchronize(accountId, deviceId, keys.sync)

    expect(summary.incomplete).toBe(true)
    expect(transport.pulls).toBe(1)
  })

  it('não carimba a primeira sincronização quando a rodada não terminou', async () => {
    // `firstSyncAt` é o que autoriza acreditar em uma lista vazia. Carimbá-lo
    // numa rodada incompleta mandava o pastor criar um segundo distrito.
    const { database, accountId, deviceId, keys } = await fixture()
    const recordId = crypto.randomUUID()
    const pagina = await withOperationMac(keys.sync, {
      id: crypto.randomUUID(), ownerId: accountId, deviceId: crypto.randomUUID(), recordId,
      operation: 'upsert' as const, baseVersion: 0, recordVersion: 1, schemaVersion: 1,
      payload: await encryptPayload(keys.master, { schemaVersion: 1, type: 'foundation_fixture', data: 'ficticio' }, recordId),
      createdAt: new Date().toISOString(),
    })

    const summary = await new SyncService(new TravadoTransport(pagina), database, () => true).synchronize(accountId, deviceId, keys.sync)

    expect(summary.incomplete).toBe(true)
    expect((await database.syncState.get(accountId))?.firstSyncAt).toBeFalsy()
    expect(await firstSyncPending(accountId, database)).toBe(true)
  })

  it('não marca sincronização incompleta quando o serviço entregou tudo', async () => {
    const { database, accountId, deviceId, keys } = await fixture()

    const summary = await new SyncService(new CaptureTransport(), database, () => true).synchronize(accountId, deviceId, keys.sync)

    expect(summary.incomplete).toBe(false)
  })

  it('apaga o histórico enfileirado no serviço logo depois de enviar a lápide', async () => {
    // A ordem importa: apagar o histórico antes de a lápide subir deixaria os
    // outros aparelhos sem nunca saber da exclusão.
    const { database, accountId, deviceId, keys } = await fixture()
    const alvos = [
      { recordId: 'registro-ficticio-1', operationId: 'operacao-ficticia-1' },
      { recordId: 'registro-ficticio-2', operationId: 'operacao-ficticia-2' },
    ]
    await database.pendingActions.put({
      id: `${accountId}:purge_history`, accountId, kind: 'purge_history',
      createdAt: new Date().toISOString(), purgeTargets: alvos,
    })
    const transport = new CaptureTransport()
    const pedidos: PurgeTarget[][] = []

    await new SyncService(transport, database, () => true, () => Promise.resolve(null), (alvo) => {
      pedidos.push(alvo)
      return Promise.resolve(alvo.map(({ recordId }) => recordId))
    }).synchronize(accountId, deviceId, keys.sync)

    expect(transport.pushed).toHaveLength(1)
    expect(pedidos).toEqual([alvos])
    expect(await database.pendingActions.count()).toBe(0)
  })

  it('mantém pendente o registro que teve alteração concorrente', async () => {
    // O serviço devolve só o que apagou. O que não voltou continua na fila de
    // propósito: o expurgo não pode desaparecer em silêncio porque outro
    // aparelho mexeu no registro depois da decisão de apagar.
    const { database, accountId, deviceId, keys } = await fixture()
    await database.pendingActions.put({
      id: `${accountId}:purge_history`, accountId, kind: 'purge_history', createdAt: new Date().toISOString(),
      purgeTargets: [
        { recordId: 'registro-ficticio-1', operationId: 'operacao-ficticia-1' },
        { recordId: 'registro-ficticio-concorrente', operationId: 'operacao-ficticia-2' },
      ],
    })

    await new SyncService(new CaptureTransport(), database, () => true, () => Promise.resolve(null),
      () => Promise.resolve(['registro-ficticio-1'])).synchronize(accountId, deviceId, keys.sync)

    expect((await database.pendingActions.get(`${accountId}:purge_history`))?.purgeTargets)
      .toEqual([{ recordId: 'registro-ficticio-concorrente', operationId: 'operacao-ficticia-2' }])
  })

  it('divide o expurgo em lotes que o serviço aceita', async () => {
    const { database, accountId, deviceId, keys } = await fixture()
    const alvos = Array.from({ length: PURGE_BATCH_SIZE + 3 }, (_valor, indice) => ({
      recordId: `registro-ficticio-${indice}`, operationId: `operacao-ficticia-${indice}`,
    }))
    await database.pendingActions.put({
      id: `${accountId}:purge_history`, accountId, kind: 'purge_history',
      createdAt: new Date().toISOString(), purgeTargets: alvos,
    })
    const tamanhos: number[] = []

    await new SyncService(new CaptureTransport(), database, () => true, () => Promise.resolve(null), (lote) => {
      tamanhos.push(lote.length)
      return Promise.resolve(lote.map(({ recordId }) => recordId))
    }).synchronize(accountId, deviceId, keys.sync)

    expect(tamanhos).toEqual([PURGE_BATCH_SIZE, 3])
    expect(await database.pendingActions.count()).toBe(0)
  })

  it('sem rede, a fila de expurgo permanece para a próxima vez', async () => {
    const { database, accountId, deviceId, keys } = await fixture()
    const alvos = [{ recordId: 'registro-ficticio-1', operationId: 'operacao-ficticia-1' }]
    await database.pendingActions.put({
      id: `${accountId}:purge_history`, accountId, kind: 'purge_history',
      createdAt: new Date().toISOString(), purgeTargets: alvos,
    })

    await new SyncService(new CaptureTransport(), database, () => true, () => Promise.resolve(null), () => Promise.reject(new Error('sem rede')))
      .synchronize(accountId, deviceId, keys.sync)

    expect((await database.pendingActions.get(`${accountId}:purge_history`))?.purgeTargets).toEqual(alvos)
  })
})

/**
 * O que uma revisão adversarial tenta fazer com a sincronização: mexer nos
 * metadados que viajam em claro, mandar operação atrasada, adiantar o relógio,
 * mandar mais do que cabe em uma página e reenviar o mesmo lote.
 */
describe('sincronização sob ataque e sob condições ruins', () => {
  const databases: ApoioDatabase[] = []
  afterEach(async () => {
    resetLocalDevelopmentTransport()
    await Promise.all(databases.map((database) => database.delete()))
  })

  async function conta() {
    const database = new ApoioDatabase(`sync-adv-${crypto.randomUUID()}`)
    databases.push(database)
    const accountId = crypto.randomUUID()
    const deviceId = crypto.randomUUID()
    const now = new Date().toISOString()
    await database.devices.put({ id: deviceId, accountId, label: 'Dispositivo fictício', status: 'active', createdAt: now, lastSeenAt: now })
    await database.syncState.put({ accountId, cursor: null, lastSyncedAt: null, firstSyncAt: null })
    const keys = await generateVaultKeys()
    return { database, accountId, deviceId, keys }
  }

  async function operacaoDeOutroAparelho(accountId: string, keys: { master: CryptoKey; sync: CryptoKey }, recordId = crypto.randomUUID(), texto = 'registro fictício') {
    const payload = await encryptPayload(keys.master, { schemaVersion: 1, type: 'foundation_fixture', data: texto }, recordId)
    return withOperationMac(keys.sync, {
      id: crypto.randomUUID(), ownerId: accountId, deviceId: crypto.randomUUID(), recordId,
      operation: 'upsert', baseVersion: 0, recordVersion: 1, schemaVersion: 1, payload,
      createdAt: '2026-09-01T00:00:00.000Z',
    })
  }

  it('põe de quarentena a operação sem assinatura em vez de aplicá-la', async () => {
    const { database, accountId, deviceId, keys } = await conta()
    const operacao = await operacaoDeOutroAparelho(accountId, keys)
    const semAssinatura = { ...operacao, macVersion: 1 }
    delete semAssinatura.mac

    const summary = await new SyncService(new PullTransport({ operations: [semAssinatura], cursor: '1' }), database, () => true)
      .synchronize(accountId, deviceId, keys.sync)

    expect(summary.quarantined).toBe(1)
    expect(summary.pulled).toBe(0)
    expect(await database.vaultRecords.get(operacao.recordId)).toBeUndefined()
    expect((await database.quarantine.get(operacao.id))?.reason).toBe('assinatura')
  })

  it('recusa a gravação virada em exclusão pelo caminho', async () => {
    const { database, accountId, deviceId, keys } = await conta()
    const operacao = await operacaoDeOutroAparelho(accountId, keys)
    const adulterada = { ...operacao, operation: 'delete' as const }

    const summary = await new SyncService(new PullTransport({ operations: [adulterada], cursor: '1' }), database, () => true)
      .synchronize(accountId, deviceId, keys.sync)

    expect(summary.quarantined).toBe(1)
    expect(await database.vaultRecords.get(operacao.recordId)).toBeUndefined()
  })

  it('recusa a versão trocada para forçar sobreposição', async () => {
    const { database, accountId, deviceId, keys } = await conta()
    const operacao = await operacaoDeOutroAparelho(accountId, keys)
    const adulterada = { ...operacao, recordVersion: 99, baseVersion: 98 }

    const summary = await new SyncService(new PullTransport({ operations: [adulterada], cursor: '1' }), database, () => true)
      .synchronize(accountId, deviceId, keys.sync)

    expect(summary.quarantined).toBe(1)
    expect(await database.vaultRecords.get(operacao.recordId)).toBeUndefined()
  })

  it('recusa a operação pendurada em outra conta', async () => {
    const { database, accountId, deviceId, keys } = await conta()
    const outra = await conta()
    const operacao = await operacaoDeOutroAparelho(outra.accountId, outra.keys)
    // Chega com o dono trocado para esta conta: a assinatura da outra conta
    // não vale aqui, e a etiqueta nova não a torna válida.
    const adulterada = { ...operacao, ownerId: accountId }

    const summary = await new SyncService(new PullTransport({ operations: [adulterada], cursor: '1' }), database, () => true)
      .synchronize(accountId, deviceId, keys.sync)

    expect(summary.quarantined).toBe(1)
    expect(await database.vaultRecords.get(operacao.recordId)).toBeUndefined()
  })

  it('não sobrescreve uma edição local que ainda não foi enviada', async () => {
    const { database, accountId, deviceId, keys } = await conta()
    const recordId = crypto.randomUUID()
    const repo = new VaultRepository(database)
    const primeira = await encryptPayload(keys.master, { schemaVersion: 1, type: 'foundation_fixture', data: 'versão 1' }, recordId)
    await repo.saveEncrypted(accountId, deviceId, recordId, primeira)
    const minha = await encryptPayload(keys.master, { schemaVersion: 1, type: 'foundation_fixture', data: 'minha versão local' }, recordId)
    await repo.saveEncrypted(accountId, deviceId, recordId, minha)

    // O outro aparelho editou a partir da versão 1, sem conhecer a minha 2.
    const doOutro = await withOperationMac(keys.sync, {
      id: crypto.randomUUID(), ownerId: accountId, deviceId: crypto.randomUUID(), recordId,
      operation: 'upsert', baseVersion: 1, recordVersion: 2, schemaVersion: 1,
      payload: await encryptPayload(keys.master, { schemaVersion: 1, type: 'foundation_fixture', data: 'versão do outro aparelho' }, recordId),
      createdAt: '2026-09-01T00:00:00.000Z',
    })

    const summary = await new SyncService(new PullTransport({ operations: [doOutro], cursor: '1' }), database, () => true)
      .synchronize(accountId, deviceId, keys.sync)

    expect(summary.conflicts).toBe(1)
    const guardado = await database.vaultRecords.get(recordId)
    expect(guardado?.ciphertext).toBe(minha.ciphertext)
    expect((await database.syncConflicts.get(doOutro.id))?.remotePayload.ciphertext).toBe(doOutro.payload.ciphertext)
  })

  it('recebe todas as páginas quando há mais de quinhentas operações', async () => {
    const { database, accountId, deviceId, keys } = await conta()
    const todas: EncryptedOperation[] = []
    for (let indice = 0; indice < 520; indice += 1) {
      todas.push(await operacaoDeOutroAparelho(accountId, keys, crypto.randomUUID(), `registro fictício ${indice}`))
    }
    const transport = new PaginatedTransport(todas)

    const summary = await new SyncService(transport, database, () => true).synchronize(accountId, deviceId, keys.sync)

    expect(summary.pulled).toBe(520)
    expect(transport.paginas).toBeGreaterThan(1)
    expect(await database.vaultRecords.count()).toBe(520)
    expect((await database.syncState.get(accountId))?.cursor).toBe('520')
  }, 60_000)

  it('entrega a operação enviada com atraso e a de relógio adiantado na ordem de chegada', async () => {
    const { accountId, keys } = await conta()
    const transport = new LocalDevelopmentTransport()
    const adiantada = { ...await operacaoDeOutroAparelho(accountId, keys), createdAt: '2999-01-01T00:00:00.000Z' }
    const normal = await operacaoDeOutroAparelho(accountId, keys)
    await transport.push([adiantada, normal])
    const primeira = await transport.pull(accountId, null)
    expect(primeira.operations.map(({ id }) => id)).toEqual([adiantada.id, normal.id])

    // O aparelho que estava offline manda depois, com carimbo antigo.
    const atrasada = { ...await operacaoDeOutroAparelho(accountId, keys), createdAt: '2001-01-01T00:00:00.000Z' }
    await transport.push([atrasada])
    const depois = await transport.pull(accountId, primeira.cursor)
    expect(depois.operations.map(({ id }) => id)).toEqual([atrasada.id])
  })

  it('recomeça do início quando o cursor guardado é de um formato antigo', async () => {
    const { accountId, keys } = await conta()
    const transport = new LocalDevelopmentTransport()
    const operacao = await operacaoDeOutroAparelho(accountId, keys)
    await transport.push([operacao])

    const resultado = await transport.pull(accountId, '2026-09-01T00:00:00.000Z|alguma-coisa')

    expect(resultado.operations.map(({ id }) => id)).toEqual([operacao.id])
  })

  it('reenviar o mesmo lote não duplica nada no serviço', async () => {
    const { accountId, keys } = await conta()
    const transport = new LocalDevelopmentTransport()
    const operacao = await operacaoDeOutroAparelho(accountId, keys)

    await transport.push([operacao])
    await transport.push([operacao])

    expect((await transport.pull(accountId, null)).operations).toHaveLength(1)
  })

  it('só marca a primeira sincronização depois que ela termina', async () => {
    const { database, accountId, deviceId, keys } = await conta()
    expect(await firstSyncPending(accountId, database)).toBe(true)

    const falha = new SyncService(new CaptureTransport(), database, () => false)
    await falha.synchronize(accountId, deviceId, keys.sync)
    expect(await firstSyncPending(accountId, database)).toBe(true)

    await new SyncService(new CaptureTransport(), database, () => true).synchronize(accountId, deviceId, keys.sync)
    expect(await firstSyncPending(accountId, database)).toBe(false)
})})
