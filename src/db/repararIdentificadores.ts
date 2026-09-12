import { currentDeviceId } from '../auth/device'
import { encryptPayload } from '../crypto/vault'
import { readPayload } from './corrupted'
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
 * O conteúdo é preservado, e **recifrado** sob o identificador novo. Isso não é
 * detalhe: o AAD amarra o texto cifrado ao identificador do registro, e copiar
 * o envelope para outro id produziria exatamente o defeito que ele existe para
 * impedir — "Registro não confere com o conteúdo guardado". Mover exige a
 * chave; sem ela não há reparo honesto, só um registro ilegível a mais.
 *
 * O registro torto e as operações dele são apagados do aparelho — nunca
 * chegaram ao serviço, então não há o que anunciar lá.
 */
export interface ResultadoDoReparo {
  reparados: number
  operacoesDescartadas: number
  /** Não abriram neste aparelho e ficaram onde estavam, intactos. */
  ilegiveis: number
}

export class ReparoDeIdentificadores {
  private readonly repo: VaultRepository
  constructor(private readonly database: ApoioDatabase = db) { this.repo = new VaultRepository(database) }

  async reparar(accountId: string, masterKey: CryptoKey): Promise<ResultadoDoReparo> {
    const registros = await this.database.vaultRecords.where('accountId').equals(accountId).toArray()
    const tortos = registros.filter(({ id }) => !ehUuid(id))
    if (!tortos.length) return { reparados: 0, operacoesDescartadas: 0, ilegiveis: 0 }

    const deviceId = currentDeviceId(accountId)
    let descartadas = 0
    let reparados = 0
    let ilegiveis = 0

    for (const torto of tortos) {
      const payload = await readPayload(masterKey, torto, this.database)
      /*
        Um registro que não abre fica exatamente onde está. Movê-lo às cegas
        produziria um registro ilegível sob um identificador novo, e aí nem o
        original sobraria para tentar de novo em outro aparelho.
      */
      if (!payload) { ilegiveis += 1; continue }

      const novoId = crypto.randomUUID()
      await this.repo.saveEncrypted(
        accountId, deviceId, novoId,
        await encryptPayload(masterKey, payload, novoId),
        torto.recordType,
      )

      const presas = await this.database.outbox.where('recordId').equals(torto.id).toArray()
      descartadas += presas.length
      await this.database.outbox.bulkDelete(presas.map(({ id }) => id))
      await this.database.vaultRecords.delete(torto.id)
      reparados += 1
    }

    return { reparados, operacoesDescartadas: descartadas, ilegiveis }
  }
}
