import { describe, expect, it } from 'vitest'
import { quandoFoi, respostasAnteriores, visitasDaPessoa } from './respostasAnteriores'
import type { QuestionSnapshot, VisitAnswer, VisitEntity, VisitParticipant } from './types'

const PERGUNTA: QuestionSnapshot = {
  code: 'ESP-02', version: 1, category: 'Espiritual', text: 'Com que frequência lê a Bíblia?',
  scope: 'individual', responseType: 'choice', options: ['Todo dia', 'Às vezes', 'Raramente'], sensitivity: 'pastoral',
}

function resposta(subjectId: string, value: string | string[], overrides: Partial<VisitAnswer> = {}): VisitAnswer {
  return { id: `resposta-${subjectId}-${String(value)}`, question: PERGUNTA, subjectId, value, skipped: false, ...overrides }
}

function participante(personId: string, present = true): VisitParticipant {
  return { id: `participante-${personId}`, kind: 'person', personId, present }
}

function visita(id: string, startAt: string, answers: VisitAnswer[], participants: VisitParticipant[], targetId = 'joao'): VisitEntity {
  return {
    id, targetType: 'person', targetId, churchId: 'igreja-ficticia', scheduledEventId: null, mode: 'full',
    status: 'completed', currentVersion: 1,
    versions: [{ version: 1, correctedAt: startAt, answers, participants, reason: 'routine', startAt, endAt: startAt, notes: '' }],
    createdAt: startAt, updatedAt: startAt,
  }
}

describe('respostas anteriores', () => {
  const primeira = visita('v1', '2026-03-10T19:00:00.000Z', [resposta('joao', 'Raramente')], [participante('joao')])
  const segunda = visita('v2', '2026-06-10T19:00:00.000Z', [resposta('joao', 'Às vezes')], [participante('joao')])

  it('guarda a mais recente, que é a que serve de comparação', () => {
    const mapa = respostasAnteriores([primeira, segunda])
    expect(mapa.get('ESP-02:joao')).toMatchObject({ valor: 'Às vezes', visitaId: 'v2' })
  })

  it('não depende da ordem em que as visitas chegam', () => {
    expect(respostasAnteriores([segunda, primeira]).get('ESP-02:joao')?.valor).toBe('Às vezes')
    expect(respostasAnteriores([primeira, segunda]).get('ESP-02:joao')?.valor).toBe('Às vezes')
  })

  it('separa por pessoa: numa casa cada um tem a própria história', () => {
    const emCasa = visita('v3', '2026-07-10T19:00:00.000Z',
      [resposta('joao', 'Todo dia'), resposta('maria', 'Raramente')],
      [participante('joao'), participante('maria')])
    const mapa = respostasAnteriores([emCasa])
    expect(mapa.get('ESP-02:joao')?.valor).toBe('Todo dia')
    expect(mapa.get('ESP-02:maria')?.valor).toBe('Raramente')
  })

  it('múltipla escolha vira uma linha legível', () => {
    const mapa = respostasAnteriores([visita('v4', '2026-05-10T19:00:00.000Z', [resposta('joao', ['Culto', 'Escola Sabatina'])], [participante('joao')])])
    expect(mapa.get('ESP-02:joao')?.valor).toBe('Culto, Escola Sabatina')
  })

  it('pergunta pulada ou em branco não é resposta anterior', () => {
    const pulada = visita('v5', '2026-08-10T19:00:00.000Z', [resposta('joao', 'Todo dia', { skipped: true })], [participante('joao')])
    const vazia = visita('v6', '2026-08-11T19:00:00.000Z', [resposta('joao', '   ')], [participante('joao')])
    expect(respostasAnteriores([primeira, pulada, vazia]).get('ESP-02:joao')?.valor).toBe('Raramente')
  })

  /*
    Corrigir a visita que está aberta não pode mostrar a própria resposta como
    se fosse a anterior — seria o pastor comparando o texto com ele mesmo.
  */
  it('a visita em correção não conta como anterior', () => {
    expect(respostasAnteriores([primeira, segunda], 'v2').get('ESP-02:joao')?.valor).toBe('Raramente')
    expect(respostasAnteriores([segunda], 'v2').has('ESP-02:joao')).toBe(false)
  })
})

describe('visitas da pessoa', () => {
  const emCasa = visita('v3', '2026-07-10T19:00:00.000Z', [], [participante('joao'), participante('maria', false)], 'joao')
  const anterior = visita('v1', '2026-03-10T19:00:00.000Z', [], [participante('joao')], 'joao')

  it('vem da mais recente para a mais antiga', () => {
    expect(visitasDaPessoa([anterior, emCasa], 'joao').map(({ visitaId }) => visitaId)).toEqual(['v3', 'v1'])
  })

  it('quem não estava presente não foi visitado', () => {
    expect(visitasDaPessoa([emCasa], 'maria')).toHaveLength(0)
  })

  it('alcança quem estava presente sem ser o alvo da visita', () => {
    const comAcompanhante = visita('v7', '2026-08-10T19:00:00.000Z', [], [participante('joao'), participante('pedro')], 'joao')
    expect(visitasDaPessoa([comAcompanhante], 'pedro').map(({ visitaId }) => visitaId)).toEqual(['v7'])
  })

  it('ignora a visita que está sendo corrigida', () => {
    expect(visitasDaPessoa([anterior, emCasa], 'joao', 'v3').map(({ visitaId }) => visitaId)).toEqual(['v1'])
  })
})

describe('quando foi', () => {
  it('esconde o ano corrente e mostra o de fora', () => {
    expect(quandoFoi('2026-08-14T19:00:00.000Z', 2026)).toBe('14 ago')
    expect(quandoFoi('2025-08-14T19:00:00.000Z', 2026)).toBe('14 ago 2025')
  })

  it('não quebra com data inválida', () => {
    expect(quandoFoi('nada disso é data', 2026)).toBe('')
  })
})
