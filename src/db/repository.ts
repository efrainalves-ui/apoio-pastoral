import type { CipherEnvelope } from '../crypto/types'
import { isSyncDisabled } from '../sync/config'
import { db, type ApoioDatabase } from './database'
import { registerPurgeTargets, type PurgeResult } from './purge'
import type { OutboxRecord, VaultRecord } from './types'
import type { PurgeTarget } from '../auth/supabase'

type VaultRecordType = VaultRecord['recordType']

export interface EncryptedMutation {
  recordId: string
  envelope: CipherEnvelope
  recordType: VaultRecordType
  operation?: 'upsert' | 'delete'
  /**
   * Versão do outro aparelho que esta gravação resolve.
   *
   * Existe para a revisão de alterações concorrentes. A linhagem só aceita por
   * cima o que foi feito sobre a versão que o aparelho tem; sem dizer que esta
   * gravação nasce em cima da versão remota, a escolha do pastor voltaria como
   * um conflito novo do outro lado, e os dois aparelhos ficariam para sempre
   * discordando.
   */
  supersedes?: number
}

export class VaultRepository {
  constructor(private readonly database: ApoioDatabase = db) {}

  async saveEncrypted(
    accountId: string,
    deviceId: string,
    recordId: string,
    envelope: CipherEnvelope,
    recordType: VaultRecordType = 'foundation_fixture',
  ): Promise<VaultRecord> {
    return (await this.applyEncryptedMutations(accountId, deviceId, [{ recordId, envelope, recordType }]))[0]!
  }

  /**
   * Exclusão simples de um registro que fala só de si.
   *
   * Não serve para pessoa: apagar uma pessoa exige desvincular onde ela
   * aparece junto de outras e pedir o expurgo do passado. Quem faz isso é
   * `PersonDataService.remove`, e o caminho antigo foi retirado justamente
   * para não haver dois.
   */
  async deleteEncrypted(
    accountId: string,
    deviceId: string,
    recordId: string,
    tombstone: CipherEnvelope,
  ): Promise<void> {
    const existing = await this.database.vaultRecords.get(recordId)
    if (!existing) throw new Error('Registro não encontrado.')
    await this.applyEncryptedMutations(accountId, deviceId, [{ recordId, envelope: tombstone, recordType: existing.recordType, operation: 'delete' }])
  }

  async applyEncryptedMutations(accountId: string, deviceId: string, mutations: EncryptedMutation[]): Promise<VaultRecord[]> {
    return (await this.applyEncryptedMutationsWithOperations(accountId, deviceId, mutations)).records
  }

  /**
   * O mesmo lote, devolvendo também qual operação foi criada para cada
   * registro.
   *
   * A exclusão de pessoa precisa saber exatamente disso. Antes ela tirava um
   * retrato da fila de envio, gravava, e chamava de "as minhas" todas as
   * operações que apareceram na diferença: bastava outra aba, outra tela ou o
   * próprio aplicativo enfileirar qualquer coisa no meio para o expurgo pedir
   * ao serviço que apagasse o histórico de um registro que nada tinha a ver
   * com a pessoa apagada. Aqui os identificadores saem de dentro da própria
   * gravação, e nenhuma corrida os alcança.
   */
  async applyEncryptedMutationsWithOperations(
    accountId: string,
    deviceId: string,
    mutations: EncryptedMutation[],
  ): Promise<{ records: VaultRecord[]; targets: PurgeTarget[] }> {
    return this.aplicar(accountId, deviceId, mutations, false)
  }

  /**
   * Gravação e pedido de expurgo em uma transação só.
   *
   * Entre publicar a lápide e registrar o pedido de expurgo havia uma janela:
   * fechar o navegador ali deixava a pessoa apagada da tela e o passado dela
   * inteiro na fila, nas revisões, na quarentena e no histórico do serviço,
   * sem nada pendente que fizesse alguém voltar. Agora ou as duas coisas
   * acontecem, ou nenhuma.
   */
  async applyMutationsAndQueuePurge(
    accountId: string,
    deviceId: string,
    mutations: EncryptedMutation[],
  ): Promise<{ records: VaultRecord[]; targets: PurgeTarget[]; purge: PurgeResult }> {
    return this.aplicar(accountId, deviceId, mutations, true)
  }

