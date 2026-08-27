import type { InputHTMLAttributes } from 'react'

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  hint?: string | undefined
  error?: string | undefined
}

export function Field({ label, hint, error, id, className = '', ...props }: FieldProps) {
  const fieldId = id ?? props.name
  const descriptionId = `${fieldId}-description`
  return (
    <label className={`field ${className}`} htmlFor={fieldId}>
      <span className="field__label">{label}</span>
      <input
        id={fieldId}
        className="field__input"
        aria-invalid={Boolean(error)}
        aria-describedby={hint || error ? descriptionId : undefined}
        {...props}
      />
      {(hint || error) && <span id={descriptionId} className={error ? 'field__error' : 'field__hint'}>{error ?? hint}</span>}
    </label>
  )
}
