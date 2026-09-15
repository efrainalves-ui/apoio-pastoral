import { currentDeviceId } from '../auth/device'
import { encryptPayload } from '../crypto/vault'
import { readPayload } from '../db/corrupted'
import { db, type ApoioDatabase } from '../db/database'
import { VaultRepository, type EncryptedMutation } from '../db/repository'
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

/**
 * O valor que a igreja informou, onde quer que ele tenha ficado guardado.
 *
 * Relatórios gravados antes desta etapa deixaram parte dos números em
 * `pendentes`, esperando uma confirmação que deixou de existir. Eles são o que a
 * igreja escreveu e valem como tal.
 */
export function valorGuardado(relatorio: Pick<RelatorioIntegradoData, 'valores' | 'pendentes'>, indicadorId: string): ValorDoIndicador | undefined {
  return relatorio.valores[indicadorId] ?? relatorio.pendentes?.[indicadorId]
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
    .filter((relatorio) => relatorio.churchId === churchId && valorGuardado(relatorio, indicadorId))
    .sort((esquerda, direita) => compararTrimestres(direita.trimestre, esquerda.trimestre))
  const escolhido = candidatos[0]
  return escolhido ? { trimestre: escolhido.trimestre, valor: valorGuardado(escolhido, indicadorId)! } : null
}

/** A resposta mais recente da igreja antes de um trimestre. */
export function valorAnterior(
  relatorios: readonly RelatorioIntegradoEntity[],
  churchId: string,
  indicadorId: string,
  trimestre: string,
): LeituraDoIndicador | null {
  return valorAtual(relatorios.filter((relatorio) => compararTrimestres(relatorio.trimestre, trimestre) < 0), churchId, indicadorId)
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
      .map((relatorio) => numeroDoValor(valorGuardado(relatorio, indicadorId)))
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
 * Possível erro de digitação: só a mudança extrema.
 *
 * O relatório é o registro do que a igreja respondeu, e nenhum número é
 * bloqueado ou trocado. O asterisco é só uma observação, e por isso o critério é
 * conservador: os dois lados maiores que zero, um pelo menos cinco vezes o outro
 * e uma diferença de pelo menos vinte. Uma queda para zero, um crescimento
 * possível ou uma base pequena não recebem asterisco — marcar quase tudo
 * ensinaria a ignorar a marca.
 */
export const RAZAO_DO_POSSIVEL_ERRO = 5
export const DIFERENCA_DO_POSSIVEL_ERRO = 20

export function possivelErroDeDigitacao(anterior: number | null, atual: number | null): boolean {
  if (anterior === null || atual === null || anterior <= 0 || atual <= 0) return false
  const maior = Math.max(anterior, atual)
  const menor = Math.min(anterior, atual)
  return maior >= menor * RAZAO_DO_POSSIVEL_ERRO && maior - menor >= DIFERENCA_DO_POSSIVEL_ERRO
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

  /**
   * Os números que ficaram esperando confirmação passam a valer como vieram.
   *
   * Reprocessa o que já está guardado sem pedir o PDF de novo: o valor sai de
   * `pendentes` e entra em `valores` exatamente como a igreja escreveu. Igreja,
   * trimestre, páginas, arquivo e data da gravação ficam como estavam — é essa
   * data que o histórico de envios mostra. Rodar de novo não encontra nada.
   */
  async aceitarValoresGuardados(accountId: string, key: CryptoKey): Promise<number> {
    const mutacoes: EncryptedMutation[] = []
    for (const relatorio of await this.listar(accountId, key)) {
      if (!relatorio.pendentes || !Object.keys(relatorio.pendentes).length) continue
      const { id, pendentes, ...dados } = relatorio
      const data: RelatorioIntegradoData = { ...dados, valores: { ...pendentes, ...dados.valores } }
      mutacoes.push({ recordId: id, recordType: 'integrated_report', envelope: await encryptPayload(key, { schemaVersion: 1, type: 'integrated_report', data }, id) })
    }
    if (mutacoes.length) await this.repo.applyEncryptedMutations(accountId, currentDeviceId(accountId), mutacoes)
    return mutacoes.length
  }
}

export type { IndicadorDoRelatorio }
