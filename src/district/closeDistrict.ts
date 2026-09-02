import { authorizeCurrentDevice, currentDeviceId, revokeDevice, rotateDeviceId } from '../auth/device'
import { encryptPayload, decryptPayload } from '../crypto/vault'
import { db, type ApoioDatabase } from '../db/database'
import { VaultRepository, type EncryptedMutation } from '../db/repository'
import type { VaultPayload } from '../crypto/types'
import type { VaultRecord } from '../db/types'

/**
 * O que fica é o que não pertence ao distrito: leitura e orçamento familiar
 * vivem em bancos próprios e nem são tocados aqui; da agenda, permanecem os
 * compromissos marcados como pessoais e sem igreja. Todo o resto é distrital.
 */
export function isPersonalRecord(payload: VaultPayload): boolean {
  if (payload.type !== 'agenda_event') return false
  const dados = payload.data as { category?: string; churchId?: string | null }
  return dados.category === 'personal' && !dados.churchId
}

const TYPE_LABELS: Record<string, string> = {
  district: 'Distrito', church: 'Igrejas', person: 'Pessoas', family: 'Famílias', import_batch: 'Importações',
  agenda_event: 'Agenda do distrito', sermon: 'Sermões', goal: 'Metas', goal_entry: 'Lançamentos de metas',
  goal_history: 'Resultados de anos anteriores', visit: 'Visitas', prayer_request: 'Pedidos de oração',
  follow_up: 'Acompanhamentos', task: 'Tarefas', visit_round: 'Rodadas de visitação', interest: 'Interessados',
  bible_study: 'Estudos bíblicos', missionary_pair: 'Duplas missionárias', sabbath_class: 'Escola Sabatina',
  small_group: 'Pequenos Grupos', uapg: 'UAPG', commission_config: 'Configuração de comissões',
  commission_meeting: 'Reuniões de comissão', commission_task: 'Pendências de comissão',
  nomination_process: 'Processos de nomeações', annual_goal: 'Metas do planejamento',
  evangelism_campaign: 'Campanhas de evangelismo',
}

export interface CloseDistrictPreview {
  districtRecords: number
  personalRecords: number
  /** Nomes simples do que será apagado, para o pastor conferir antes. */
  removedLabels: string[]
  devices: number
}

export interface CloseDistrictResult {
  removedRecords: number
  preservedRecords: number
  revokedDevices: number
  newDeviceId: string
}

export class CloseDistrictService {
  private readonly repository: VaultRepository
  constructor(private readonly database: ApoioDatabase = db) { this.repository = new VaultRepository(database) }

  private async classify(accountId: string, key: CryptoKey) {
    const records = await this.database.vaultRecords.where('accountId').equals(accountId).filter((record) => !record.deletedAt).toArray()
    const district: Array<{ record: VaultRecord; type: string }> = []
    let personal = 0
    for (const record of records) {
      const payload = await decryptPayload(key, record)
      if (isPersonalRecord(payload)) personal += 1
      else district.push({ record, type: payload.type })
    }
    return { district, personal }
  }

  async preview(accountId: string, key: CryptoKey): Promise<CloseDistrictPreview> {
    const { district, personal } = await this.classify(accountId, key)
    const tipos = [...new Set(district.map(({ type }) => type))]
    return {
      districtRecords: district.length,
      personalRecords: personal,
      removedLabels: tipos.map((type) => TYPE_LABELS[type] ?? 'Outros registros do distrito').sort((a, b) => a.localeCompare(b, 'pt-BR')),
      devices: await this.database.devices.where('accountId').equals(accountId).count(),
    }
  }

  /**
   * Apaga os dados do distrito e revoga as autorizações. A exclusão vira
   * operação cifrada na fila: quando a sincronização estiver ligada, os outros
   * aparelhos e o serviço remoto recebem a mesma remoção.
   */
  async close(accountId: string, key: CryptoKey): Promise<CloseDistrictResult> {
    const { district, personal } = await this.classify(accountId, key)
    const deviceId = currentDeviceId(accountId)
    const agora = new Date().toISOString()

    const mutations: EncryptedMutation[] = []
    for (const { record, type } of district) {
      mutations.push({
        recordId: record.id,
        recordType: record.recordType,
        operation: 'delete',
        envelope: await encryptPayload(key, { schemaVersion: 1, type: `${type}_tombstone`, data: { deletedAt: agora } }, record.id),
      })
    }
    if (mutations.length) await this.repository.applyEncryptedMutations(accountId, deviceId, mutations)

    const devices = await this.database.devices.where('accountId').equals(accountId).toArray()
    for (const device of devices) await revokeDevice(device.id, this.database)

    // A instalação atual continua servindo ao pastor, mas com autorização nova:
    // nada do que valia antes do encerramento volta a valer.
    const newDeviceId = rotateDeviceId(accountId)
    await authorizeCurrentDevice(accountId, this.database)

    return { removedRecords: mutations.length, preservedRecords: personal, revokedDevices: devices.length, newDeviceId }
  }
}
