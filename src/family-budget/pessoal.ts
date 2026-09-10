import { decryptRecord, encryptPayload } from '../crypto/vault'
import { familyBudgetDb, type FamilyBudgetDatabase } from './database'
import type {
  Cartao, CartaoData, Conta, ContaData, Integrante, IntegranteData,
  Lancamento, LancamentoData, Transferencia, TransferenciaData,
} from './lancamento'
import type { Compra, CompraData } from './compras'
import type { AporteData, Aporte, Meta, MetaData, Planejamento, PlanejamentoData } from './metas'
import { alcanceDaEdicao, gerarOcorrencias, gerarParcelas, type EscopoDeEdicao, type PlanoDeParcelamento } from './series'

/**
 * O serviço das finanças pessoais no modelo novo.
 *
 * Convive com o serviço antigo em vez de substituí-lo: os registros gravados
 * até aqui continuam sendo lidos e escritos por ele, e nada é convertido às
 * escondidas. Quando a migração acontecer, ela será um passo explícito, com o
 * dado antigo preservado até que o novo esteja conferido.
 */

type TipoPessoal = 'lancamento' | 'transferencia' | 'conta' | 'cartao' | 'integrante' | 'meta' | 'aporte' | 'planejamento' | 'compra'

interface DadosPorTipo {
  lancamento: LancamentoData
  transferencia: TransferenciaData
  conta: ContaData
  cartao: CartaoData
  integrante: IntegranteData
  meta: MetaData
  aporte: AporteData
  planejamento: PlanejamentoData
  compra: CompraData
}

/** Quantas ocorrências futuras uma série gera de uma vez. */
export const OCORRENCIAS_ADIANTADAS = 12

const agora = () => new Date().toISOString()

export class FinancasPessoaisService {
  constructor(private readonly database: FamilyBudgetDatabase = familyBudgetDb) {}

  private async listar<T extends TipoPessoal>(accountId: string, masterKey: CryptoKey, tipo: T): Promise<Array<DadosPorTipo[T] & { id: string }>> {
    const registros = await this.database.records
      .where('accountId').equals(accountId)
      .filter((registro) => registro.recordType === (`pessoal_${tipo}` as never))
      .toArray()
    const abertos = await Promise.all(registros.map(async (registro) => {
      const payload = await decryptRecord(masterKey, registro)
      return payload?.type === `pessoal_${tipo}` ? { id: registro.id, ...(payload.data as DadosPorTipo[T]) } : null
    }))
    return abertos.flatMap((item) => item ? [item] : [])
  }

  private async gravar<T extends TipoPessoal>(
    accountId: string, masterKey: CryptoKey, tipo: T, dados: DadosPorTipo[T], id: string = crypto.randomUUID(),
  ): Promise<DadosPorTipo[T] & { id: string }> {
    const existente = await this.database.records.get(id)
    if (existente && existente.accountId !== accountId) throw new Error('Este registro pertence a outra conta.')
    const carimbo = agora()
    const completo = { ...dados, createdAt: dados.createdAt || carimbo, updatedAt: carimbo }
    const envelope = await encryptPayload(masterKey, { schemaVersion: 1, type: `pessoal_${tipo}`, data: completo }, id)
    await this.database.records.put({
      id, accountId, recordType: `pessoal_${tipo}` as never,
      createdAt: existente?.createdAt ?? carimbo, updatedAt: carimbo, ...envelope,
    })
    return { id, ...completo }
  }

  async apagar(accountId: string, id: string): Promise<void> {
    const registro = await this.database.records.get(id)
    if (!registro || registro.accountId !== accountId) throw new Error('Registro não encontrado.')
    await this.database.records.delete(id)
  }

  lancamentos(accountId: string, masterKey: CryptoKey): Promise<Lancamento[]> { return this.listar(accountId, masterKey, 'lancamento') }
  transferencias(accountId: string, masterKey: CryptoKey): Promise<Transferencia[]> { return this.listar(accountId, masterKey, 'transferencia') }
  contas(accountId: string, masterKey: CryptoKey): Promise<Conta[]> { return this.listar(accountId, masterKey, 'conta') }
  cartoes(accountId: string, masterKey: CryptoKey): Promise<Cartao[]> { return this.listar(accountId, masterKey, 'cartao') }
  integrantes(accountId: string, masterKey: CryptoKey): Promise<Integrante[]> { return this.listar(accountId, masterKey, 'integrante') }
  metas(accountId: string, masterKey: CryptoKey): Promise<Meta[]> { return this.listar(accountId, masterKey, 'meta') }
  aportes(accountId: string, masterKey: CryptoKey): Promise<Aporte[]> { return this.listar(accountId, masterKey, 'aporte') }
  planejamentos(accountId: string, masterKey: CryptoKey): Promise<Planejamento[]> { return this.listar(accountId, masterKey, 'planejamento') }
  compras(accountId: string, masterKey: CryptoKey): Promise<Compra[]> { return this.listar(accountId, masterKey, 'compra') }

