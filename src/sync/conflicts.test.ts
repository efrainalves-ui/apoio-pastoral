import { afterEach, describe, expect, it } from 'vitest'
import { decryptPayload, encryptPayload, generateMasterKey } from '../crypto/vault'
import { ApoioDatabase } from '../db/database'
import { VaultRepository } from '../db/repository'
import type { SyncConflictRecord } from '../db/types'
import { ConflictService } from './conflicts'

const accountId = 'conta-ficticia-conflitos'
const deviceId = 'dispositivo-ficticio'

async function cenario() {
  const database = new ApoioDatabase(`test-${crypto.randomUUID()}`)
  const key = await generateMasterKey()
  const repository = new VaultRepository(database)
  const recordId = crypto.randomUUID()

  await repository.saveEncrypted(
    accountId, deviceId, recordId,
    await encryptPayload(key, { schemaVersion: 1, type: 'person', data: { name: 'Pessoa Fictícia do Computador' } }, recordId),
    'person',
  )

  const conflict: SyncConflictRecord = {
    id: crypto.randomUUID(),
    accountId,
    recordId,
    localVersion: 1,
    remoteVersion: 2,
    remoteOperation: 'upsert',
    remotePayload: await encryptPayload(key, { schemaVersion: 1, type: 'person', data: { name: 'Pessoa Fictícia do Celular' } }, recordId),
    createdAt: new Date().toISOString(),
    status: 'pending',
  }
  await database.syncConflicts.put(conflict)

  return { database, key, repository, recordId, conflict, service: new ConflictService(database) }
}

