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