  salvarConta(accountId: string, masterKey: CryptoKey, dados: ContaData, id?: string) { return this.gravar(accountId, masterKey, 'conta', dados, id) }
  salvarCartao(accountId: string, masterKey: CryptoKey, dados: CartaoData, id?: string) { return this.gravar(accountId, masterKey, 'cartao', dados, id) }
  salvarIntegrante(accountId: string, masterKey: CryptoKey, dados: IntegranteData, id?: string) { return this.gravar(accountId, masterKey, 'integrante', dados, id) }
  salvarTransferencia(accountId: string, masterKey: CryptoKey, dados: TransferenciaData, id?: string) { return this.gravar(accountId, masterKey, 'transferencia', dados, id) }
  salvarMeta(accountId: string, masterKey: CryptoKey, dados: MetaData, id?: string) { return this.gravar(accountId, masterKey, 'meta', dados, id) }
  salvarAporte(accountId: string, masterKey: CryptoKey, dados: AporteData, id?: string) { return this.gravar(accountId, masterKey, 'aporte', dados, id) }
  salvarPlanejamento(accountId: string, masterKey: CryptoKey, dados: PlanejamentoData, id?: string) { return this.gravar(accountId, masterKey, 'planejamento', dados, id) }
  salvarCompra(accountId: string, masterKey: CryptoKey, dados: CompraData, id?: string) { return this.gravar(accountId, masterKey, 'compra', dados, id) }

  /**
   * Grava um lançamento e, quando for o caso, a série que ele abre.
   *
   * Recorrência e parcelamento não se misturam: uma conta que se repete não
   * tem fim previsto, uma compra parcelada tem. Quem escolhe as duas ao mesmo
   * tempo está descrevendo um parcelamento, e é isso que vale.
   */
  async salvarLancamento(
    accountId: string, masterKey: CryptoKey, dados: LancamentoData,
    opcoes: { id?: string | undefined; parcelamento?: PlanoDeParcelamento | undefined } = {},
  ): Promise<Lancamento[]> {
    if (opcoes.id) return [await this.gravar(accountId, masterKey, 'lancamento', dados, opcoes.id)]

    if (opcoes.parcelamento && opcoes.parcelamento.parcelas > 1) {
      const serie = crypto.randomUUID()
      const parcelas = gerarParcelas(dados, opcoes.parcelamento, serie)
      return Promise.all(parcelas.map((parcela) => this.gravar(accountId, masterKey, 'lancamento', parcela)))
    }

    if (dados.recorrencia !== 'nenhuma') {
      const serieId = dados.serieId ?? crypto.randomUUID()
      const primeira = await this.gravar(accountId, masterKey, 'lancamento', { ...dados, serieId })
      const futuras = gerarOcorrencias({ ...dados, serieId }, OCORRENCIAS_ADIANTADAS, serieId)
      const gravadas = await Promise.all(futuras.map((ocorrencia) => this.gravar(accountId, masterKey, 'lancamento', ocorrencia)))
      return [primeira, ...gravadas]
    }

    return [await this.gravar(accountId, masterKey, 'lancamento', dados)]
  }

  /**
   * Edita uma ocorrência e, se pedido, as seguintes.
   *
   * Data e vencimento nunca são copiados para as outras: mudar o valor da
   * conta de luz de outubro não pode fazer novembro vencer em outubro.
   */
  async editarSerie(
    accountId: string, masterKey: CryptoKey, todos: readonly Lancamento[],
    alvo: Lancamento, mudancas: Partial<LancamentoData>, escopo: EscopoDeEdicao,
  ): Promise<Lancamento[]> {
    const { data: _data, vencimento: _vencimento, competencia: _competencia, ...comuns } = mudancas
    void _data; void _vencimento; void _competencia
    const alcancados = alcanceDaEdicao(todos, alvo, escopo)
    return Promise.all(alcancados.map((item) => {
      const { id, ...dados } = item
      const proprios = item.id === alvo.id ? mudancas : comuns
      return this.gravar(accountId, masterKey, 'lancamento', { ...dados, ...proprios }, id)
    }))
  }

  /** Apaga uma ocorrência, as seguintes ou a série inteira. */
  async apagarSerie(
    accountId: string, todos: readonly Lancamento[], alvo: Lancamento, escopo: EscopoDeEdicao,
  ): Promise<number> {
    const alcancados = alcanceDaEdicao(todos, alvo, escopo)
    await Promise.all(alcancados.map(({ id }) => this.apagar(accountId, id)))
    return alcancados.length
  }
}
