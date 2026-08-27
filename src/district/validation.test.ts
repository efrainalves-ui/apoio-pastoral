import { describe, expect, it } from 'vitest'
import { emptyChurchInput } from './types'
import { validateChurchInput, validateDistrictName } from './validation'

describe('validações de distrito e igrejas', () => {
  it('exige nome do distrito, nome e tipo da igreja', () => {
    expect(validateDistrictName('')).toHaveProperty('name')
    const errors = validateChurchInput(emptyChurchInput())
    expect(errors).toHaveProperty('name')
    expect(errors).toHaveProperty('type')
  })

  it('permite evolução somente na ordem oficial', () => {
    const input = { ...emptyChurchInput(), name: 'Comunidade Fictícia', type: 'organized_church' as const }
    expect(validateChurchInput(input, 'preaching_point')).toHaveProperty('type')
    expect(validateChurchInput({ ...input, type: 'group' }, 'preaching_point')).not.toHaveProperty('type')
    expect(validateChurchInput(input, 'group')).not.toHaveProperty('type')
  })

  it('rejeita horários inválidos e duplicados', () => {
    const input = {
      ...emptyChurchInput(),
      name: 'Comunidade Fictícia',
      type: 'group' as const,
      worshipSchedules: [
        { id: '1', day: 'saturday' as const, time: '25:10' },
        { id: '2', day: 'saturday' as const, time: '25:10' },
      ],
    }
    const errors = validateChurchInput(input)
    expect(errors['schedule-0']).toBeTruthy()
    expect(errors['schedule-1']).toBeTruthy()
  })
})
