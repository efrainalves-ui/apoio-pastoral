import { currentDeviceId } from '../auth/device'
import { encryptPayload } from '../crypto/vault'
import { readPayload } from '../db/corrupted'
import { db, type ApoioDatabase } from '../db/database'
import { VaultRepository } from '../db/repository'
import { indicadorPorId, type IndicadorDoRelatorio } from './catalogo'
import { compararTrimestres, type RelatorioIntegradoData, type RelatorioIntegradoEntity, type ValorDoIndicador } from './types'

/** O número que um valor representa, quando ele representa um. */
export function numeroDoValor(valor: ValorDoIndicador | undefined): number | null {
  if (!valor) return null
  if (valor.tipo === 'numero') return valor.valor
  if (valor.tipo === 'por_classe') return valor.total
  if (valor.tipo === 'por_sabado') {
    const partes = [valor.segundo, valor.setimo].filter((parte): parte is number => parte !== null)
    return partes.length ? partes.reduce((soma, parte) => soma + parte, 0) : null
  }
  return null
}

/** O mesmo valor com outro número, quando o pastor corrige o que o papel dizia. */
export function comNumero(valor: ValorDoIndicador, novo: number): ValorDoIndicador {
  if (valor.tipo === 'numero') return { tipo: 'numero', valor: novo }
  if (valor.tipo === 'por_sabado') return { tipo: 'por_sabado', segundo: novo, setimo: null }
  if (valor.tipo === 'por_classe') return { tipo: 'por_classe', classes: {}, total: novo }
  return valor
}

export interface LeituraDoIndicador {
  trimestre: string
  valor: ValorDoIndicador
}

/**
 * O valor que vale hoje para uma igreja, e de qual trimestre ele veio.
 *
 * Um trimestre sem resposta não apaga o anterior: a igreja que não entregou o
 * relatório do segundo trimestre não passou a ter zero Pequenos Grupos, ela
 * passou a não ter dito quantos tem. Então vale a resposta mais recente que
 * existiu, e a tela mostra de quando ela é.
 */
export function valorAtual(
  relatorios: readonly RelatorioIntegradoEntity[],
  churchId: string,
  indicadorId: string,
): LeituraDoIndicador | null {
  const candidatos = relatorios
    .filter((relatorio) => relatorio.churchId === churchId && relatorio.valores[indicadorId])
    .sort((esquerda, direita) => compararTrimestres(direita.trimestre, esquerda.trimestre))
  const escolhido = candidatos[0]
  return escolhido ? { trimestre: escolhido.trimestre, valor: escolhido.valores[indicadorId]! } : null
}

/**
 * O total do distrito para um indicador.
 *
 * `somar` junta todos os trimestres de todas as igrejas — o ano é a soma do que
 * aconteceu nele. `atualizar` junta apenas o valor mais recente de cada igreja
 * ativa: somar o primeiro trimestre com o segundo inventaria um distrito com o
 * dobro dos Pequenos Grupos que ele tem.
 */
export function totalDoDistrito(
  relatorios: readonly RelatorioIntegradoEntity[],
  indicadorId: string,
  igrejasAtivas: readonly string[],
): number | null {
  const indicador = indicadorPorId(indicadorId)
  if (!indicador) return null
  const ativas = new Set(igrejasAtivas)

  if (indicador.tratamento === 'somar') {
    const numeros = relatorios
      .filter((relatorio) => ativas.has(relatorio.churchId))
      .map((relatorio) => numeroDoValor(relatorio.valores[indicadorId]))
      .filter((numero): numero is number => numero !== null)
    return numeros.length ? numeros.reduce((soma, numero) => soma + numero, 0) : null
  }

  const recentes = igrejasAtivas
    .map((churchId) => numeroDoValor(valorAtual(relatorios, churchId, indicadorId)?.valor))
    .filter((numero): numero is number => numero !== null)
  return recentes.length ? recentes.reduce((soma, numero) => soma + numero, 0) : null
}

/** As igrejas que não entregaram o relatório daquele trimestre. */
export function semRelatorio(
  relatorios: readonly RelatorioIntegradoEntity[],
  trimestre: string,
  igrejasAtivas: readonly string[],
): string[] {
  const entregaram = new Set(relatorios.filter((relatorio) => relatorio.trimestre === trimestre).map(({ churchId }) => churchId))
  return igrejasAtivas.filter((churchId) => !entregaram.has(churchId))
}

/**
 * Quanto um valor destoa do trimestre anterior da mesma igreja.
 *
 * Devolve nulo quando não há com o que comparar, ou quando a base é pequena
 * demais para a comparação significar alguma coisa — sair de 1 para 4 é comum e
 * não merece interromper ninguém; sair de 5 para 45 é outra conversa.
 */
