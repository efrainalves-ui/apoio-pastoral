import { ocorrenciasParaAvisar } from './push'
import type { LembreteEntity } from './types'

/**
 * Aviso dentro do aplicativo, quando a hora de um lembrete chega com ele aberto.
 *
 * Não depende de internet nem de push: é calculado do cofre local. Cada
 * ocorrência avisa uma vez por aparelho — a marca fica no armazenamento local,
 * e não no cofre, para que outro aparelho não deixe de avisar por causa deste.
 * O aviso não mexe no lembrete: ele continua aberto até o pastor concluir.
 */

export interface AvisoDeLembrete { chave: string; lembreteId: string; ocorrencia: string | null; titulo: string; instante: Date }

/** Aviso atrasado demais já é "Atrasado" na Central, não novidade. */
export const JANELA_DO_AVISO_MS = 5 * 60_000
const LIMITE = 300
const prefixo = (accountId: string) => `apoio-pastoral:lembretes-avisados:${accountId}`

export function chaveDoAviso(ocorrencia: { lembreteId: string; ocorrencia: string | null; instante: Date }): string {
  return `${ocorrencia.lembreteId}|${ocorrencia.ocorrencia ?? ''}|${ocorrencia.instante.toISOString()}`
}

/** Ocorrências cuja hora chegou entre `desde` e `agora`, ainda não avisadas. Mudar o horário gera aviso novo. */
export function avisosQueVenceram(lembretes: readonly LembreteEntity[], desde: Date, agora: Date, fuso: string, avisados: ReadonlySet<string>): AvisoDeLembrete[] {
  const porId = new Map(lembretes.map((lembrete) => [lembrete.id, lembrete]))
  return ocorrenciasParaAvisar(lembretes, new Date(desde.getTime() - 1), fuso)
    .filter(({ instante }) => instante.getTime() <= agora.getTime())
    .map((ocorrencia) => {
      const lembrete = porId.get(ocorrencia.lembreteId)!
      const titulo = (ocorrencia.ocorrencia && lembrete.ocorrencias[ocorrencia.ocorrencia]?.alteracao?.titulo) || lembrete.titulo
      return { ...ocorrencia, chave: chaveDoAviso(ocorrencia), titulo }
    })
    .filter(({ chave }) => !avisados.has(chave))
    .sort((a, b) => a.instante.getTime() - b.instante.getTime())
}

/** A tela do lembrete: a ocorrência certa, voltando para Hoje. */
export function linkDoLembrete(ocorrencia: { lembreteId: string; ocorrencia: string | null }): string {
  const parametros = new URLSearchParams()
  if (ocorrencia.ocorrencia) parametros.set('ocorrencia', ocorrencia.ocorrencia)
  parametros.set('voltar', '/app/lembretes/bloco/hoje')
  return `/app/lembretes/${encodeURIComponent(ocorrencia.lembreteId)}/editar?${parametros.toString()}`
}

export function avisadosNesteAparelho(accountId: string): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(prefixo(accountId)) ?? '[]') as string[]) } catch { return new Set() }
}

export function marcarAvisados(accountId: string, chaves: readonly string[]): void {
  try {
    const todos = avisadosNesteAparelho(accountId)
    for (const chave of chaves) todos.add(chave)
    localStorage.setItem(prefixo(accountId), JSON.stringify([...todos].slice(-LIMITE)))
  } catch { /* sem armazenamento, o aviso pode repetir numa nova abertura: é melhor do que não avisar */ }
}
