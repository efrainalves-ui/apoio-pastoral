import { encryptPayload } from '../crypto/vault'
import { readPayload } from '../db/corrupted'
import { db, type ApoioDatabase } from '../db/database'
import type { VaultRecord } from '../db/types'

export const NEW_DISTRICT_MODES = ['empty', 'technical'] as const
export type NewDistrictMode = (typeof NEW_DISTRICT_MODES)[number]

export interface NewDistrictPreview {
  recordCount: number
  byType: Record<string, number>
  preserved: string[]
  removed: string[]
}

export interface NewDistrictResult {
  removedCount: number
  technicalHistoryId: string | null
}

const technicalSourceTypes = new Set(['goal', 'goal_entry', 'goal_history', 'sermon', 'transfer_indicators_aggregate', 'technical_history'])
const typeLabels: Record<string, string> = {
  district: 'Distrito', church: 'Igrejas', person: 'Pessoas', family: 'Famílias', import_batch: 'Importações', agenda_event: 'Agenda', sermon: 'Histórico de sermões', goal: 'Metas', goal_entry: 'Lançamentos de metas', goal_history: 'Resultados do ano anterior', visit: 'Visitas', prayer_request: 'Pedidos de oração', follow_up: 'Acompanhamentos', task: 'Tarefas', visit_round: 'Rodadas de visitação', interest: 'Interessados', bible_study: 'Estudos bíblicos', missionary_pair: 'Duplas missionárias', sabbath_class: 'Escola Sabatina', small_group: 'Pequenos Grupos', uapg: 'UAPG', transfer_indicators_aggregate: 'Indicadores agregados', technical_history: 'Histórico técnico anterior',
}

function namesFor(types: string[]): string[] {
  return types.map((type) => typeLabels[type] ?? 'Registros técnicos')
}

export class NewDistrictService {
  constructor(private readonly database: ApoioDatabase = db) {}

  /**
   * Tudo que está ativo, e a recusa quando algo não abre.
   *
   * Esta lista alimenta o apagamento. Pular em silêncio o registro que não abre
   * o deixaria sobreviver ao distrito novo — dado do distrito antigo dentro do
   * seguinte, que é justamente o que este caminho existe para impedir. E
   * apagá-lo às cegas seria apagar o que ninguém conferiu.
   *
   * Então recusa, dizendo quantos são: o pastor resolve a quarentena primeiro,
   * normalmente restaurando um backup, e só então recomeça.
   */
  private async active(accountId: string, key: CryptoKey): Promise<Array<{ record: VaultRecord; type: string }>> {
    const records = await this.database.vaultRecords.where('accountId').equals(accountId).filter((record) => !record.deletedAt).toArray()
    const abertos = await Promise.all(records.map(async (record) => {
      const payload = await readPayload(key, record, this.database)
      return payload ? { record, type: payload.type } : null
    }))
    const ilegiveis = abertos.filter((item) => item === null).length
    if (ilegiveis > 0) {
      throw new Error(`${ilegiveis} registro(s) não abriram neste aparelho. Comece um distrito novo apenas quando todos abrirem — restaurar um backup costuma resolver.`)
    }
    return abertos.flatMap((item) => item ? [item] : [])
  }

  async preview(accountId: string, key: CryptoKey, mode: NewDistrictMode): Promise<NewDistrictPreview> {
    const records = await this.active(accountId, key)
    const byType = records.reduce<Record<string, number>>((counts, { type }) => ({ ...counts, [type]: (counts[type] ?? 0) + 1 }), {})
    const presentTypes = Object.keys(byType)
    return {
      recordCount: records.length,
      byType,
      preserved: mode === 'technical' && presentTypes.some((type) => technicalSourceTypes.has(type)) ? ['Resumo técnico agregado, sem nomes, contatos ou conteúdo dos registros atuais.'] : ['Nenhum dado do distrito atual.'],
      removed: namesFor(presentTypes),
    }
  }

  async start(accountId: string, key: CryptoKey, mode: NewDistrictMode): Promise<NewDistrictResult> {
    const active = await this.active(accountId, key)
    const allRecords = await this.database.vaultRecords.where('accountId').equals(accountId).toArray()
    const counts = active.reduce<Record<string, number>>((result, { type }) => ({ ...result, [type]: (result[type] ?? 0) + 1 }), {})
    const now = new Date().toISOString()
    const technicalHistoryId = mode === 'technical' ? crypto.randomUUID() : null
    const technicalEnvelope = technicalHistoryId ? await encryptPayload(key, {
      schemaVersion: 1,
      type: 'technical_history',
      data: { transitionedAt: now, recordCounts: Object.fromEntries(Object.entries(counts).filter(([type]) => technicalSourceTypes.has(type))) },
    }, technicalHistoryId) : null

    await this.database.transaction('rw', this.database.vaultRecords, this.database.outbox, async () => {
      await this.database.vaultRecords.bulkDelete(allRecords.map((record) => record.id))
      await this.database.outbox.where('accountId').equals(accountId).delete()
      if (technicalHistoryId && technicalEnvelope) {
        await this.database.vaultRecords.put({ id: technicalHistoryId, accountId, recordType: 'encrypted', version: 1, createdAt: now, updatedAt: now, ...technicalEnvelope })
      }
    })
    return { removedCount: allRecords.length, technicalHistoryId }
  }
}
