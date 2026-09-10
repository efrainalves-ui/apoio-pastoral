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

  /*
    A ordem oficial — ponto de pregação, grupo, igreja organizada — descreve o
    que acontece de verdade, e por isso o cadastro só deixava avançar. Mas a
    importação da lista de membros grava toda unidade como igreja organizada,
    porque o PDF não diz o tipo. Com a regra ligada, o pastor não conseguia
    corrigir os grupos do próprio distrito. Corrigir um palpite do aplicativo
    tem de ser possível; a evolução fica registrada no histórico da igreja.
  */
  it('aceita corrigir o tipo em qualquer direção', () => {
    const input = { ...emptyChurchInput(), name: 'Comunidade Fictícia', type: 'group' as const }
    expect(validateChurchInput(input)).not.toHaveProperty('type')
    expect(validateChurchInput({ ...input, type: 'preaching_point' })).not.toHaveProperty('type')
    expect(validateChurchInput({ ...input, type: 'organized_church' })).not.toHaveProperty('type')
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
