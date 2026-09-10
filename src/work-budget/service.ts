import { currentDeviceId } from '../auth/device'
import { encryptPayload } from '../crypto/vault'
import { readPayload } from '../db/corrupted'
import { db, type ApoioDatabase } from '../db/database'
import { VaultRepository } from '../db/repository'
import { inMonth } from './core'
import type {
  MileageData, MileageEntity, WorkAllowanceData, WorkAllowanceEntity, WorkAnyDataByType,
  WorkBudgetAnyRecordType, WorkBudgetSnapshot, WorkEntity, WorkExpenseData, WorkExpenseEntity,
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

  private async list<T extends WorkBudgetAnyRecordType>(
    accountId: string, key: CryptoKey, type: T,
  ): Promise<Array<WorkEntity<WorkAnyDataByType[T]>>> {
    const records = await this.repo.list(accountId, type)
    const abertos = await Promise.all(records.map(async (record) => {
      const payload = await readPayload(key, record, this.database)
      return payload?.type === type ? ({ id: record.id, ...(payload.data as WorkAnyDataByType[T]) }) : null
    }))
    return abertos.flatMap((item) => item ? [item] : [])
  }

  private async save<T extends WorkBudgetAnyRecordType>(
    accountId: string, key: CryptoKey, type: T, input: WorkAnyDataByType[T], id: string = crypto.randomUUID(),
  ): Promise<WorkEntity<WorkAnyDataByType[T]>> {
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

  /*
    Daqui para baixo, o modelo novo.

    Ele não substitui os auxílios, despesas e quilometragem acima: registro já
    cifrado no aparelho do pastor não se converte por conta de uma versão nova.
    Os dois convivem, e a tela mostra os dois.
  */

  /**
   * A configuração do obreiro, que é uma só.
   *
   * O identificador é fixo em vez de sorteado para que dois aparelhos que
   * salvem a configuração ao mesmo tempo escrevam no mesmo registro. Com id
   * novo a cada vez, o pastor acabaria com duas configurações e nenhuma pista
   * de qual delas vale.
   */
  async configuracao(accountId: string, key: CryptoKey): Promise<WorkEntity<WorkAnyDataByType['work_config']> | null> {
    const encontradas = await this.list(accountId, key, 'work_config')
    return encontradas[0] ?? null
  }

  async salvarConfiguracao(accountId: string, key: CryptoKey, input: WorkAnyDataByType['work_config']) {
    const atual = await this.configuracao(accountId, key)
    return this.save(accountId, key, 'work_config', input, atual?.id ?? `work-config-${accountId}`)
  }

  dependentes(accountId: string, key: CryptoKey) { return this.list(accountId, key, 'work_dependent') }

  async salvarDependente(accountId: string, key: CryptoKey, input: WorkAnyDataByType['work_dependent'], id?: string) {
    if (!input.nome.trim()) throw new Error('Informe o nome do dependente.')
    return this.save(accountId, key, 'work_dependent', { ...input, nome: input.nome.trim() }, id)
  }

  lancamentos(accountId: string, key: CryptoKey) { return this.list(accountId, key, 'work_entry') }

  async salvarLancamento(accountId: string, key: CryptoKey, input: WorkAnyDataByType['work_entry'], id?: string) {
    if (!input.subcategoriaId) throw new Error('Escolha a categoria do lançamento.')
    if (!input.data) throw new Error('Informe a data.')
    if (!(input.valorPago > 0)) throw new Error('Informe um valor maior que zero.')
    return this.save(accountId, key, 'work_entry', {
      ...input, descricao: input.descricao.trim(), observacao: input.observacao.trim(),
    }, id)
  }

  orcamentosLetra(accountId: string, key: CryptoKey) { return this.list(accountId, key, 'letra_budget') }
  itensLetra(accountId: string, key: CryptoKey) { return this.list(accountId, key, 'letra_item') }
  aquisicoesLetra(accountId: string, key: CryptoKey) { return this.list(accountId, key, 'letra_acquisition') }

  async salvarOrcamentoLetra(accountId: string, key: CryptoKey, input: WorkAnyDataByType['letra_budget'], id?: string) {
    if (!/^\d{4}$/u.test(input.ano)) throw new Error('Informe o ano do orçamento.')
    if (input.reservaDeLivros > input.total) throw new Error('A reserva de livros não pode passar do total do ano.')
    return this.save(accountId, key, 'letra_budget', input, id)
  }

  async salvarItemLetra(accountId: string, key: CryptoKey, input: WorkAnyDataByType['letra_item'], id?: string) {
    if (!input.nome.trim()) throw new Error('Informe o nome do item.')
    return this.save(accountId, key, 'letra_item', { ...input, nome: input.nome.trim() }, id)
  }

  async salvarAquisicaoLetra(accountId: string, key: CryptoKey, input: WorkAnyDataByType['letra_acquisition'], id?: string) {
    if (!input.itemId) throw new Error('Escolha o item adquirido.')
    if (!input.data) throw new Error('Informe a data da aquisição.')
    if (!(input.valor > 0)) throw new Error('Informe um valor maior que zero.')
    return this.save(accountId, key, 'letra_acquisition', { ...input, descricao: input.descricao.trim() }, id)
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
