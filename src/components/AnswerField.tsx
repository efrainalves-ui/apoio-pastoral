import type { QuestionSnapshot } from '../care/types'

interface AnswerFieldProps {
  question: QuestionSnapshot
  value: string
  onChange: (value: string) => void
}

function escolhas(value: string): string[] {
  return value.split(',').map((item) => item.trim()).filter(Boolean)
}

/**
 * A resposta de uma pergunta da entrevista, do jeito que se responde de verdade:
 * sim e não são botões, quantos dias são os números para tocar, tempo é um campo
 * aberto com a unidade, e texto é uma caixa de escrita.
 *
 * Tocar de novo na opção escolhida limpa a resposta — é assim que se desfaz sem
 * precisar de um controle extra.
 */
export function AnswerField({ question, value, onChange }: AnswerFieldProps) {
  if (question.responseType === 'choice') {
    return (
      <div className="answer-choice" role="group" aria-label={question.text}>
        {question.options.map((option) => (
          <button
            key={option}
            type="button"
            className={`answer-choice__option${value === option ? ' answer-choice__option--on' : ''}`}
            aria-pressed={value === option}
            onClick={() => onChange(value === option ? '' : option)}
          >{option}</button>
        ))}
      </div>
    )
  }

  if (question.responseType === 'multiple') {
    const marcadas = escolhas(value)
    return (
      <div className="answer-choice" role="group" aria-label={question.text}>
        {question.options.map((option) => {
          const ligada = marcadas.includes(option)
          return (
            <button
              key={option}
              type="button"
              className={`answer-choice__option${ligada ? ' answer-choice__option--on' : ''}`}
              aria-pressed={ligada}
              onClick={() => onChange((ligada ? marcadas.filter((item) => item !== option) : [...marcadas, option]).join(', '))}
            >{option}</button>
          )
        })}
      </div>
    )
  }

  if (question.responseType === 'number' && question.scaleMax) {
    const escala = Array.from({ length: question.scaleMax + 1 }, (_, indice) => String(indice))
    return (
      <div className="answer-choice answer-choice--scale" role="group" aria-label={question.text}>
        {escala.map((numero) => (
          <button
            key={numero}
            type="button"
            className={`answer-choice__option${value === numero ? ' answer-choice__option--on' : ''}`}
            aria-pressed={value === numero}
            onClick={() => onChange(value === numero ? '' : numero)}
          >{numero}</button>
        ))}
      </div>
    )
  }

  if (question.responseType === 'number') {
    return (
      <div className="answer-number">
        <input className="field__input" type="number" min={0} inputMode="numeric" aria-label={question.text} value={value} onChange={(event) => onChange(event.target.value)} />
        <span>{question.unit ?? 'minutos'}</span>
      </div>
    )
  }

  return <textarea className="field__input" rows={3} aria-label={question.text} value={value} onChange={(event) => onChange(event.target.value)} />
}
