import type { PersonEntity } from '../people/types'
import type { PrayerRequestEntity } from './types'

export function normalizePrayerSearch(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('pt-BR').replace(/\s+/gu, ' ').trim()
}

/** A lista de membros aparece sozinha assim que a igreja é escolhida. */
export function peopleForPrayerChurch(people: PersonEntity[], churchId: string): PersonEntity[] {
  return people.filter((person) => person.currentChurchId === churchId).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
}

export interface PrayerGroup { id: string; name: string; total: number }

const ativo = (prayer: PrayerRequestEntity) => prayer.status === 'active' || prayer.status === 'needs_follow_up'

/** Igrejas que têm pedidos de membros, para a primeira lista do acompanhamento. */
export function prayerChurchGroups(prayers: PrayerRequestEntity[], churches: Array<{ id: string; name: string }>): PrayerGroup[] {
  return churches
    .map((church) => ({ id: church.id, name: church.name, total: prayers.filter((prayer) => prayer.subjectType === 'person' && prayer.churchId === church.id).length }))
    .filter(({ total }) => total > 0)
}

/** Membros com pedidos naquela igreja. */
export function prayerPeopleGroups(prayers: PrayerRequestEntity[], churchId: string, people: Array<{ id: string; name: string }>): PrayerGroup[] {
  const daIgreja = prayers.filter((prayer) => prayer.subjectType === 'person' && prayer.churchId === churchId && prayer.subjectId)
  const ids = [...new Set(daIgreja.map((prayer) => prayer.subjectId as string))]
  return ids
    .map((id) => ({ id, name: people.find((person) => person.id === id)?.name ?? 'Pessoa não encontrada', total: daIgreja.filter((prayer) => prayer.subjectId === id).length }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
}

/** Pessoas não cadastradas, agrupadas pelo nome informado. */
export function unregisteredPrayerGroups(prayers: PrayerRequestEntity[]): PrayerGroup[] {
  const naoCadastrados = prayers.filter((prayer) => prayer.subjectType === 'unregistered')
  const chaves = [...new Set(naoCadastrados.map((prayer) => normalizePrayerSearch(prayer.subjectName ?? '')))]
  return chaves
    .map((chave) => ({
      id: chave,
      name: naoCadastrados.find((prayer) => normalizePrayerSearch(prayer.subjectName ?? '') === chave)?.subjectName || 'Pessoa não cadastrada',
      total: naoCadastrados.filter((prayer) => normalizePrayerSearch(prayer.subjectName ?? '') === chave).length,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
}

export function anonymousPrayers(prayers: PrayerRequestEntity[]): PrayerRequestEntity[] {
  return prayers.filter((prayer) => prayer.subjectType === 'anonymous')
}

/** Contagens do resumo, calculadas uma vez só. */
export function prayerCounters(prayers: PrayerRequestEntity[]) {
  return {
    active: prayers.filter(ativo).length,
    answered: prayers.filter(({ status }) => status === 'answered').length,
    closed: prayers.filter(({ status }) => status === 'closed' || status === 'archived').length,
  }
}
