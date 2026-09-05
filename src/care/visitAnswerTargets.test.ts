import { describe, expect, it } from 'vitest'
import { answerTargetsFor } from './visitAnswerTargets'
import type { VisitParticipant } from './types'

const nomes: Record<string, string> = { 'pessoa-1': 'Pessoa Fictícia Um', 'pessoa-2': 'Pessoa Fictícia Dois' }
const nome = (id: string) => nomes[id]

const membro = (personId: string, present = true): VisitParticipant => ({ id: `membro:${personId}`, kind: 'person', personId, present })
const convidado = (id: string, guestName: string): VisitParticipant => ({ id, kind: 'guest', guestName, present: true })

describe('de quem são as respostas de uma visita', () => {
  it('devolve uma pessoa por participante presente', () => {
    // Antes havia um alvo fixo: as respostas do casal viravam uma só, de
    // ninguém — e nenhum relatório posterior recuperaria quem disse o quê.
    expect(answerTargetsFor([membro('pessoa-1'), membro('pessoa-2')], nome)).toEqual([
      { id: 'pessoa-1', label: 'Pessoa Fictícia Um' },
      { id: 'pessoa-2', label: 'Pessoa Fictícia Dois' },
    ])
  })

  it('usa o identificador da pessoa, e não o do participante', () => {
    // `personData.ts` compara este identificador com o cadastro para decidir o
    // que sai e o que é tarjado. Um id de participante não casaria com ninguém,
    // e a resposta deixaria de ser reconhecida como dela na hora de protegê-la.
    const [alvo] = answerTargetsFor([membro('pessoa-1')], nome)

    expect(alvo?.id).toBe('pessoa-1')
    expect(alvo?.id).not.toBe('membro:pessoa-1')
  })

  it('deixa de fora quem não estava presente', () => {
    expect(answerTargetsFor([membro('pessoa-1'), membro('pessoa-2', false)], nome).map(({ id }) => id)).toEqual(['pessoa-1'])
  })

  it('convidado não cadastrado fica com o próprio identificador', () => {
    // Ele não tem cadastro para casar, e é isso mesmo que se quer dizer.
    expect(answerTargetsFor([convidado('convidado-1', 'Visitante Fictício')], nome)).toEqual([
      { id: 'convidado-1', label: 'Visitante Fictício' },
    ])
  })

  it('não deixa a pessoa sem rótulo quando o nome não é encontrado', () => {
    expect(answerTargetsFor([membro('pessoa-desconhecida')], nome)[0]?.label).toBe('Pessoa visitada')
    expect(answerTargetsFor([convidado('convidado-2', '   ')], nome)[0]?.label).toBe('Convidado')
  })
})