describe('revisão de alterações concorrentes', () => {
  const databases: ApoioDatabase[] = []
  afterEach(async () => Promise.all(databases.map((database) => database.delete())))

  it('mostra as duas versões com resumo legível, sem alterar nada', async () => {
    const { database, key, conflict, service } = await cenario()
    databases.push(database)

    const preview = await service.preview(conflict, key)

    expect(preview.kind).toBe('Pessoa')
    expect(preview.local.summary).toBe('Pessoa Fictícia do Computador')
    expect(preview.remote.summary).toBe('Pessoa Fictícia do Celular')
    expect(await database.syncConflicts.get(conflict.id)).toMatchObject({ status: 'pending' })
    expect(await database.vaultRecords.count()).toBe(1)
  })

  it('aponta quais campos diferem entre as duas versões', async () => {
    // Sem isto, quando a diferença não está no nome, as duas colunas ficam
    // visualmente iguais e a escolha do pastor vira adivinhação.
    const database = new ApoioDatabase(`test-${crypto.randomUUID()}`); databases.push(database)
    const key = await generateMasterKey()
    const repository = new VaultRepository(database)
    const recordId = crypto.randomUUID()
    const comum = { name: 'Pessoa Fictícia Igual', pastoralStatus: 'active', updatedAt: '2026-09-01T10:00:00.000Z' }

    await repository.saveEncrypted(
      accountId, deviceId, recordId,
      await encryptPayload(key, { schemaVersion: 1, type: 'person', data: { ...comum, whatsapp: '(61) 90000-0001', notes: 'Anotação deste aparelho' } }, recordId),
      'person',
    )
    const conflict: SyncConflictRecord = {
      id: crypto.randomUUID(), accountId, recordId, localVersion: 1, remoteVersion: 2,
      remoteOperation: 'upsert',
      remotePayload: await encryptPayload(key, { schemaVersion: 1, type: 'person', data: { ...comum, whatsapp: '(61) 90000-0002', notes: 'Anotação do outro aparelho', updatedAt: '2026-09-01T11:00:00.000Z' } }, recordId),
      createdAt: new Date().toISOString(), status: 'pending',
    }
    await database.syncConflicts.put(conflict)

    const preview = await new ConflictService(database).preview(conflict, key)

    const campos = preview.differences.map(({ field }) => field)
    expect(campos).toContain('WhatsApp')
    expect(campos).toContain('Observações')
    expect(campos).not.toContain('Nome')
    const whatsapp = preview.differences.find(({ field }) => field === 'WhatsApp')
    expect(whatsapp?.local).toBe('(61) 90000-0001')
    expect(whatsapp?.remote).toBe('(61) 90000-0002')
  })

  it('não expõe código interno no lugar do valor de um campo codificado', async () => {
    const database = new ApoioDatabase(`test-${crypto.randomUUID()}`); databases.push(database)
    const key = await generateMasterKey()
    const repository = new VaultRepository(database)
    const recordId = crypto.randomUUID()

    await repository.saveEncrypted(
      accountId, deviceId, recordId,
      await encryptPayload(key, { schemaVersion: 1, type: 'church', data: { name: 'Igreja Fictícia', type: 'organized_church' } }, recordId),
      'church',
    )
    const conflict: SyncConflictRecord = {
      id: crypto.randomUUID(), accountId, recordId, localVersion: 1, remoteVersion: 2,
      remoteOperation: 'upsert',
      remotePayload: await encryptPayload(key, { schemaVersion: 1, type: 'church', data: { name: 'Igreja Fictícia', type: 'preaching_point' } }, recordId),
      createdAt: new Date().toISOString(), status: 'pending',
    }
    await database.syncConflicts.put(conflict)

    const preview = await new ConflictService(database).preview(conflict, key)

    const tipo = preview.differences.find(({ field }) => field === 'Tipo')
    expect(tipo).toBeDefined()
    expect(tipo?.local).toBe('Igreja organizada')
    expect(tipo?.remote).toBe('Ponto de pregação')
    expect(JSON.stringify(preview)).not.toContain('organized_church')
    expect(JSON.stringify(preview)).not.toContain('preaching_point')
  })

  it('mantém a versão local e guarda a preterida no histórico', async () => {
    const { database, key, recordId, conflict, service } = await cenario()
    databases.push(database)

    await service.resolve(accountId, key, conflict.id, 'keep_local')

    const record = await database.vaultRecords.get(recordId)
    expect(await decryptPayload(key, record!)).toMatchObject({ data: { name: 'Pessoa Fictícia do Computador' } })
    const resolved = await database.syncConflicts.get(conflict.id)
    expect(resolved).toMatchObject({ status: 'resolved', choice: 'keep_local' })
    expect(resolved?.remotePayload.ciphertext).toBe(conflict.remotePayload.ciphertext)
  })

  it('adota a versão remota preservando a local cifrada no conflito', async () => {
    const { database, key, recordId, conflict, service } = await cenario()
    databases.push(database)
    const antes = await database.vaultRecords.get(recordId)

    await service.resolve(accountId, key, conflict.id, 'keep_remote')

    const record = await database.vaultRecords.get(recordId)
    expect(await decryptPayload(key, record!)).toMatchObject({ data: { name: 'Pessoa Fictícia do Celular' } })
    // A escolha nasce por cima da versão do outro aparelho: sem isso ela
    // voltaria como um conflito novo lá, e os dois nunca convergiriam.
    expect(record?.version).toBe(conflict.remoteVersion + 1)
    const resolved = await database.syncConflicts.get(conflict.id)
    expect(resolved?.localPayload?.ciphertext).toBe(antes?.ciphertext)
    expect(await decryptPayload(key, resolved!.localPayload!)).toMatchObject({ data: { name: 'Pessoa Fictícia do Computador' } })
  })

  it('mantém as duas versões como registros separados', async () => {
    const { database, key, recordId, conflict, service } = await cenario()
    databases.push(database)

    await service.resolve(accountId, key, conflict.id, 'keep_both')

    const resolved = await database.syncConflicts.get(conflict.id)
    expect(resolved?.keptRecordId).toBeDefined()
    expect(resolved?.keptRecordId).not.toBe(recordId)

    const original = await database.vaultRecords.get(recordId)
    const copia = await database.vaultRecords.get(resolved!.keptRecordId!)
    expect(await decryptPayload(key, original!)).toMatchObject({ data: { name: 'Pessoa Fictícia do Computador' } })
    expect(await decryptPayload(key, copia!)).toMatchObject({ data: { name: 'Pessoa Fictícia do Celular' } })
    expect(await database.vaultRecords.count()).toBe(2)
  })

  it('não resolve a mesma revisão duas vezes nem aceita conta diferente', async () => {
    const { database, key, conflict, service } = await cenario()
    databases.push(database)

    await service.resolve(accountId, key, conflict.id, 'keep_local')

    await expect(service.resolve(accountId, key, conflict.id, 'keep_remote')).rejects.toThrow('já foi resolvida')
    await expect(service.resolve('outra-conta-ficticia', key, conflict.id, 'keep_local')).rejects.toThrow('não foi encontrada')
  })

  /** O outro aparelho apagou o registro que este aqui continuou editando. */
  async function cenarioDeExclusao() {
    const base = await cenario()
    const conflict: SyncConflictRecord = {
      ...base.conflict,
      id: crypto.randomUUID(),
      remoteOperation: 'delete',
      remotePayload: await encryptPayload(base.key, { schemaVersion: 1, type: 'person_tombstone', data: { deletedAt: new Date().toISOString() } }, base.recordId),
    }
    await base.database.syncConflicts.delete(base.conflict.id)
    await base.database.syncConflicts.put(conflict)
    return { ...base, conflict }
  }

  it('aceita a exclusão feita no outro aparelho', async () => {
    // Antes não havia como aceitar: a única saída era manter a versão daqui, e
    // apagar um registro em um aparelho nunca chegava ao outro.
    const { database, key, recordId, conflict, service } = await cenarioDeExclusao()
    databases.push(database)
    await database.outbox.clear()

    await service.resolve(accountId, key, conflict.id, 'keep_remote')

    expect((await database.vaultRecords.get(recordId))?.deletedAt).toBeTruthy()
    expect(await database.syncConflicts.get(conflict.id)).toMatchObject({ status: 'resolved', choice: 'keep_remote' })
    const [enviada] = await database.outbox.toArray()
    expect(enviada).toMatchObject({ recordId, operation: 'delete', baseVersion: conflict.remoteVersion })
  })

  it('manter o registro contra a exclusão do outro aparelho o devolve para lá', async () => {
    const { database, key, recordId, conflict, service } = await cenarioDeExclusao()
    databases.push(database)
    await database.outbox.clear()

    await service.resolve(accountId, key, conflict.id, 'keep_local')

    expect((await database.vaultRecords.get(recordId))?.deletedAt).toBeUndefined()
    const [enviada] = await database.outbox.toArray()
    // Sem republicar por cima da versão do outro, ele seguiria com a exclusão
    // dele e os dois aparelhos discordariam para sempre, em silêncio.
    expect(enviada).toMatchObject({ recordId, operation: 'upsert', baseVersion: conflict.remoteVersion })
    expect(await decryptPayload(key, enviada!.payload)).toMatchObject({ data: { name: 'Pessoa Fictícia do Computador' } })
  })

  it('não oferece manter as duas quando o outro aparelho apagou o registro', async () => {
    const { database, key, conflict, service } = await cenarioDeExclusao()
    databases.push(database)

    await expect(service.resolve(accountId, key, conflict.id, 'keep_both')).rejects.toThrow('não há duas versões')
    expect(await database.syncConflicts.get(conflict.id)).toMatchObject({ status: 'pending' })
  })

  it('ficar com a versão deste aparelho a republica por cima da do outro', async () => {
    const { database, key, recordId, conflict, service } = await cenario()
    databases.push(database)
    await database.outbox.clear()

    await service.resolve(accountId, key, conflict.id, 'keep_local')

    const [enviada] = await database.outbox.toArray()
    expect(enviada).toMatchObject({ recordId, operation: 'upsert', baseVersion: conflict.remoteVersion, recordVersion: conflict.remoteVersion + 1 })
  })

  it('manter as duas também republica a versão daqui, para o outro aparelho parar de discordar', async () => {
    const { database, key, recordId, conflict, service } = await cenario()
    databases.push(database)
    await database.outbox.clear()

    await service.resolve(accountId, key, conflict.id, 'keep_both')

    const enviadas = await database.outbox.toArray()
    const original = enviadas.find((operacao) => operacao.recordId === recordId)
    expect(original).toMatchObject({ baseVersion: conflict.remoteVersion })
    expect(enviadas).toHaveLength(2)
  })

  /** Este aparelho apagou o registro; o outro mandou uma alteração dele. */
  async function cenarioDeExclusaoLocal() {
    const base = await cenario()
    await base.repository.applyEncryptedMutations(accountId, deviceId, [{
      recordId: base.recordId,
      recordType: 'person',
      operation: 'delete',
      envelope: await encryptPayload(base.key, { schemaVersion: 1, type: 'person_tombstone', data: { deletedAt: new Date().toISOString() } }, base.recordId),
    }])
    return base
  }

  it('manter a exclusão daqui publica uma lápide nova sobre a versão do outro', async () => {
    // Sem isso a exclusão local ficava presa a uma versão antiga: o outro
    // aparelho a recusaria por linhagem e o registro viveria lá e morreria
    // aqui, para sempre, sem ninguém ver.
    const { database, key, recordId, conflict, service } = await cenarioDeExclusaoLocal()
    databases.push(database)
    await database.outbox.clear()

    await service.resolve(accountId, key, conflict.id, 'keep_local')

    expect((await database.vaultRecords.get(recordId))?.deletedAt).toBeTruthy()
    const [enviada] = await database.outbox.toArray()
    expect(enviada).toMatchObject({ recordId, operation: 'delete', baseVersion: conflict.remoteVersion, recordVersion: conflict.remoteVersion + 1 })
  })

  it('trazer de volta o registro do outro aparelho ressuscita e publica por cima', async () => {
    const { database, key, recordId, conflict, service } = await cenarioDeExclusaoLocal()
    databases.push(database)
    await database.outbox.clear()

    await service.resolve(accountId, key, conflict.id, 'keep_remote')

    const registro = await database.vaultRecords.get(recordId)
    expect(registro?.deletedAt).toBeUndefined()
    expect(await decryptPayload(key, registro!)).toMatchObject({ data: { name: 'Pessoa Fictícia do Celular' } })
    const [enviada] = await database.outbox.toArray()
    expect(enviada).toMatchObject({ recordId, operation: 'upsert', baseVersion: conflict.remoteVersion })
  })

  it('a revisão diz de qual lado veio a exclusão', async () => {
    const local = await cenarioDeExclusaoLocal()
    databases.push(local.database)
    const previaLocal = await local.service.preview(local.conflict, local.key)
    expect(previaLocal).toMatchObject({ localIsDeletion: true, remoteIsDeletion: false })
    expect(previaLocal.local.summary).toContain('apagou este registro')

    const remoto = await cenarioDeExclusao()
    databases.push(remoto.database)
    const previaRemota = await remoto.service.preview(remoto.conflict, remoto.key)
    expect(previaRemota).toMatchObject({ localIsDeletion: false, remoteIsDeletion: true })
  })

  it('as duas direções convergem: o que sobe reescreve a versão do outro aparelho', async () => {
    // Convergir é isto: a operação publicada nasce da versão que o outro tem,
    // então a linhagem bate lá e a escolha do pastor entra sem novo conflito.
    for (const [direcao, montar] of [
      ['exclusão remota × alteração local', cenarioDeExclusao],
      ['exclusão local × alteração remota', cenarioDeExclusaoLocal],
    ] as const) {
      for (const escolha of ['keep_local', 'keep_remote'] as const) {
        const { database, key, conflict, service } = await montar()
        databases.push(database)
        await database.outbox.clear()

        await service.resolve(accountId, key, conflict.id, escolha)

        const [enviada] = await database.outbox.toArray()
        expect(enviada, `${direcao} / ${escolha}`).toBeDefined()
        expect(enviada!.baseVersion, `${direcao} / ${escolha}`).toBe(conflict.remoteVersion)
        expect(enviada!.recordVersion, `${direcao} / ${escolha}`).toBe(conflict.remoteVersion + 1)
      }
    }
  })
})