  private async aplicar(
    accountId: string,
    deviceId: string,
    mutations: EncryptedMutation[],
    comExpurgo: boolean,
  ): Promise<{ records: VaultRecord[]; targets: PurgeTarget[]; purge: PurgeResult }> {
    if (mutations.length === 0) return { records: [], targets: [], purge: { local: 0, queued: 0 } }
    if (new Set(mutations.map(({ recordId }) => recordId)).size !== mutations.length) throw new Error('Uma operação em lote não pode repetir o mesmo registro.')
    const existingRecords = await this.database.vaultRecords.bulkGet(mutations.map(({ recordId }) => recordId))
    const now = new Date().toISOString()
    const records: VaultRecord[] = []
    const operations: OutboxRecord[] = []

    mutations.forEach((mutation, index) => {
      const existing = existingRecords[index]
      if (existing && existing.accountId !== accountId) throw new Error('Registro pertence a outra conta.')
      if (mutation.operation === 'delete' && !existing) throw new Error('Registro não encontrado.')
      // Apagar duas vezes é engano, exceto em um caso: a revisão de alterações
      // concorrentes, em que a exclusão daqui precisa ser republicada por cima
      // da versão do outro aparelho para ele também apagar. `supersedes` é o
      // que distingue os dois — só a resolução de conflito o informa.
      if (mutation.operation === 'delete' && existing?.deletedAt && mutation.supersedes === undefined) {
        throw new Error('Registro não encontrado.')
      }
      const baseVersion = Math.max(existing?.version ?? 0, mutation.supersedes ?? 0)
      const version = baseVersion + 1
      const deletedAt = mutation.operation === 'delete' ? now : undefined
      const record: VaultRecord = {
        id: mutation.recordId,
        accountId,
        recordType: mutation.recordType,
        version,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        ...mutation.envelope,
        ...(deletedAt ? { deletedAt } : {}),
      }
      records.push(record)
      operations.push({
        id: crypto.randomUUID(),
        accountId,
        deviceId,
        recordId: mutation.recordId,
        operation: mutation.operation ?? 'upsert',
        baseVersion,
        recordVersion: version,
        payload: mutation.envelope,
        schemaVersion: 1,
        status: 'pending',
        attemptCount: 0,
        createdAt: now,
      })
    })

    const targets: PurgeTarget[] = operations.map(({ recordId, id }) => ({ recordId, operationId: id }))
    let purge: PurgeResult = { local: 0, queued: 0 }

    if (isSyncDisabled) {
      // Sem sincronização não existe fila nem histórico remoto; o expurgo local
      // continua acontecendo, pelo mesmo caminho.
      await this.database.transaction('rw', this.database.vaultRecords, this.database.outbox, this.database.syncConflicts, this.database.quarantine, this.database.pendingActions, async () => {
        await this.database.vaultRecords.bulkPut(records)
        if (comExpurgo) purge = await registerPurgeTargets(accountId, targets, this.database)
      })
      return { records, targets, purge }
    }

    await this.database.transaction('rw', this.database.vaultRecords, this.database.outbox, this.database.syncConflicts, this.database.quarantine, this.database.pendingActions, async () => {
      await this.database.vaultRecords.bulkPut(records)
      await this.database.outbox.bulkPut(operations)
      if (comExpurgo) purge = await registerPurgeTargets(accountId, targets, this.database)
    })
    return { records, targets, purge }
  }

  async list(accountId: string, recordType?: VaultRecordType): Promise<VaultRecord[]> {
    const records = await this.database.vaultRecords.where('accountId').equals(accountId).filter((record) => !record.deletedAt).toArray()
    if (!recordType) return records
    // O que chega de outro aparelho vem sem tipo: descobri-lo exigiria abrir o
    // conteúdo cifrado, e a sincronização não tem a chave — nem deve ter. Esses
    // registros entram na lista com o tipo pedido, e quem chamou os descarta ao
    // conferir o tipo do payload já decifrado. Sem isso eles ficariam guardados
    // e invisíveis, o que para o pastor é indistinguível de perda de dados.
    return records.filter((record) => record.recordType === recordType || record.recordType === 'encrypted')
  }
}
