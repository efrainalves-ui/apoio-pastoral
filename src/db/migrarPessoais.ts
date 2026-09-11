import { currentDeviceId } from '../auth/device'
import { decryptRecord, encryptPayload } from '../crypto/vault'
import { familyBudgetDb, type FamilyBudgetDatabase } from '../family-budget/database'
import { readingDb, type ReadingDatabase } from '../reading/database'
import { db, type ApoioDatabase } from './database'
import { VaultRepository, type EncryptedMutation } from './repository'
import type { VaultRecord } from './types'

/**
 * Traz para o cofre o que estava nos bancos pessoais.
 *
 * Leitura, orçamento familiar e lista de compras viviam em bancos próprios, que
 * nenhuma sincronização alcançava: o que o pastor anotava no celular não existia
 * no computador. Mudar a casa deles resolve isso — mas o que já está gravado
 * precisa atravessar, senão a atualização pareceria apagar tudo.
 *
 * Três garantias, as mesmas de toda migração deste aplicativo:
 *
 * Nada é apagado. O banco antigo continua exatamente como está, e é dele que um
 * backup gerado antes da mudança continua sendo restaurado.
 *
 * O identificador é o mesmo. Rodar de novo reescreve o mesmo registro em vez de
 * criar um segundo, e uma interrupção no meio não deixa rastro duplicado.
 *
 * O que não abre não trava a fila. Um registro ilegível neste aparelho é
 * contado e deixado para trás; parar tudo por causa dele deixaria o resto da
 * leitura e do orçamento invisíveis para sempre.
 */

/** De onde o tipo do registro no cofre é deduzido: do tipo do payload. */
const TIPO_DO_COFRE: Record<string, VaultRecord['recordType']> = {
  personal_reading_book: 'personal_reading_book',
  personal_reading_session: 'personal_reading_session',
  personal_reading_goal: 'personal_reading_goal',
  family_budget_shopping: 'personal_shopping',
  pessoal_lancamento: 'pessoal_lancamento',
  pessoal_transferencia: 'pessoal_transferencia',
  pessoal_conta: 'pessoal_conta',
  pessoal_cartao: 'pessoal_cartao',
  pessoal_integrante: 'pessoal_integrante',
  pessoal_meta: 'pessoal_meta',
  pessoal_aporte: 'pessoal_aporte',
  pessoal_planejamento: 'pessoal_planejamento',
  pessoal_compra: 'pessoal_compra',
  pessoal_migracao: 'pessoal_migracao',
}

export interface ResultadoDaMudanca {
  movidos: number
  /** Já estavam no cofre; a rodada anterior os trouxe. */
  jaEstavam: number
  /** Não abriram neste aparelho e ficaram onde estavam. */
  ilegiveis: number
}

const LOTE = 100

export class MigracaoDosPessoais {
  private readonly repo: VaultRepository
  constructor(
    private readonly database: ApoioDatabase = db,
    private readonly leitura: ReadingDatabase = readingDb,
    private readonly orcamento: FamilyBudgetDatabase = familyBudgetDb,
  ) { this.repo = new VaultRepository(database) }

  /** Quantos registros ainda esperam pela mudança. */
  async pendentes(accountId: string): Promise<number> {
    const antigos = await this.antigos(accountId)
    const noCofre = new Set((await this.database.vaultRecords.where('accountId').equals(accountId).toArray()).map(({ id }) => id))
    return antigos.filter(({ id }) => !noCofre.has(id)).length
  }

  private async antigos(accountId: string) {
    const [leitura, orcamento] = await Promise.all([
      this.leitura.records.where('accountId').equals(accountId).toArray(),
      this.orcamento.records.where('accountId').equals(accountId).toArray(),
    ])
    return [...leitura, ...orcamento]
  }

  async mover(accountId: string, masterKey: CryptoKey): Promise<ResultadoDaMudanca> {
    const antigos = await this.antigos(accountId)
    if (!antigos.length) return { movidos: 0, jaEstavam: 0, ilegiveis: 0 }

    const noCofre = new Set((await this.database.vaultRecords.where('accountId').equals(accountId).toArray()).map(({ id }) => id))
    const pendentes = antigos.filter(({ id }) => !noCofre.has(id))
    let ilegiveis = 0
    const mutations: EncryptedMutation[] = []

    for (const registro of pendentes) {
      const payload = await decryptRecord(masterKey, registro).catch(() => null)
      const recordType = payload && TIPO_DO_COFRE[payload.type]
      /*
        Sem tipo conhecido, o registro fica onde está. É o caso das entradas,
        saídas e contas do formato antigo do orçamento, que têm migração
        própria e um caminho de leitura que ainda as cobre.
      */
      if (!payload || !recordType) { ilegiveis += 1; continue }
      mutations.push({
        recordId: registro.id,
        recordType,
        envelope: await encryptPayload(masterKey, { schemaVersion: 1, type: payload.type, data: payload.data }, registro.id),
      })
    }

    const deviceId = currentDeviceId(accountId)
    for (let inicio = 0; inicio < mutations.length; inicio += LOTE) {
      await this.repo.applyEncryptedMutations(accountId, deviceId, mutations.slice(inicio, inicio + LOTE))
    }

    return { movidos: mutations.length, jaEstavam: antigos.length - pendentes.length, ilegiveis }
  }
}
