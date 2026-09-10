import type { QuestionSnapshot } from '../care/types'
import { quandoFoi, type RespostaAnterior } from '../care/respostasAnteriores'
import { AnswerField } from './AnswerField'

export interface AnswerTarget { id: string; label: string }

interface QuestionCardProps {
  question: QuestionSnapshot
  targets: AnswerTarget[]
  valueFor: (targetId: string) => string
  registered: boolean
  /**
   * Responder uma vez e valer para todos os presentes.
   *
   * Atalho de digitação, e não de armazenamento: a resposta continua sendo
   * gravada para **cada** pessoa, com o identificador dela. Numa casa, a maioria
   * das respostas é igual; repetir catorze opções por pessoa, em vinte
   * perguntas, é o tipo de trabalho que faz alguém desistir de responder — e
   * uma entrevista não respondida não vale nada.
   */
  sameForAll?: boolean
  /**
   * O que esta pessoa respondeu da última vez.
   *
   * Sem isso a entrevista é um retrato solto: o pastor anota "às vezes" sem
   * saber que da outra vez foi "raramente" — e a subida, que é a notícia, passa
   * despercebida.
   */
  anteriorPara?: (targetId: string) => RespostaAnterior | undefined
  onAnswer: (targetId: string, value: string) => void
  onToggleRegistered: () => void
}

/** "COM-03" vira "3": o pastor não precisa do código interno na tela. */
export function questionNumber(code: string): string {
  return String(Number(code.replace(/^\D+/u, '')) || code)
}

function RespostaDeAntes({ anterior }: { anterior: RespostaAnterior | undefined }) {
  if (!anterior) return null
  return <p className="resposta-de-antes"><span>Antes · {quandoFoi(anterior.data)}</span><strong>{anterior.valor}</strong></p>
}

/**
 * Uma pergunta da entrevista: número curto, área e o texto, com a resposta logo
 * abaixo. Registrar sem resposta continua possível, mas como ação discreta —
 * não é assim que se responde.
 */
export function QuestionCard({ question, targets, valueFor, registered, sameForAll = false, anteriorPara, onAnswer, onToggleRegistered }: QuestionCardProps) {
  const respondida = targets.some((target) => valueFor(target.id).trim())
  const juntos = sameForAll && targets.length > 1

  return (
    <article className="question-card">
      <p className="question-card__label">{questionNumber(question.code)}. {question.category}</p>
      <p className="question-card__text">{question.text}</p>
      {juntos
        ? <div className="question-card__answer">
            <small>Todos os presentes</small>
            <AnswerField
              question={question}
              value={valueFor(targets[0]?.id ?? '')}
              onChange={(valor) => { for (const target of targets) onAnswer(target.id, valor) }}
            />
            <RespostaDeAntes anterior={anteriorPara?.(targets[0]?.id ?? '')} />
          </div>
        : targets.map((target) => (
          <div className="question-card__answer" key={target.id}>
            {targets.length > 1 && <small>{target.label}</small>}
            <AnswerField question={question} value={valueFor(target.id)} onChange={(valor) => onAnswer(target.id, valor)} />
            <RespostaDeAntes anterior={anteriorPara?.(target.id)} />
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
