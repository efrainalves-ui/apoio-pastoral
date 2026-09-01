import type { QuestionSnapshot } from '../care/types'

interface AnswerFieldProps {
  question: QuestionSnapshot
  value: string
  onChange: (value: string) => void
}

/**
 * O campo de resposta de uma pergunta da entrevista. Cada tipo aparece do jeito
 * que se responde de verdade: texto tem caixa, número tem unidade, escolha tem
 * as opções à vista. Em branco continua significando "pergunta pulada".
 */
export function AnswerField({ question, value, onChange }: AnswerFieldProps) {
  if (question.responseType === 'choice') {
    return (
      <select className="field__input" value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Pular pergunta</option>
        {question.options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    )
  }

  if (question.responseType === 'text') {
    return <textarea className="field__input" rows={3} placeholder="Deixar em branco para pular" value={value} onChange={(event) => onChange(event.target.value)} />
  }

  if (question.responseType === 'number') {
    return (
      <>
        <input className="field__input" type="number" min={0} placeholder="Deixar em branco para pular" value={value} onChange={(event) => onChange(event.target.value)} />
        {question.unit && <small className="field__hint">Responda em {question.unit}.</small>}
      </>
    )
  }

  const escolhidas = value.split(',').map((item) => item.trim()).filter(Boolean)
  return (
    <div className="answer-options">
      {question.options.map((option) => {
        const marcado = escolhidas.includes(option)
        return (
          <label key={option}>
            <input
              type="checkbox"
              checked={marcado}
              onChange={() => onChange((marcado ? escolhidas.filter((item) => item !== option) : [...escolhidas, option]).join(', '))}
            />
            <span>{option}</span>
          </label>
        )
      })}
    </div>
  )
}