export const BASE_MINIMA_PARA_COMPARAR = 3

export function destoa(anterior: number | null, novo: number | null): boolean {
  if (anterior === null || novo === null) return false
  if (anterior < BASE_MINIMA_PARA_COMPARAR) return false
  return novo >= anterior * 3 || novo <= anterior * 0.4
}

export class RelatorioIntegradoService {
  private readonly repo: VaultRepository
  constructor(private readonly database: ApoioDatabase = db) { this.repo = new VaultRepository(database) }

  async listar(accountId: string, key: CryptoKey): Promise<RelatorioIntegradoEntity[]> {
    const registros = await this.repo.list(accountId, 'integrated_report')
    const abertos = await Promise.all(registros.map(async (registro) => {
      const payload = await readPayload(key, registro, this.database)
      return payload?.type === 'integrated_report'
        ? ({ id: registro.id, ...(payload.data as RelatorioIntegradoData) })
        : null
    }))
    return abertos
      .filter((item): item is RelatorioIntegradoEntity => Boolean(item))
      .sort((esquerda, direita) => compararTrimestres(esquerda.trimestre, direita.trimestre))
  }

  async gravar(accountId: string, key: CryptoKey, dados: RelatorioIntegradoData, id: string = crypto.randomUUID()): Promise<RelatorioIntegradoEntity> {
    if (!dados.churchId) throw new Error('Informe a igreja do relatório.')
    if (!/^\d{4}-[1-4]$/u.test(dados.trimestre)) throw new Error('O trimestre precisa estar no formato 2026-1.')
    const agora = new Date().toISOString()
    const completo: RelatorioIntegradoData = { ...dados, createdAt: dados.createdAt || agora, updatedAt: agora }
    const envelope = await encryptPayload(key, { schemaVersion: 1, type: 'integrated_report', data: completo }, id)
    await this.repo.saveEncrypted(accountId, currentDeviceId(accountId), id, envelope, 'integrated_report')
    return { id, ...completo }
  }

  private async abrir(accountId: string, key: CryptoKey, relatorioId: string): Promise<RelatorioIntegradoEntity> {
    const relatorio = (await this.listar(accountId, key)).find(({ id }) => id === relatorioId)
    if (!relatorio) throw new Error('Relatório não encontrado.')
    return relatorio
  }

  /**
   * A decisão sobre um valor que esperava confirmação.
   *
   * Aprovado ou corrigido, passa a valer e alimenta as metas; recusado fica
   * registrado como recusado. Depois disto, as metas precisam ser
   * sincronizadas — é o que a tela faz em seguida.
   */
  async decidirPendente(
    accountId: string,
    key: CryptoKey,
    relatorioId: string,
    indicadorId: string,
    decisao: { tipo: 'aprovado' } | { tipo: 'corrigido'; valor: number } | { tipo: 'recusado' },
  ): Promise<RelatorioIntegradoEntity> {
    const { id, pendentes = {}, recusados = [], ...dados } = await this.abrir(accountId, key, relatorioId)
    const valor = pendentes[indicadorId]
    if (!valor) throw new Error('Este valor já foi decidido.')
    if (decisao.tipo === 'corrigido' && (!Number.isInteger(decisao.valor) || decisao.valor < 0)) throw new Error('Informe um número inteiro, sem valores negativos.')
    const { [indicadorId]: _decidido, ...restantes } = pendentes; void _decidido
    const valores = decisao.tipo === 'recusado' ? dados.valores
      : { ...dados.valores, [indicadorId]: decisao.tipo === 'corrigido' ? comNumero(valor, decisao.valor) : valor }
    const foraAgora = decisao.tipo === 'recusado' ? [...new Set([...recusados, indicadorId])] : recusados.filter((item) => item !== indicadorId)
    return this.gravar(accountId, key, {
      ...dados, valores,
      ...(foraAgora.length ? { recusados: foraAgora } : {}),
      ...(Object.keys(restantes).length ? { pendentes: restantes } : {}),
    }, id)
  }

  /** Registra que o pastor conferiu a diferença entre o relatório e o cadastro, com os dois números de agora. */
  async marcarConferido(accountId: string, key: CryptoKey, relatorioId: string, indicadorId: string, numeros: { relatorio: number; cadastro: number }): Promise<RelatorioIntegradoEntity> {
    const { id, ...dados } = await this.abrir(accountId, key, relatorioId)
    return this.gravar(accountId, key, { ...dados, conferencias: { ...(dados.conferencias ?? {}), [indicadorId]: { ...numeros, em: new Date().toISOString() } } }, id)
  }
}

export type { IndicadorDoRelatorio }
