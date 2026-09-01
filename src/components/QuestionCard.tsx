import type { QuestionSnapshot } from '../care/types'
import { AnswerField } from './AnswerField'

export interface AnswerTarget { id: string; label: string }

interface QuestionCardProps {
  question: QuestionSnapshot
  targets: AnswerTarget[]
  valueFor: (targetId: string) => string
  registered: boolean
  onAnswer: (targetId: string, value: string) => void
  onToggleRegistered: () => void
}

/** "COM-03" vira "3": o pastor não precisa do código interno na tela. */
export function questionNumber(code: string): string {
  return String(Number(code.replace(/^\D+/u, '')) || code)
}

/**
 * Uma pergunta da entrevista: número curto, área e o texto, com a resposta logo
 * abaixo. Registrar sem resposta continua possível, mas como ação discreta —
 * não é assim que se responde.
 */
export function QuestionCard({ question, targets, valueFor, registered, onAnswer, onToggleRegistered }: QuestionCardProps) {
  const respondida = targets.some((target) => valueFor(target.id).trim())

  return (
    <article className="question-card">
      <p className="question-card__label">{questionNumber(question.code)}. {question.category}</p>
      <p className="question-card__text">{question.text}</p>
      {targets.map((target) => (
        <div className="question-card__answer" key={target.id}>
          {targets.length > 1 && <small>{target.label}</small>}
          <AnswerField question={question} value={valueFor(target.id)} onChange={(valor) => onAnswer(target.id, valor)} />
        </div>
      ))}
      {!respondida && (
        <button type="button" className="text-button question-card__aside" onClick={onToggleRegistered}>
          {registered ? 'Registrada como perguntada · desfazer' : 'Registrar como perguntada sem resposta'}
        </button>
      )}
    </article>
  )
}
