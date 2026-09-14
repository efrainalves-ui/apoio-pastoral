import type { AgendaEventEntity } from '../agenda/types'
import { currentDeviceId } from '../auth/device'
import { encryptPayload } from '../crypto/vault'
import { readPayload } from '../db/corrupted'
import { db, type ApoioDatabase } from '../db/database'
import { VaultRepository, type EncryptedMutation } from '../db/repository'
import { idDerivado } from '../shared/idDerivado'
import {
  chaveDoJaPregado, planejarJaPregado, validarDataDoJaPregado,
  type AlvoDoJaPregado, type PlanoDoJaPregado, type PregacaoAnteriorData, type PregacaoAnteriorEntity,
} from './jaPregado'

const TIPO = 'sermon_preaching'

export class JaPregadoService {
  private readonly repository: VaultRepository

  constructor(private readonly database: ApoioDatabase = db) {
    this.repository = new VaultRepository(database)
  }

  async listar(accountId: string, masterKey: CryptoKey, sermonId?: string): Promise<PregacaoAnteriorEntity[]> {
    const registros = await this.repository.list(accountId, TIPO)
    const lidos = await Promise.all(registros.map(async (record) => {
      const payload = await readPayload(masterKey, record, this.database)
      return payload?.type === TIPO ? { id: record.id, ...(payload.data as PregacaoAnteriorData) } : null
    }))
    return lidos.filter((item): item is PregacaoAnteriorEntity => Boolean(item) && (!sermonId || item!.sermonId === sermonId))
  }

  /**
   * Marca o sermão como já pregado nas igrejas pedidas.
   *
   * As que já constam no histórico ficam de fora e voltam em `jaConstam`. O
   * identificador vem do sermão e da igreja, então o mesmo pedido feito em
   * dois aparelhos não vira dois registros.
   */
  async registrar(
    accountId: string, masterKey: CryptoKey, sermonId: string, alvos: readonly AlvoDoJaPregado[], data: string, events: readonly AgendaEventEntity[],
  ): Promise<PlanoDoJaPregado> {
    validarDataDoJaPregado(data)
    const plano = planejarJaPregado(sermonId, alvos, events, await this.listar(accountId, masterKey, sermonId))
    const agora = new Date().toISOString()
    const mutacoes: EncryptedMutation[] = await Promise.all(plano.registrar.map(async (alvo) => {
      const id = await idDerivado(chaveDoJaPregado(accountId, sermonId, alvo))
      const dados: PregacaoAnteriorData = { sermonId, churchId: alvo.churchId, lugar: alvo.lugar, data, createdAt: agora, updatedAt: agora }
      return { recordId: id, recordType: TIPO, envelope: await encryptPayload(masterKey, { schemaVersion: 1, type: TIPO, data: dados }, id) }
    }))
    await this.repository.applyEncryptedMutations(accountId, currentDeviceId(accountId), mutacoes)
    return plano
  }

  async atualizar(accountId: string, masterKey: CryptoKey, id: string, mudancas: { data: string; lugar?: string }): Promise<PregacaoAnteriorEntity> {
    const atual = (await this.listar(accountId, masterKey)).find((registro) => registro.id === id)
    if (!atual) throw new Error('Registro não encontrado.')
    validarDataDoJaPregado(mudancas.data)
    const lugar = atual.churchId ? '' : (mudancas.lugar ?? atual.lugar).trim()
    if (!atual.churchId && !lugar) throw new Error('Informe o nome da igreja.')
    const { id: _id, ...resto } = atual
    void _id
    const dados: PregacaoAnteriorData = { ...resto, data: mudancas.data, lugar, updatedAt: new Date().toISOString() }
    await this.repository.saveEncrypted(accountId, currentDeviceId(accountId), id, await encryptPayload(masterKey, { schemaVersion: 1, type: TIPO, data: dados }, id), TIPO)
    return { id, ...dados }
  }

  async remover(accountId: string, masterKey: CryptoKey, id: string): Promise<void> {
    await this.repository.deleteEncrypted(accountId, currentDeviceId(accountId), id,
      await encryptPayload(masterKey, { schemaVersion: 1, type: `${TIPO}_tombstone`, data: { deletedAt: new Date().toISOString() } }, id))
  }
}
