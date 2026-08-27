import type { PersonEntity } from '../people/types'

export function normalizePrayerSearch(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('pt-BR').replace(/\s+/gu, ' ').trim()
}

export function peopleForPrayerChurch(people: PersonEntity[], churchId: string, search = ''): PersonEntity[] {
  const query = normalizePrayerSearch(search)
  return people.filter((person) => person.currentChurchId === churchId && (!query || normalizePrayerSearch(person.name).includes(query)))
}
