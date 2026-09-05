import type { VisitParticipant } from './types'

export interface AnswerTarget { id: string; label: string }

/**
 * De quem são as respostas de uma visita.
 *
 * A visita a uma casa quase nunca é a uma pessoa: é ao casal, à família, a quem
 * estava na sala. A tela deixava isso de lado — havia um alvo fixo chamado
 * "visita", e as respostas de todos viravam uma só, atribuída a ninguém. Não era
 * a tela escondendo a informação: ela nunca chegava a existir, e nenhum
 * relatório posterior poderia recuperá-la.
 *
 * O identificador é o **da pessoa**, e não o do participante. Quem lê essas
 * respostas depois — `personData.ts`, ao decidir o que sai e o que é tarjado em
 * um documento — compara com o cadastro da pessoa. Um identificador de
 * participante não casaria com ninguém, e a resposta de alguém deixaria de ser
 * reconhecida como dela justamente na hora de protegê-la.
 *
 * Convidado não cadastrado fica com o identificador do próprio participante:
 * ele não tem cadastro para casar, e é isso mesmo que se quer dizer.
 */
export function answerTargetsFor(
  participants: readonly VisitParticipant[],
  nomePorPessoa: (personId: string) => string | undefined,
): AnswerTarget[] {
  return participants
    .filter(({ present }) => present)
    .map((participante) => participante.kind === 'guest'
      ? { id: participante.id, label: participante.guestName?.trim() || 'Convidado' }
      : { id: participante.personId ?? participante.id, label: nomePorPessoa(participante.personId ?? '')?.trim() || 'Pessoa visitada' })
}
