import { describe, expect, it } from 'vitest'
import type { QuestionSnapshot, VisitEntity } from './types'
import { MINIMO_PARA_MOSTRAR, summarizeAnswers } from './answerSummary'

function pergunta(partes: Partial<QuestionSnapshot>): QuestionSnapshot {
  return { code: 'COM-01', version: 1, category: 'Comunhão', text: 'Você estudou a Bíblia hoje?', scope: 'individual', responseType: 'choice', options: ['Sim', 'Não'], sensitivity: 'pastoral', ...partes }
}

function visita(valor: string, question: QuestionSnapshot, indice: number): VisitEntity {
  return {
    id: `visita-ficticia-${indice}`, targetType: 'person', targetId: `pessoa-ficticia-${indice}`, churchId: 'igreja-ficticia',
    scheduledEventId: null, mode: 'full', status: 'completed', currentVersion: 1,
    createdAt: '2026-09-01T10:00:00.000Z', updatedAt: '2026-09-01T10:00:00.000Z',
    versions: [{
      version: 1, correctedAt: '2026-09-01T10:00:00.000Z', reason: 'routine',
      startAt: '2026-09-01T10:00:00.000Z', endAt: '2026-09-01T10:30:00.000Z', notes: '',
      participants: [], answers: [{ id: `resposta-${indice}`, question, subjectId: `pessoa-ficticia-${indice}`, value: valor, skipped: false }],
    }],
  }
}

describe('resumo das respostas das visitas', () => {
  it('mostra percentual por opção quando há respostas suficientes', () => {
    const q = pergunta({})
    const visitas = Array.from({ length: 6 }, (_, indice) => visita(indice < 4 ? 'Sim' : 'Não', q, indice))

    const [resumo] = summarizeAnswers(visitas)

    expect(resumo?.respostas).toBe(6)
    expect(resumo?.opcoes).toEqual([
      { rotulo: 'Sim', total: 4, percentual: 67 },
      { rotulo: 'Não', total: 2, percentual: 33 },
    ])
  })

  // Com poucas respostas, uma porcentagem pode apontar para uma pessoa.
  it('esconde a pergunta com menos respostas que o mínimo', () => {
    const q = pergunta({})
    const poucas = Array.from({ length: MINIMO_PARA_MOSTRAR - 1 }, (_, indice) => visita('Sim', q, indice))

    expect(summarizeAnswers(poucas)).toEqual([])
  })

  it('calcula média nas perguntas de tempo', () => {
    const q = pergunta({ code: 'COM-02', responseType: 'number', options: [], unit: 'minutos', text: 'Quanto tempo dedicou hoje?' })
    const visitas = Array.from({ length: 5 }, (_, indice) => visita(String((indice + 1) * 10), q, indice))

    const [resumo] = summarizeAnswers(visitas)

    expect(resumo?.tipo).toBe('media')
    expect(resumo?.media).toBe(30)
    expect(resumo?.unidade).toBe('minutos')
  })

  it('distribui a escala de 0 a 7 em ordem', () => {
    const q = pergunta({ code: 'COM-03', responseType: 'number', options: [], unit: 'dias', scaleMax: 7, text: 'Em quantos dias?' })
    const visitas = ['7', '0', '3', '3', '0'].map((valor, indice) => visita(valor, q, indice))

    const [resumo] = summarizeAnswers(visitas)

    expect(resumo?.tipo).toBe('escala')
    expect(resumo?.opcoes?.map(({ rotulo }) => rotulo)).toEqual(['0', '3', '7'])
  })

  // Texto livre não tem como ser resumido sem expor o que foi dito.
  it('nunca resume pergunta de texto', () => {
    const q = pergunta({ code: 'COM-08', responseType: 'text', options: [], text: 'O que tem ajudado?' })
    const visitas = Array.from({ length: 8 }, (_, indice) => visita('Conteúdo pastoral fictício', q, indice))

    const resumo = summarizeAnswers(visitas)

    expect(resumo).toEqual([])
    expect(JSON.stringify(resumo)).not.toContain('Conteúdo pastoral')
  })

  it('não expõe nome nem identificador de ninguém', () => {
    const q = pergunta({})
    const visitas = Array.from({ length: 6 }, (_, indice) => visita('Sim', q, indice))

    const serializado = JSON.stringify(summarizeAnswers(visitas))

    expect(serializado).not.toContain('pessoa-ficticia')
    expect(serializado).not.toContain('visita-ficticia')
    expect(serializado).not.toContain('igreja-ficticia')
  })
})
