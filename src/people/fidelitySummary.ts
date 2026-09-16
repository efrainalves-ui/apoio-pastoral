import type { PersonEntity } from './types'
import { calculateAge } from './dates'
import { temRenda } from './rendaPorIdade'
import { umaPorPessoa } from './vinculos'

export interface FidelityCareSummary { faithful: number; followingUp: number; toEvaluate: number }

export function isFidelityCareCandidate(person: PersonEntity): boolean {
  return person.fidelity?.category === 'non_tither' || person.fidelity?.category === 'non_systematic_tither'
}

export function isFaithfulByAge(person: PersonEntity, onDate = new Date()): boolean {
  const age = calculateAge(person.birthDate, onDate)
  return age !== null && age <= 15
}

/*
  A renda vem de `temRenda`, e não do campo gravado: quem tem 67 anos ou mais
  conta como pessoa com renda sem ninguém precisar responder. Por isso essa gente
  aparece em "Em acompanhamento" em vez de ficar esperando avaliação — e passa
  sozinha de um lado para o outro no dia do aniversário.
*/
export function fidelityCareSummary(todos: PersonEntity[], onDate = new Date()): FidelityCareSummary {
  // Cadastros vinculados são uma pessoa só: contar os dois inflaria o total.
  const people = umaPorPessoa(todos)
  const renda = (person: PersonEntity) => temRenda(person, onDate)
  return {
    faithful: people.filter((person) => person.fidelity?.category === 'tither' || isFaithfulByAge(person, onDate) || (isFidelityCareCandidate(person) && renda(person) === 'no_income')).length,
    followingUp: people.filter((person) => isFidelityCareCandidate(person) && !isFaithfulByAge(person, onDate) && renda(person) === 'has_income').length,
    toEvaluate: people.filter((person) => isFidelityCareCandidate(person) && !isFaithfulByAge(person, onDate) && renda(person) === 'unknown').length,
  }
}

/** Quem ainda precisa ser avaliado: candidato, fora da faixa etária, e sem renda definida. */
export function precisaDeAvaliacao(person: PersonEntity, onDate = new Date()): boolean {
  return isFidelityCareCandidate(person) && !isFaithfulByAge(person, onDate) && temRenda(person, onDate) === 'unknown'
}
