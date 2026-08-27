import type { FamilyEntity } from '../families/types'
import type { PersonEntity } from '../people/types'

function comparable(value: string): string { return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('pt-BR') }

export function visitTargetsForChurch(people: PersonEntity[], families: FamilyEntity[], churchId: string, query = ''): { people: PersonEntity[]; families: FamilyEntity[] } {
  if (!churchId) return { people: [], families: [] }
  const matches = (name: string) => comparable(name).includes(comparable(query.trim()))
  const churchPeople = people.filter((person) => person.currentChurchId === churchId)
  return {
    people: churchPeople.filter((person) => matches(person.name)),
    families: families.filter((family) => family.memberIds.some((memberId) => churchPeople.some((person) => person.id === memberId)) && matches(family.name)),
  }
}
