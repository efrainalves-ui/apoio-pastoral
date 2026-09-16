import { calculateAge } from './dates'
import { FIDELITY_CATEGORY_LABELS, type IncomeStatus, type PersonEntity } from './types'

/** A partir desta idade a pessoa é considerada com renda, sem precisar perguntar. */
export const IDADE_COM_RENDA = 67

export type OrigemDaRenda = 'pastor' | 'idade' | 'a_confirmar' | 'sem_data'

export interface SituacaoDeRenda {
  /** A situação que vale agora, já com a regra da idade aplicada. */
  status: IncomeStatus
  origem: OrigemDaRenda
  /** A idade sozinha diria "tem renda" — mesmo quando o pastor corrigiu para outra coisa. */
  padraoPelaIdade: boolean
  idade: number | null
}

/**
 * A situação de renda de uma pessoa, calculada na hora.
 *
 * A idade não é guardada: ela sai da data de nascimento e do dia de hoje, então
 * quem completa 67 anos passa a contar como pessoa com renda no dia seguinte ao
 * aniversário, sem ninguém reprocessar nada — e sem uma idade velha congelada no
 * registro.
 *
 * O que o pastor decidiu continua valendo acima da regra: se ele marcou "não tem
 * renda" para alguém de 70 anos, é isso que vale, e a tela diz que o padrão da
 * idade seria outro. Quem não tem data de nascimento fica como estava, a
 * confirmar — inventar renda sem base seria pior do que perguntar.
 */
export function situacaoDeRenda(person: Pick<PersonEntity, 'birthDate' | 'incomeStatus'>, onDate = new Date()): SituacaoDeRenda {
  const idade = calculateAge(person.birthDate, onDate)
  const padraoPelaIdade = idade !== null && idade >= IDADE_COM_RENDA
  if (person.incomeStatus !== 'unknown') return { status: person.incomeStatus, origem: 'pastor', padraoPelaIdade, idade }
  if (padraoPelaIdade) return { status: 'has_income', origem: 'idade', padraoPelaIdade, idade }
  return { status: 'unknown', origem: person.birthDate ? 'a_confirmar' : 'sem_data', padraoPelaIdade, idade }
}

/** O mesmo, em uma palavra só. */
export const temRenda = (person: Pick<PersonEntity, 'birthDate' | 'incomeStatus'>, onDate = new Date()) =>
  situacaoDeRenda(person, onDate).status

export const ROTULO_DA_RENDA: Record<IncomeStatus, string> = {
  has_income: 'Com renda',
  no_income: 'Sem renda',
  unknown: 'Renda a confirmar',
}

/**
 * Como a pessoa aparece na lista.
 *
 * A classificação de fidelidade é a do relatório e não muda aqui: o que a renda
 * acrescenta é o "com renda" ao lado de quem não é dizimista, que é justamente a
 * distinção que o pastor precisa ver antes de visitar.
 */
export function rotuloDaFidelidade(person: Pick<PersonEntity, 'birthDate' | 'incomeStatus' | 'fidelity'>, onDate = new Date()): string {
  const categoria = person.fidelity?.category
  if (!categoria) return 'Sem leitura'
  const base = FIDELITY_CATEGORY_LABELS[categoria]
  if (categoria === 'tither') return base
  return situacaoDeRenda(person, onDate).status === 'has_income' ? `${base} com renda` : base
}
