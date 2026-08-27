import type { PersonEntity } from './types'
import { calculateAge } from './dates'

export interface FidelityCareSummary { faithful: number; followingUp: number; toEvaluate: number }

export function isFidelityCareCandidate(person: PersonEntity): boolean {
  return person.fidelity?.category === 'non_tither' || person.fidelity?.category === 'non_systematic_tither'
}

export function isFaithfulByAge(person: PersonEntity, onDate = new Date()): boolean {
  const age = calculateAge(person.birthDate, onDate)
  return age !== null && age <= 15
}

export function fidelityCareSummary(people: PersonEntity[], onDate = new Date()): FidelityCareSummary {
  return {
    faithful: people.filter((person) => person.fidelity?.category === 'tither' || isFaithfulByAge(person, onDate) || (isFidelityCareCandidate(person) && person.incomeStatus === 'no_income')).length,
    followingUp: people.filter((person) => isFidelityCareCandidate(person) && !isFaithfulByAge(person, onDate) && person.incomeStatus === 'has_income').length,
    toEvaluate: people.filter((person) => isFidelityCareCandidate(person) && !isFaithfulByAge(person, onDate) && person.incomeStatus === 'unknown').length,
  }
}