describe('revisões sem diferença real', () => {
  /**
   * Duas versões do mesmo registro em que só mudam campos internos.
   *
   * É o caso que apareceu no aparelho do pastor: 943 revisões em que os dois
   * lados diziam exatamente a mesma coisa — o nome idêntico dos dois lados — e
   * mudava só o carimbo que o aplicativo controla.
   */
  async function cenarioIgual() {
    const database = new ApoioDatabase(`iguais-${crypto.randomUUID()}`)
    const key = await generateMasterKey()
    const repository = new VaultRepository(database)
    const recordId = crypto.randomUUID()
    const nome = 'Pessoa Fictícia Idêntica'

    await repository.saveEncrypted(
      accountId, deviceId, recordId,
      await encryptPayload(key, { schemaVersion: 1, type: 'person', data: { name: nome, updatedAt: '2026-09-04T00:29:00.000Z' } }, recordId),
      'person',
    )

    await database.syncConflicts.put({
      id: crypto.randomUUID(), accountId, recordId,
      localVersion: 1, remoteVersion: 2, remoteOperation: 'upsert',
      remotePayload: await encryptPayload(key, { schemaVersion: 1, type: 'person', data: { name: nome, updatedAt: '2026-09-04T00:29:59.000Z' } }, recordId),
      createdAt: new Date().toISOString(), status: 'pending',
    })

    return { database, key, service: new ConflictService(database) }
  }

  it('reconhece a revisão em que não há o que decidir', async () => {
    const { database, key, service } = await cenarioIgual()
    expect(await service.contarSemDiferenca(accountId, key)).toBe(1)
    await database.delete()
  })

  /*
    Pedir um clique por revisão em que as duas versões são idênticas não é
    proteção: é transferir ao pastor um trabalho que o aplicativo sabe fazer.
  */
  it('resolve todas de uma vez', async () => {
    const { database, key, service } = await cenarioIgual()
    expect(await service.resolverSemDiferenca(accountId, key)).toBe(1)
    expect(await service.listPending(accountId)).toHaveLength(0)
    await database.delete()
  })

  /* Diferença de verdade continua sendo escolha do pastor. */
  it('não toca na revisão com diferença real', async () => {
    const { database, key, service } = await cenario()
    expect(await service.contarSemDiferenca(accountId, key)).toBe(0)
    expect(await service.resolverSemDiferenca(accountId, key)).toBe(0)
    expect(await service.listPending(accountId)).toHaveLength(1)
    await database.delete()
  })
})

