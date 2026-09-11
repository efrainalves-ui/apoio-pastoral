import { currentDeviceId } from '../auth/device'
import { encryptPayload } from '../crypto/vault'
import { readPayload } from './corrupted'
import { db, type ApoioDatabase } from './database'
import { VaultRepository, type EncryptedMutation } from './repository'
import type { VaultRecord } from './types'

type VaultRecordType = VaultRecord['recordType']

/**
 * O cofre das coisas pessoais.
 *
 * Leitura, orçamento familiar e lista de compras viviam em bancos próprios, e
 * era isso que os mantinha separados do distrito. O preço era alto e invisível:
 * nenhuma sincronização olha para esses bancos, então o que o pastor anotava no
 * celular não existia no computador — e não havia aviso nenhum dizendo isso.
 *
 * Agora eles moram no mesmo cofre cifrado dos demais registros e andam pelos
 * mesmos trilhos. A separação continua inteira, só que pelo **tipo do
 * registro** e não pelo banco: `isPersonalRecord` reconhece cada um deles, e o
 * encerramento de distrito os preserva quando tudo o mais é apagado.
 *
 * O serviço remoto não sabe de nada disso. A tabela de operações guarda
 * ciphertext e não tem coluna de tipo — o que viaja continua sendo um envelope
 * que só o aparelho do pastor abre.
 */
export class PersonalVaultStore {
  private readonly repo: VaultRepository
  constructor(private readonly database: ApoioDatabase = db) { this.repo = new VaultRepository(database) }

  private agora() { return new Date().toISOString() }

  /**
   * Os registros de um tipo, já abertos.
   *
   * O que chega de outro aparelho vem marcado como `encrypted`, porque a
   * sincronização não tem a chave para saber o que é. `VaultRepository.list`
   * devolve esses junto, e é a conferência do tipo do payload que separa o
   * que é deste tipo do que é de outro.
   */
  async listar<T>(accountId: string, key: CryptoKey, recordType: VaultRecordType, payloadType: string): Promise<Array<T & { id: string }>> {
    const records = await this.repo.list(accountId, recordType)
    const abertos = await Promise.all(records.map(async (record) => {
      const payload = await readPayload(key, record, this.database)
      return payload?.type === payloadType ? ({ id: record.id, ...(payload.data as T) }) : null
    }))
    return abertos.flatMap((item) => item ? [item] : [])
  }

  async gravar<T extends { createdAt: string; updatedAt: string }>(
    accountId: string, key: CryptoKey, recordType: VaultRecordType, payloadType: string,
    input: T, id: string = crypto.randomUUID(),
  ): Promise<T & { id: string }> {
    const existente = await this.database.vaultRecords.get(id)
    if (existente && existente.accountId !== accountId) throw new Error('Este registro pertence a outra conta.')
    const carimbo = this.agora()
    const data = { ...input, createdAt: input.createdAt || carimbo, updatedAt: carimbo }
    await this.repo.saveEncrypted(
      accountId, currentDeviceId(accountId), id,
      await encryptPayload(key, { schemaVersion: 1, type: payloadType, data }, id), recordType,
    )
    return { id, ...data }
  }

  /**
   * Vários registros numa transação só.
   *
   * A leitura precisa disto: registrar uma sessão também avança o livro, e os
   * dois têm de entrar juntos — metade disso gravada deixaria o livro dizendo
   * uma coisa e o histórico outra.
   */
  async gravarVarios(
    accountId: string, key: CryptoKey,
    itens: ReadonlyArray<{ recordType: VaultRecordType; payloadType: string; id: string; data: { createdAt: string; updatedAt: string } }>,
  ): Promise<void> {
    const carimbo = this.agora()
    const mutations: EncryptedMutation[] = await Promise.all(itens.map(async (item) => ({
      recordId: item.id,
      recordType: item.recordType,
      envelope: await encryptPayload(key, {
        schemaVersion: 1, type: item.payloadType,
        data: { ...item.data, createdAt: item.data.createdAt || carimbo, updatedAt: carimbo },
      }, item.id),
    })))
    await this.repo.applyEncryptedMutations(accountId, currentDeviceId(accountId), mutations)
  }

  /** Apaga publicando a lápide cifrada, para o apagamento viajar como o resto. */
  async apagar(accountId: string, key: CryptoKey, id: string): Promise<void> {
    const record = await this.database.vaultRecords.get(id)
    if (!record || record.accountId !== accountId || record.deletedAt) throw new Error('Registro não encontrado.')
    const tombstone = await encryptPayload(key, { schemaVersion: 1, type: `${record.recordType}_tombstone`, data: { deletedAt: this.agora() } }, id)
    await this.repo.deleteEncrypted(accountId, currentDeviceId(accountId), id, tombstone)
  }

  async apagarVarios(accountId: string, key: CryptoKey, ids: readonly string[]): Promise<void> {
    for (const id of ids) await this.apagar(accountId, key, id)
  }
}
