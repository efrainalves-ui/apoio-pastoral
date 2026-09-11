import { currentDeviceId } from '../auth/device'
import { db, type ApoioDatabase } from './database'
import { ehUuid } from './identificadores'
import { VaultRepository } from './repository'

/**
 * Tira da frente os registros com identificador que o serviço recusa.
 *
 * O serviço converte `record_id` para `uuid` ao receber uma operação. Um
 * identificador fabricado — como `work-config-<conta>`, que este aplicativo
 * chegou a criar — não passa nessa conversão, e a conversão que falha **derruba
 * o lote inteiro**: um registro malformado bastava para nada mais sair do
 * aparelho, nem o que não tinha defeito nenhum. Era o orçamento e a leitura do
 * pastor parados atrás de um único registro torto.
 *
 * O conteúdo é preservado: ele é regravado sob um identificador válido, que
 * entra na fila normalmente. O registro torto e as operações dele são apagados
 * do aparelho — nunca chegaram ao serviço, então não há o que anunciar lá.
 */
export interface ResultadoDoReparo {
  reparados: number
  operacoesDescartadas: number
}

export class ReparoDeIdentificadores {
  private readonly repo: VaultRepository
  constructor(private readonly database: ApoioDatabase = db) { this.repo = new VaultRepository(database) }

  async reparar(accountId: string): Promise<ResultadoDoReparo> {
    const registros = await this.database.vaultRecords.where('accountId').equals(accountId).toArray()
    const tortos = registros.filter(({ id }) => !ehUuid(id))
    if (!tortos.length) return { reparados: 0, operacoesDescartadas: 0 }

    const deviceId = currentDeviceId(accountId)
    let descartadas = 0

    for (const torto of tortos) {
      /*
        O envelope viaja como está: o conteúdo é o mesmo, e reabri-lo exigiria a
        chave — que este reparo não precisa ter.
      */
      await this.repo.saveEncrypted(
        accountId, deviceId, crypto.randomUUID(),
        { ciphertext: torto.ciphertext, iv: torto.iv, aad: torto.aad, keyVersion: torto.keyVersion, algorithm: torto.algorithm },
        torto.recordType,
      )

      const presas = await this.database.outbox.where('recordId').equals(torto.id).toArray()
      descartadas += presas.length
      await this.database.outbox.bulkDelete(presas.map(({ id }) => id))
      await this.database.vaultRecords.delete(torto.id)
    }

    return { reparados: tortos.length, operacoesDescartadas: descartadas }
  }
}
