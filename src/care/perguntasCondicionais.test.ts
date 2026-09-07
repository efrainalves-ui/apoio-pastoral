import { describe, expect, it } from 'vitest'
import { perguntaVisivel } from './perguntasCondicionais'
import { OFFICIAL_QUESTIONS, questionSnapshot } from './questionnaire'

const pergunta = (code: string) => questionSnapshot(code)!

describe('perguntas que dependem de outra', () => {
  it('a de tempo só existe depois de "Sim" em estudou hoje', () => {
    expect(perguntaVisivel(pergunta('COM-02'), () => 'Sim')).toBe(true)
    expect(perguntaVisivel(pergunta('COM-02'), () => 'Não')).toBe(false)
    expect(perguntaVisivel(pergunta('COM-02'), () => 'Prefere não responder')).toBe(false)
  })

  it('vale igual para oração e para estudo bíblico dado a alguém', () => {
    expect(perguntaVisivel(pergunta('COM-05'), () => 'Não')).toBe(false)
    expect(perguntaVisivel(pergunta('MIS-02'), () => 'Não')).toBe(false)
    expect(perguntaVisivel(pergunta('MIS-02'), () => 'Sim')).toBe(true)
  })

  it('não aparece enquanto a de cima não for respondida', () => {
    // Mostrá-la vazia sugeriria que a de cima já foi respondida.
    expect(perguntaVisivel(pergunta('COM-02'), () => '')).toBe(false)
  })

  it('a frequência do culto familiar aceita "Às vezes", não só "Sim"', () => {
    expect(perguntaVisivel(pergunta('FAM-02'), () => 'Às vezes')).toBe(true)
    expect(perguntaVisivel(pergunta('FAM-02'), () => 'Não')).toBe(false)
  })

  it('os dias dos últimos sete continuam valendo para quem não estudou hoje', () => {
    // Não estudar hoje não diz nada sobre a semana: condicionar esta pergunta
    // apagaria justamente o dado que mostra o hábito.
    expect(perguntaVisivel(pergunta('COM-03'), () => 'Não')).toBe(true)
    expect(perguntaVisivel(pergunta('COM-06'), () => 'Não')).toBe(true)
  })

  it('quem depende de alguém depende de pergunta que existe e de resposta possível', () => {
    for (const { code, dependsOn } of OFFICIAL_QUESTIONS) {
      if (!dependsOn) continue
      const acima = OFFICIAL_QUESTIONS.find((item) => item.code === dependsOn.code)
      expect(acima, `${code} depende de ${dependsOn.code}, que não existe`).toBeDefined()
      for (const resposta of dependsOn.answers) {
        expect(acima!.options, `${code} espera "${resposta}", que ${dependsOn.code} não oferece`).toContain(resposta)
      }
    }
  })

  it('a pergunta de quantas pessoas é contada em pessoas, não em minutos', () => {
    expect(pergunta('MIS-02').unit).toBe('pessoas')
  })
})

describe('as perguntas de missão seguem quem já dá estudo', () => {
  it('aprender a dar e indicar interessado são para quem não dá', () => {
    // Perguntar a quem já dá estudo se gostaria de aprender é fazer a pessoa
    // corrigir o formulário em voz alta.
    expect(perguntaVisivel(pergunta('MIS-06'), () => 'Não')).toBe(true)
    expect(perguntaVisivel(pergunta('MIS-07'), () => 'Não')).toBe(true)
    expect(perguntaVisivel(pergunta('MIS-06'), () => 'Sim')).toBe(false)
    expect(perguntaVisivel(pergunta('MIS-07'), () => 'Sim')).toBe(false)
  })
})