describe('a diferença de fidelidade fica legível', () => {
  /*
    A leitura de fidelidade é um objeto, e objeto caía no genérico "Diferente
    nas duas versões". O pastor via que algo mudou e não via o quê — escolher
    virava adivinhação.
  */
  it('mostra categoria, meses e ano de cada leitura', async () => {
    const database = new ApoioDatabase(`fidelidade-${crypto.randomUUID()}`)
    const key = await generateMasterKey()
    const repository = new VaultRepository(database)
    const recordId = crypto.randomUUID()

    const leitura = (category: string, months: number, referenceYear: number) => ({
      category, months, referenceYear, rangeMin: months, rangeMax: months,
      precision: 'exact', updatedAt: '2026-09-04T00:29:00.000Z',
      importedAt: '2026-09-04T00:29:00.000Z', source: 'fictícia', importBatchId: 'lote-ficticio',
    })

    await repository.saveEncrypted(
      accountId, deviceId, recordId,
      await encryptPayload(key, { schemaVersion: 1, type: 'person', data: { name: 'Pessoa Fictícia', fidelity: leitura('tither', 12, 2026) } }, recordId),
      'person',
    )
    await database.syncConflicts.put({
      id: crypto.randomUUID(), accountId, recordId,
      localVersion: 1, remoteVersion: 2, remoteOperation: 'upsert',
      remotePayload: await encryptPayload(key, { schemaVersion: 1, type: 'person', data: { name: 'Pessoa Fictícia', fidelity: leitura('non_systematic_tither', 5, 2025) } }, recordId),
      createdAt: new Date().toISOString(), status: 'pending',
    })

    const service = new ConflictService(database)
    const [conflito] = await service.listPending(accountId)
    const previa = await service.preview(conflito!, key)

    const fidelidade = previa.differences.find(({ field }) => field === 'Leitura de fidelidade')
    expect(fidelidade?.local).toBe('Dizimista · 12 meses · 2026')
    expect(fidelidade?.remote).toBe('Dizimista não sistemático · 5 meses · 2025')

    // E não entra na resolução em bloco: aqui há escolha de verdade.
    expect(await service.contarSemDiferenca(accountId, key)).toBe(0)
    await database.delete()
  })
})
