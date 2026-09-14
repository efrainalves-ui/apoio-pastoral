import { localDateKey } from '../shared/dates'
import type { AgendaEventEntity } from './types'

export interface DiaDaLista { chave: string; data: Date; eventos: AgendaEventEntity[] }

/**
 * Os compromissos do mês, agrupados por dia.
 *
 * Entra o compromisso que começa no mês; cada um aparece uma vez, no dia em
 * que começa. Só há grupo para dia com compromisso. Dentro do dia vêm primeiro
 * os sem horário e depois os demais, do mais cedo ao mais tarde.
 */
export function listaDoMes(eventos: readonly AgendaEventEntity[], referencia: Date): DiaDaLista[] {
  const ano = referencia.getFullYear(); const mes = referencia.getMonth()
  const vistos = new Set<string>()
  const porDia = new Map<string, AgendaEventEntity[]>()
  for (const evento of eventos) {
    const inicio = new Date(evento.startAt)
    if (Number.isNaN(inicio.getTime()) || inicio.getFullYear() !== ano || inicio.getMonth() !== mes || vistos.has(evento.id)) continue
    vistos.add(evento.id)
    const chave = localDateKey(inicio)
    porDia.set(chave, [...(porDia.get(chave) ?? []), evento])
  }
  return [...porDia.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([chave, doDia]) => ({
      chave, data: new Date(`${chave}T12:00:00`),
      eventos: doDia.sort((a, b) => Number(b.allDay) - Number(a.allDay) || new Date(a.startAt).getTime() - new Date(b.startAt).getTime() || a.title.localeCompare(b.title, 'pt-BR')),
    }))
}

export function tituloDoMes(referencia: Date): string {
  const texto = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(referencia)
  return texto.charAt(0).toLocaleUpperCase('pt-BR') + texto.slice(1)
}

export function resumoDoMes(dias: readonly DiaDaLista[]): string {
  const total = dias.reduce((soma, dia) => soma + dia.eventos.length, 0)
  return `${total} ${total === 1 ? 'compromisso' : 'compromissos'} neste mês`
}
