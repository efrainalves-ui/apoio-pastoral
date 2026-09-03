import { authorizeCurrentDevice, currentDeviceId, revokeDevice, rotateDeviceId } from '../auth/device'
import { fetchRemoteDevices, revokeAllRemoteDevices, type RemoteDevice } from '../auth/supabase'
import { encryptPayload, decryptPayload } from '../crypto/vault'
import { db, type ApoioDatabase } from '../db/database'
import { VaultRepository, type EncryptedMutation } from '../db/repository'
import type { VaultPayload } from '../crypto/types'
import { pendingActionId, type VaultRecord } from '../db/types'

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

/**
 * O servidor é quem conhece os aparelhos da conta: cada instalação guarda só a
 * si mesma. Estas duas dependências entram pelo construtor para o encerramento
 * poder ser provado com aparelhos que este aplicativo nunca viu.
 */
export interface CloseDistrictRemote {
  listDevices: () => Promise<RemoteDevice[] | null>
  revokeAll: () => Promise<number | null>
}

export class CloseDistrictService {
  private readonly repository: VaultRepository

  constructor(
    private readonly database: ApoioDatabase = db,
    private readonly remote: CloseDistrictRemote = { listDevices: fetchRemoteDevices, revokeAll: revokeAllRemoteDevices },
  ) { this.repository = new VaultRepository(database) }

  /**
   * Quantos aparelhos a conta tem, segundo quem sabe. Sem serviço remoto vale
   * o que este aparelho conhece, que no desenvolvimento local é tudo que há.
   */
  private async contarAparelhos(accountId: string): Promise<number> {
    const locais = await this.database.devices.where('accountId').equals(accountId).count()
    try {
      const remotos = await this.remote.listDevices()
      if (!remotos) return locais
      return remotos.filter(({ status }) => status !== 'revoked').length
    } catch {
      return locais
    }
  }

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
      devices: await this.contarAparelhos(accountId),
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

    // A partir daqui existe um instante em que este aparelho não tem autorização
    // nenhuma: os antigos já foram revogados e o novo ainda não nasceu. Fechar o
    // navegador aí deixava a conta abrindo neste aparelho e sem entrar mais no
    // serviço, sem nada na tela explicando. A marca abaixo é o que permite
    // retomar, e só sai quando a autorização nova está de pé.
    await this.database.pendingActions.put({
      id: pendingActionId(accountId, 'close_district'),
      accountId,
      kind: 'close_district',
      createdAt: agora,
      stage: 'revoking',
    })

    // Quem revoga é o servidor, de uma vez só. Percorrer a lista local revogava
    // apenas este aparelho — cada instalação guarda somente a si mesma —, e os
    // outros continuavam sincronizando um distrito que o pastor acabara de
    // encerrar. Sem serviço remoto sobra a lista local, que ali é tudo que há.
    const locais = await this.database.devices.where('accountId').equals(accountId).toArray()
    const revogadosNoServico = await this.remote.revokeAll()
    if (revogadosNoServico === null) {
      // Os outros primeiro, este por último: revogar a si mesmo antes tiraria a
      // autorização necessária para revogar os que sobraram.
      for (const device of locais.filter(({ id }) => id !== deviceId)) await revokeDevice(device.id, this.database)
      if (locais.some(({ id }) => id === deviceId)) await revokeDevice(deviceId, this.database)
    } else {
      const agoraRevogado = new Date().toISOString()
      await this.database.devices.bulkPut(locais.map((device) => ({ ...device, status: 'revoked' as const, revokedAt: agoraRevogado })))
    }

    await this.database.pendingActions.update(pendingActionId(accountId, 'close_district'), { stage: 'reauthorizing' })

    // A instalação atual continua servindo ao pastor, mas com autorização nova:
    // nada do que valia antes do encerramento volta a valer.
    const newDeviceId = rotateDeviceId(accountId)
    await authorizeCurrentDevice(accountId, this.database)
    await this.database.pendingActions.delete(pendingActionId(accountId, 'close_district'))

    return {
      removedRecords: mutations.length,
      preservedRecords: personal,
      revokedDevices: revogadosNoServico ?? locais.length,
      newDeviceId,
    }
  }
}

/** Encerramento que começou e não terminou nesta instalação. */
export async function pendingDistrictClosure(accountId: string, database: ApoioDatabase = db): Promise<boolean> {
  return Boolean(await database.pendingActions.get(pendingActionId(accountId, 'close_district')))
}

/**
 * Termina um encerramento interrompido: garante a revogação e devolve a este
 * aparelho uma autorização nova.
 *
 * É idempotente de propósito, porque não dá para saber onde exatamente parou.
 * A revogação no servidor acontece em uma transação só — ou valeu inteira, ou
 * não valeu —, então repeti-la é seguro: se o aparelho já está revogado, o
 * serviço recusa e o que falta é justamente a autorização nova.
 */
export async function resumeDistrictClosure(
  accountId: string,
  database: ApoioDatabase = db,
  revokeAll: () => Promise<number | null> = revokeAllRemoteDevices,
): Promise<{ newDeviceId: string }> {
  const marca = await database.pendingActions.get(pendingActionId(accountId, 'close_district'))
  if (!marca) throw new Error('Não há encerramento pendente nesta conta.')

  if (marca.stage === 'revoking') {
    try {
      await revokeAll()
    } catch {
      // Este aparelho já não tem autorização para revogar, o que só acontece
      // quando a revogação anterior valeu. Seguir para a autorização nova.
    }
    const agora = new Date().toISOString()
    const locais = await database.devices.where('accountId').equals(accountId).toArray()
    await database.devices.bulkPut(locais.map((device) => ({ ...device, status: 'revoked' as const, revokedAt: device.revokedAt ?? agora })))
    await database.pendingActions.update(marca.id, { stage: 'reauthorizing' })
  }

  const newDeviceId = rotateDeviceId(accountId)
  await authorizeCurrentDevice(accountId, database)
  await database.pendingActions.delete(marca.id)
  return { newDeviceId }
}
