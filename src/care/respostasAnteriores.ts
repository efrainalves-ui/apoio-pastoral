import type { VisitEntity, VisitReason } from './types'

export interface RespostaAnterior {
  /** Já legível: resposta de múltipla escolha vira "a, b". */
  valor: string
  /** Início da visita em que ela foi dada, em ISO. */
  data: string
  visitaId: string
}

function legivel(valor: string | string[]): string {
  return Array.isArray(valor) ? valor.join(', ') : valor
}

function versaoAtual(visita: VisitEntity) {
  return visita.versions.at(-1)
}

/**
 * A última resposta de cada pessoa a cada pergunta, das visitas anteriores.
 *
 * Registrar a terceira visita de alguém sem ver as duas primeiras é registrar
 * um retrato solto. O que o pastor precisa saber não é "como ele está", é "como
 * ele está **em relação à última vez**" — se a leitura da Bíblia subiu de
 * "raramente" para "todo dia", ou se caiu. Por isso a resposta anterior fica ao
 * lado do campo enquanto ele responde a nova.
 *
 * A chave é `código da pergunta` + `pessoa`, porque cada presente responde por
 * si: numa casa com quatro pessoas são quatro históricos distintos.
 */
export function respostasAnteriores(
  visitas: readonly VisitEntity[],
  ignorarVisitaId?: string | null,
): Map<string, RespostaAnterior> {
  const mapa = new Map<string, RespostaAnterior>()
  for (const visita of visitas) {
    if (ignorarVisitaId && visita.id === ignorarVisitaId) continue
    const versao = versaoAtual(visita)
    if (!versao) continue
    for (const resposta of versao.answers) {
      if (resposta.skipped) continue
      const valor = legivel(resposta.value).trim()
      if (!valor) continue
      const chave = `${resposta.question.code}:${resposta.subjectId}`
      const guardada = mapa.get(chave)
      if (guardada && guardada.data >= versao.startAt) continue
      mapa.set(chave, { valor, data: versao.startAt, visitaId: visita.id })
    }
  }
  return mapa
}

export interface VisitaAnterior {
  visitaId: string
  data: string
  motivo: VisitReason
}

/** As visitas em que a pessoa esteve presente, da mais recente para a mais antiga. */
export function visitasDaPessoa(
  visitas: readonly VisitEntity[],
  personId: string,
  ignorarVisitaId?: string | null,
): VisitaAnterior[] {
  return visitas
    .filter((visita) => {
      if (ignorarVisitaId && visita.id === ignorarVisitaId) return false
      const versao = versaoAtual(visita)
      if (!versao) return false
      if (visita.targetType === 'person' && visita.targetId === personId) return true
      return versao.participants.some((participante) => participante.present && participante.personId === personId)
    })
    .map((visita) => {
      const versao = versaoAtual(visita)!
      return { visitaId: visita.id, data: versao.startAt, motivo: versao.reason }
    })
    .sort((esquerda, direita) => direita.data.localeCompare(esquerda.data))
}

const diaCurto = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short' })
const diaComAno = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' })

/** "14 ago" no ano corrente, "14 ago 2025" fora dele. */
export function quandoFoi(iso: string, anoCorrente = new Date().getFullYear()): string {
  const data = new Date(iso)
  if (Number.isNaN(data.getTime())) return ''
  const formatador = data.getFullYear() === anoCorrente ? diaCurto : diaComAno
  return formatador.format(data).replace(/\sde\s/gu, ' ').replace(/\.(?=\s|$)/gu, '')
}
