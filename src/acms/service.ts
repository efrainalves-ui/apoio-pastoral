import { currentDeviceId } from '../auth/device'
import { encryptPayload } from '../crypto/vault'
import { readPayload } from '../db/corrupted'
import { db, type ApoioDatabase } from '../db/database'
import { VaultRepository } from '../db/repository'
import type { AcmsPreview, AcmsReportData, AcmsReportEntity } from './types'

const agora = () => new Date().toISOString()

/** `2026-T1`. O trimestre é escolhido pelo pastor, não deduzido do arquivo. */
export function periodoValido(period: string): boolean {
  return /^\d{4}-T[1-4]$/u.test(period)
}

export function periodLabel(period: string): string {
  return periodoValido(period) ? `${period.slice(5)} de ${period.slice(0, 4)}` : period
}

export class AcmsService {
  private readonly repo: VaultRepository
  constructor(private readonly database: ApoioDatabase = db) { this.repo = new VaultRepository(database) }

  async reports(accountId: string, key: CryptoKey): Promise<AcmsReportEntity[]> {
    const records = await this.repo.list(accountId, 'acms_report')
    const abertos = await Promise.all(records.map(async (record) => {
      const payload = await readPayload(key, record, this.database)
      return payload?.type === 'acms_report' ? ({ id: record.id, ...(payload.data as AcmsReportData) }) : null
    }))
    return abertos.flatMap((item) => item ? [item] : [])
      .sort((esquerda, direita) => direita.period.localeCompare(esquerda.period))
  }

  /**
   * Guarda o que a prévia extraiu, depois de o pastor confirmar.
   *
   * Só entram os números e os nomes de igreja. O arquivo não é gravado em lugar
   * nenhum, nem aqui nem no serviço: o que sincroniza é este registro cifrado,
   * do mesmo jeito que qualquer outro registro do distrito.
   *
   * Importar o mesmo trimestre de novo substitui o anterior — dois relatórios
   * do mesmo período dobrariam os totais do distrito sem ninguém perceber.
   */
  async importPreview(accountId: string, key: CryptoKey, period: string, preview: AcmsPreview): Promise<AcmsReportEntity> {
    if (!periodoValido(period)) throw new Error('Escolha o ano e o trimestre do relatório.')
    if (!preview.rows.length) throw new Error('Não há nenhuma igreja para importar nesta planilha.')
    const anterior = (await this.reports(accountId, key)).find((item) => item.period === period)
    const id = anterior?.id ?? crypto.randomUUID()
    const data: AcmsReportData = {
      period,
      importedAt: agora(),
      sheetName: preview.sheetName,
      recognizedIndicators: preview.recognizedIndicators,
      strategicLabels: preview.strategicLabels,
      rows: preview.rows,
      createdAt: anterior?.createdAt ?? agora(),
      updatedAt: agora(),
    }
    await this.repo.saveEncrypted(accountId, currentDeviceId(accountId), id, await encryptPayload(key, { schemaVersion: 1, type: 'acms_report', data }, id), 'acms_report')
    return { id, ...data }
  }

  async remove(accountId: string, key: CryptoKey, id: string): Promise<void> {
    const record = await this.database.vaultRecords.get(id)
    if (!record || record.accountId !== accountId || record.deletedAt) throw new Error('Relatório não encontrado.')
    const tombstone = await encryptPayload(key, { schemaVersion: 1, type: 'acms_report_tombstone', data: { deletedAt: agora() } }, id)
    await this.repo.deleteEncrypted(accountId, currentDeviceId(accountId), id, tombstone)
  }
}
