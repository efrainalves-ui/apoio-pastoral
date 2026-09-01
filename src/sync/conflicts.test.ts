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
    expect(tipo?.local).toBeNull()
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
    expect(record?.version).toBe(2)
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
})
