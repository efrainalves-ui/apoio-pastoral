import { CalendarDays } from 'lucide-react'
import { useRef, type InputHTMLAttributes, type MouseEvent } from 'react'

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  hint?: string | undefined
  error?: string | undefined
}

export function Field({ label, hint, error, id, className = '', onClick, ...props }: FieldProps) {
  const fieldId = id ?? props.name
  const descriptionId = `${fieldId}-description`
  const campo = useRef<HTMLInputElement>(null)

  /*
    O campo de data ganha um botão de calendário.

    O ícone que o navegador desenha sozinho tem poucos pixels, aparece em uns
    navegadores e não em outros, e some no tema escuro. Este botão é sempre o
    mesmo, tem área de toque de dedo e abre o calendário do próprio navegador
    (`showPicker`) — não é um calendário nosso. A data continua podendo ser
    digitada, e continua sendo escrita e lida como sempre.
  */
  const comCalendario = props.type === 'date' && !props.readOnly && !props.disabled

  function abrirCalendario() {
    const alvo = campo.current
    if (!alvo) return
    alvo.focus()
    try { alvo.showPicker() } catch { /* navegador sem o comando: o campo continua aceitando o que for digitado */ }
  }

  function aoClicar(evento: MouseEvent<HTMLInputElement>) {
    onClick?.(evento)
    if (comCalendario) abrirCalendario()
  }

  const entrada = <input
    id={fieldId}
    ref={campo}
    className="field__input"
    aria-invalid={Boolean(error)}
    aria-describedby={hint || error ? descriptionId : undefined}
    onClick={aoClicar}
    {...props}
  />

  return (
    <label className={`field ${className}`} htmlFor={fieldId}>
      <span className="field__label">{label}</span>
      {comCalendario
        ? <span className="field__com-calendario">
          {entrada}
          <button type="button" className="field__calendario" aria-label={`Abrir calendário de ${label}`} onClick={abrirCalendario}>
            <CalendarDays aria-hidden="true" />
          </button>
        </span>
        : entrada}
      {(hint || error) && <span id={descriptionId} className={error ? 'field__error' : 'field__hint'}>{error ?? hint}</span>}
    </label>
  )
}
