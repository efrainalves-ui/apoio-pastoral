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

  /*
    O rótulo é um `label` ligado pelo `htmlFor`, e não uma etiqueta em volta de
    tudo. Envolvendo, ele rotularia também o botão do calendário: procurar o
    campo "Data de início" acharia dois elementos, e quem usa leitor de tela
    ouviria o botão com o nome do campo.
  */
  return (
    <div className={`field ${className}`}>
      <label className="field__label" id={`${fieldId}-label`} htmlFor={fieldId}>{label}</label>
      {comCalendario
        ? <span className="field__com-calendario">
          {entrada}
          {/*
            O nome do botão é curto, e o campo vem pela descrição.

            Com o nome do campo dentro do nome do botão — "Abrir calendário de
            Data de início" —, procurar o campo pelo rótulo achava os dois.
          */}
          <button
            type="button"
            className="field__calendario"
            aria-label="Abrir calendário"
            aria-describedby={`${fieldId}-label`}
            onClick={abrirCalendario}
          >
            <CalendarDays aria-hidden="true" />
          </button>
        </span>
        : entrada}
      {(hint || error) && <span id={descriptionId} className={error ? 'field__error' : 'field__hint'}>{error ?? hint}</span>}
    </div>
  )
}
