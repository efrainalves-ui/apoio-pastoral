import { currentDeviceId } from '../auth/device'
import { encryptPayload } from '../crypto/vault'
import { readPayload } from '../db/corrupted'
import { db, type ApoioDatabase } from '../db/database'
import { VaultRepository } from '../db/repository'
import { inMonth } from './core'
import type {
  MileageData, MileageEntity, WorkAllowanceData, WorkAllowanceEntity, WorkBudgetRecordType,
  WorkBudgetSnapshot, WorkDataByType, WorkEntity, WorkExpenseData, WorkExpenseEntity,
} from './types'

const agora = () => new Date().toISOString()

/**
 * Os registros do orçamento do trabalho são do distrito: vivem no mesmo cofre
 * cifrado dos demais registros pastorais, sincronizam com os outros aparelhos
 * do pastor e saem no encerramento de distrito. O orçamento familiar continua
 * em banco próprio, e é isso que mantém os dois separados de verdade.
 */
export class WorkBudgetService {
  private readonly repo: VaultRepository
  constructor(private readonly database: ApoioDatabase = db) { this.repo = new VaultRepository(database) }

  private async list<T extends WorkBudgetRecordType>(
    accountId: string, key: CryptoKey, type: T,
  ): Promise<Array<WorkEntity<WorkDataByType[T]>>> {
    const records = await this.repo.list(accountId, type)
    const abertos = await Promise.all(records.map(async (record) => {
      const payload = await readPayload(key, record, this.database)
      return payload?.type === type ? ({ id: record.id, ...(payload.data as WorkDataByType[T]) }) : null
    }))
    return abertos.flatMap((item) => item ? [item] : [])
  }

  private async save<T extends WorkBudgetRecordType>(
    accountId: string, key: CryptoKey, type: T, input: WorkDataByType[T], id: string = crypto.randomUUID(),
  ): Promise<WorkEntity<WorkDataByType[T]>> {
    const anterior = (await this.list(accountId, key, type)).find((item) => item.id === id)
    const data = { ...input, createdAt: anterior?.createdAt ?? input.createdAt ?? agora(), updatedAt: agora() }
    await this.repo.saveEncrypted(accountId, currentDeviceId(accountId), id, await encryptPayload(key, { schemaVersion: 1, type, data }, id), type)
    return { id, ...data }
  }

  allowances(accountId: string, key: CryptoKey) { return this.list(accountId, key, 'work_allowance') }
  expenses(accountId: string, key: CryptoKey) { return this.list(accountId, key, 'work_expense') }
  mileage(accountId: string, key: CryptoKey) { return this.list(accountId, key, 'mileage') }

  async saveAllowance(accountId: string, key: CryptoKey, input: WorkAllowanceData, id?: string): Promise<WorkAllowanceEntity> {
    if (!input.description.trim()) throw new Error('Informe de qual auxílio se trata.')
    if (!(input.amount > 0)) throw new Error('Informe um valor maior que zero.')
    if (!input.date) throw new Error('Informe a data do auxílio.')
    return this.save(accountId, key, 'work_allowance', { ...input, description: input.description.trim(), notes: input.notes.trim() }, id)
  }

  async saveExpense(accountId: string, key: CryptoKey, input: WorkExpenseData, id?: string): Promise<WorkExpenseEntity> {
    if (!input.description.trim()) throw new Error('Informe de qual despesa se trata.')
    if (!(input.amount > 0)) throw new Error('Informe um valor maior que zero.')
    if (!input.date) throw new Error('Informe a data da despesa.')
    return this.save(accountId, key, 'work_expense', { ...input, description: input.description.trim(), notes: input.notes.trim() }, id)
  }

  async saveMileage(accountId: string, key: CryptoKey, input: MileageData, id?: string): Promise<MileageEntity> {
    if (!input.date) throw new Error('Informe a data do deslocamento.')
    if (!(input.kilometers > 0)) throw new Error('Informe quantos quilômetros foram percorridos.')
    return this.save(accountId, key, 'mileage', { ...input, reason: input.reason.trim(), notes: input.notes.trim() }, id)
  }

  /** Apaga um registro do orçamento do trabalho, publicando a lápide cifrada. */
  async remove(accountId: string, key: CryptoKey, id: string): Promise<void> {
    const record = await this.database.vaultRecords.get(id)
    if (!record || record.accountId !== accountId || record.deletedAt) throw new Error('Registro não encontrado.')
    const tombstone = await encryptPayload(key, { schemaVersion: 1, type: `${record.recordType}_tombstone`, data: { deletedAt: agora() } }, id)
    await this.repo.deleteEncrypted(accountId, currentDeviceId(accountId), id, tombstone)
  }

  /** Tudo de um mês, já filtrado, para a tela não repetir a mesma conta. */
  async snapshot(accountId: string, key: CryptoKey, month: string): Promise<WorkBudgetSnapshot> {
    const [allowances, expenses, mileage] = await Promise.all([
      this.allowances(accountId, key), this.expenses(accountId, key), this.mileage(accountId, key),
    ])
    return {
      month,
      allowances: inMonth(allowances, month).sort((a, b) => b.date.localeCompare(a.date)),
      expenses: inMonth(expenses, month).sort((a, b) => b.date.localeCompare(a.date)),
      mileage: inMonth(mileage, month).sort((a, b) => b.date.localeCompare(a.date)),
    }
  }
}
