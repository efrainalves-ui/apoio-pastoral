import { currentDeviceId } from '../auth/device'
import { encryptPayload } from '../crypto/vault'
import { readPayload } from '../db/corrupted'
import { db, type ApoioDatabase } from '../db/database'
import { VaultRepository } from '../db/repository'
import { normalizarLegado } from './detalhes'
import type { AgendaEventData } from './types'

export interface ResultadoDaMigracaoPgp { migrados: number; ilegiveis: number }

/**
 * PGP deixa de ser tipo e vira subtipo de Concílio.
 *
 * As mesmas garantias de toda migração deste aplicativo:
 *
 * Nada é apagado. O compromisso é regravado com o mesmo identificador, e a
 * sincronização leva a nova versão como qualquer edição — com o histórico de
 * versões preservado.
 *
 * Rodar de novo não faz nada. Só se regrava o que ainda está como `pgp`; o que
 * já virou Concílio não é tocado.
 *
 * O que não abre não trava a fila. Um registro ilegível neste aparelho é
 * contado e deixado como está — e, se abrir mais tarde, a leitura já o
 * apresenta como Concílio mesmo antes de ser regravado.
 */
export class MigracaoPgpParaConcilio {
  private readonly repository: VaultRepository
  constructor(private readonly database: ApoioDatabase = db) { this.repository = new VaultRepository(database) }

  async migrar(accountId: string, masterKey: CryptoKey): Promise<ResultadoDaMigracaoPgp> {
    let migrados = 0
    let ilegiveis = 0
    for (const record of await this.repository.list(accountId, 'agenda_event')) {
      const payload = await readPayload(masterKey, record, this.database)
      if (!payload) { ilegiveis += 1; continue }
      if (payload.type !== 'agenda_event') continue
      const data = payload.data as AgendaEventData
      if (data.category !== 'pgp') continue
      const migrado = { ...normalizarLegado(data), updatedAt: new Date().toISOString() }
      const envelope = await encryptPayload(masterKey, { schemaVersion: 1, type: 'agenda_event', data: migrado }, record.id)
      await this.repository.saveEncrypted(accountId, currentDeviceId(accountId), record.id, envelope, 'agenda_event')
      migrados += 1
    }
    return { migrados, ilegiveis }
  }
}
