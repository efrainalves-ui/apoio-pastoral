import type { PersonEntity } from './types'

export function calculateAge(birthDate: string | null, onDate = new Date()): number | null {
  if (!birthDate) return null
  const [year, month, day] = birthDate.split('-').map(Number)
  if (!year || !month || !day) return null
  let age = onDate.getFullYear() - year
  const beforeBirthday = onDate.getMonth() + 1 < month || (onDate.getMonth() + 1 === month && onDate.getDate() < day)
  if (beforeBirthday) age -= 1
  return age
}

export function ageOnNextBirthday(birthDate: string, today = new Date()): number {
  const [year] = birthDate.split('-').map(Number)
  return today.getFullYear() - (year ?? today.getFullYear()) + (birthdayHasPassed(birthDate, today) ? 1 : 0)
}

function birthdayHasPassed(birthDate: string, today: Date): boolean {
  const [, month = 1, day = 1] = birthDate.split('-').map(Number)
  return today.getMonth() + 1 > month || (today.getMonth() + 1 === month && today.getDate() > day)
}

export function daysUntilBirthday(birthDate: string, today = new Date()): number {
  const [, month = 1, day = 1] = birthDate.split('-').map(Number)
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  let next = new Date(today.getFullYear(), month - 1, day)
  if (next < start) next = new Date(today.getFullYear() + 1, month - 1, day)
  return Math.round((next.getTime() - start.getTime()) / 86_400_000)
}

export interface BirthdayPerson { person: PersonEntity; daysUntil: number; turningAge: number }

export function upcomingBirthdays(people: PersonEntity[], today = new Date(), days = 60): BirthdayPerson[] {
  return people
    .filter((person) => person.birthDate && person.importStatus !== 'archived')
    .map((person) => ({ person, daysUntil: daysUntilBirthday(person.birthDate!, today), turningAge: ageOnNextBirthday(person.birthDate!, today) }))
    .filter(({ daysUntil }) => daysUntil <= days)
    .sort((left, right) => left.daysUntil - right.daysUntil || left.person.name.localeCompare(right.person.name, 'pt-BR'))
}

export function birthdayTone(age: number): 'child' | 'teen' | 'young' | 'adult' | 'elder' {
  if (age <= 12) return 'child'
  if (age <= 17) return 'teen'
  if (age <= 29) return 'young'
  if (age <= 59) return 'adult'
  return 'elder'
}

export function birthdayMessage(name: string, age: number): string {
  const firstName = name.trim().split(/\s+/u)[0] || name.trim()
  const messages = {
    child: `Feliz aniversário, ${firstName}! Que Deus abençoe sua vida, seus sonhos e cada nova descoberta.`,
    teen: `Feliz aniversário, ${firstName}! Que Deus conduza suas escolhas e fortaleça seus sonhos neste novo ano.`,
    young: `Feliz aniversário, ${firstName}! Que este novo ciclo seja cheio da presença de Deus, propósito e boas oportunidades.`,
    adult: `Feliz aniversário, ${firstName}! Que Deus renove suas forças e abençoe sua vida e sua família neste novo ciclo.`,
    elder: `Feliz aniversário, ${firstName}! Que Deus continue concedendo saúde, paz e alegria, e que sua história siga inspirando vidas.`,
  }
  return messages[birthdayTone(age)]
}
