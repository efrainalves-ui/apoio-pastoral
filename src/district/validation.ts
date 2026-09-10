import { CHURCH_STATUSES, CHURCH_TYPES, type ChurchInput } from './types'

export type FieldErrors = Record<string, string>

export class DomainValidationError extends Error {
  constructor(public readonly fieldErrors: FieldErrors) {
    super('Revise os campos destacados.')
  }
}

export function validateDistrictName(name: string): FieldErrors {
  const errors: FieldErrors = {}
  if (!name.trim()) errors.name = 'Informe o nome do distrito.'
  if (name.trim().length > 120) errors.name = 'Use no máximo 120 caracteres.'
  return errors
}

function isValidTime(value: string): boolean {
  if (!/^\d{2}:\d{2}$/u.test(value)) return false
  const [hours = 99, minutes = 99] = value.split(':').map(Number)
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59
}

export function validateChurchInput(input: ChurchInput): FieldErrors {
  const errors: FieldErrors = {}
  if (!input.name.trim()) errors.name = 'Informe o nome da igreja.'
  if (input.name.trim().length > 160) errors.name = 'Use no máximo 160 caracteres.'
  if (!input.type || !CHURCH_TYPES.includes(input.type)) errors.type = 'Selecione o tipo da igreja.'
  if (!CHURCH_STATUSES.includes(input.status)) errors.status = 'Selecione uma situação válida.'
  if (input.externalCode.trim().length > 80) errors.externalCode = 'Use no máximo 80 caracteres.'
  if (input.address.trim().length > 500) errors.address = 'Use no máximo 500 caracteres.'
  if (input.administrativeNotes.trim().length > 2_000) errors.administrativeNotes = 'Use no máximo 2.000 caracteres.'

  const schedules = new Set<string>()
  for (const [index, schedule] of input.worshipSchedules.entries()) {
    if (!isValidTime(schedule.time)) errors[`schedule-${index}`] = 'Informe um horário válido.'
    const signature = `${schedule.day}:${schedule.time}`
    if (schedules.has(signature)) errors[`schedule-${index}`] = 'Este dia e horário já foi adicionado.'
    schedules.add(signature)
  }
  return errors
}

export function assertValid(errors: FieldErrors): void {
  if (Object.keys(errors).length > 0) throw new DomainValidationError(errors)
}
