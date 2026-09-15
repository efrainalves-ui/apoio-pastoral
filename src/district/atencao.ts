import type { AgendaEventEntity } from '../agenda/types'
import type { PersonEntity } from '../people/types'
import type { ChurchEntity } from './types'

export interface IgrejaComPendencia { id: string; name: string; motivo: string }

/**
 * Igrejas que pedem uma olhada, em ordem alfabética.
 *
 * Sinal operacional, nunca julgamento: a lista não classifica igreja como
 * melhor ou pior. É a mesma regra que a tela inicial resume e que a página do
 * distrito mostra por extenso — escrita uma vez só para as duas não divergirem.
 */
export function igrejasQuePrecisamDeAtencao(
  churches: readonly ChurchEntity[],
  people: readonly PersonEntity[],
  events: readonly AgendaEventEntity[],
  hoje: string,
): IgrejaComPendencia[] {
  return churches
    .map((church) => {
      const semPessoas = !people.some(({ currentChurchId, importStatus }) => currentChurchId === church.id && importStatus !== 'archived')
      const semAgenda = !events.some((event) => event.churchId === church.id && event.startAt.slice(0, 10) >= hoje)
      const motivo = semPessoas ? 'Ainda sem pessoas cadastradas' : semAgenda ? 'Sem compromisso futuro na Agenda' : ''
      return { id: church.id, name: church.name, motivo }
    })
    .filter(({ motivo }) => motivo.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
}
