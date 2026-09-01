import { describe, expect, it } from 'vitest'
import { OFFICIAL_QUESTIONS } from './questionnaire'

describe('banco de perguntas da visita', () => {
  // "Quanto tempo dedicou à oração?" sem unidade deixa o pastor adivinhar se
  // responde em minutos, horas ou vezes na semana.
  it('diz em que medida responder toda pergunta numérica de tempo ou frequência', () => {
    const semUnidade = OFFICIAL_QUESTIONS
      .filter(({ responseType, text }) => responseType === 'number' && /quanto tempo|em quantos dias/iu.test(text))
      .filter(({ unit }) => !unit)
      .map(({ code }) => code)

    expect(semUnidade).toEqual([])
  })

  it('mantém os quatro tipos de resposta disponíveis', () => {
    const tipos = new Set(OFFICIAL_QUESTIONS.map(({ responseType }) => responseType))

    expect([...tipos].sort()).toEqual(['choice', 'multiple', 'number', 'text'])
  })
})
