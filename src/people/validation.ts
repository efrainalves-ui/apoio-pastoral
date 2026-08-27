import type { PersonInput } from './types'

export type PersonFieldErrors = Record<string, string>

export class PersonValidationError extends Error {
  constructor(public readonly fieldErrors: PersonFieldErrors) {
    super('Revise os campos destacados.')
  }
}

export function normalizePersonName(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/gu, '').replace(/\s+/gu, ' ').trim().toLocaleUpperCase('pt-BR')
}

export function normalizePhone(value: string): string {
  return value.replace(/\D/gu, '')
}

export function validatePersonInput(input: PersonInput, today = new Date()): PersonFieldErrors {
  const errors: PersonFieldErrors = {}
  if (!input.name.trim()) errors.name = 'Informe o nome completo.'
  else if (input.name.trim().length > 180) errors.name = 'Use no máximo 180 caracteres.'
  else if (/\d/u.test(input.name)) errors.name = 'O nome não deve conter números.'
  if (!input.currentChurchId) errors.currentChurchId = 'Selecione a igreja.'
  if (input.birthDate) {
    const date = new Date(`${input.birthDate}T12:00:00`)
    if (Number.isNaN(date.getTime()) || date.getFullYear() < 1900) errors.birthDate = 'Informe uma data válida a partir de 1900.'
    else if (date > today) errors.birthDate = 'A data de nascimento não pode estar no futuro.'
  }
  const phone = normalizePhone(input.whatsapp)
  if (phone && (phone.length < 10 || phone.length > 15)) errors.whatsapp = 'Informe o WhatsApp com DDD, entre 10 e 15 dígitos.'
  if (input.notes.trim().length > 2_000) errors.notes = 'Use no máximo 2.000 caracteres.'
  return errors
}

export function assertPersonInput(input: PersonInput): void {
  const errors = validatePersonInput(input)
  if (Object.keys(errors).length > 0) throw new PersonValidationError(errors)
}
