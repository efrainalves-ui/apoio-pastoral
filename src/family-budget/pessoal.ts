import { db, type ApoioDatabase } from '../db/database'
import { PersonalVaultStore } from '../db/personalVault'
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

type TipoPessoal = 'lancamento' | 'transferencia' | 'conta' | 'cartao' | 'integrante' | 'meta' | 'aporte' | 'planejamento' | 'compra' | 'migracao'

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
  migracao: MigracaoData
}

/**
 * O que já saiu do formato antigo.
 *
 * Guardar os identificadores, e não só uma data de conclusão, é o que permite
 * migrar em partes: uma interrupção no meio deixa o que passou marcado, e a
 * rodada seguinte continua de onde parou em vez de recomeçar.
 */
export interface MigracaoData {
  ids: string[]
  atualizadaEm: string
  createdAt: string
  updatedAt: string
}

/** Quantas ocorrências futuras uma série gera de uma vez. */
export const OCORRENCIAS_ADIANTADAS = 12

const agora = () => new Date().toISOString()

/*
  O orçamento pessoal vive no cofre cifrado do pastor, e não mais num banco à
  parte.

  O banco próprio garantia a separação do distrito, e cobrava um preço
  invisível: nenhuma sincronização olhava para ele, e o que era anotado no
  celular não existia no computador. A separação continua, feita pelo tipo do
  registro — `isPersonalRecord` reconhece cada um, e o encerramento de distrito
  os preserva.
*/
export class FinancasPessoaisService {
  private readonly cofre: PersonalVaultStore
  constructor(database: ApoioDatabase = db) { this.cofre = new PersonalVaultStore(database) }

  private listar<T extends TipoPessoal>(accountId: string, masterKey: CryptoKey, tipo: T): Promise<Array<DadosPorTipo[T] & { id: string }>> {
    return this.cofre.listar<DadosPorTipo[T]>(accountId, masterKey, `pessoal_${tipo}`, `pessoal_${tipo}`)
  }

  private gravar<T extends TipoPessoal>(
    accountId: string, masterKey: CryptoKey, tipo: T, dados: DadosPorTipo[T], id: string = crypto.randomUUID(),
  ): Promise<DadosPorTipo[T] & { id: string }> {
    return this.cofre.gravar(accountId, masterKey, `pessoal_${tipo}`, `pessoal_${tipo}`, dados, id)
  }

  /** Os identificadores já migrados do formato antigo. */
  async idsMigrados(accountId: string, masterKey: CryptoKey): Promise<Set<string>> {
    const registros = await this.listar(accountId, masterKey, 'migracao')
    return new Set(registros.flatMap(({ ids }) => ids))
  }

  /**
   * Migra os lançamentos do formato antigo para o novo.
   *
   * Nada é apagado: o registro antigo continua onde está. O identificador é o
   * mesmo, então rodar de novo reescreve o mesmo lançamento em vez de criar um
   * segundo — e a marca é atualizada a cada gravação, para que uma interrupção
   * no meio não faça a rodada seguinte recomeçar do zero.
   */
  async migrarAntigos(
    accountId: string, masterKey: CryptoKey,
    paraGravar: ReadonlyArray<LancamentoData & { id: string }>,
  ): Promise<number> {
    if (!paraGravar.length) return 0
    const migrados = await this.idsMigrados(accountId, masterKey)
    const marcaId = `pessoal-migracao-${accountId}`

    for (const lancamento of paraGravar) {
      const { id, ...dados } = lancamento
      await this.gravar(accountId, masterKey, 'lancamento', dados, id)
      migrados.add(id)
      await this.gravar(accountId, masterKey, 'migracao', {
        ids: [...migrados], atualizadaEm: agora(), createdAt: '', updatedAt: '',
      }, marcaId)
    }
    return paraGravar.length
  }

  /**
   * Apaga publicando a lápide cifrada.
   *
   * Precisa da chave porque o apagamento também viaja: sem lápide, o registro
   * voltaria do outro aparelho na sincronização seguinte.
   */
  async apagar(accountId: string, masterKey: CryptoKey, id: string): Promise<void> {
    await this.cofre.apagar(accountId, masterKey, id)
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
    accountId: string, masterKey: CryptoKey, todos: readonly Lancamento[], alvo: Lancamento, escopo: EscopoDeEdicao,
  ): Promise<number> {
    const alcancados = alcanceDaEdicao(todos, alvo, escopo)
    for (const { id } of alcancados) await this.apagar(accountId, masterKey, id)
    return alcancados.length
  }
}
