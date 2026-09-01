import { ClipboardCopy, RotateCcw, Save } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from './ui/Button'

interface TemplateEditorProps {
  label: string
  hint?: string
  value: string
  disabled?: boolean
  onSave: (text: string) => void
  onRestore: () => void
  onCopy: (text: string) => void
}

/**
 * Modelo de documento editável: mostra o texto pastoral padrão, deixa o pastor
 * reescrever à vontade e guardar. Restaurar volta ao padrão sem perder nada
 * além do próprio texto substituído.
 */
export function TemplateEditor({ label, hint, value, disabled = false, onSave, onRestore, onCopy }: TemplateEditorProps) {
  const [draft, setDraft] = useState(value)

  useEffect(() => { setDraft(value) }, [value])

  return (
    <div className="template-editor">
      <label className="field">
        <span className="field__label">{label}</span>
        {hint && <small className="field__hint">{hint}</small>}
        <textarea
          className="field__input field__textarea template-editor__text"
          rows={14}
          value={draft}
          disabled={disabled}
          onChange={(event) => setDraft(event.target.value)}
        />
      </label>
      <div className="form-actions no-print">
        <Button disabled={disabled || draft === value} onClick={() => onSave(draft)} icon={<Save />}>Salvar modelo</Button>
        <Button variant="secondary" disabled={disabled} onClick={onRestore} icon={<RotateCcw />}>Restaurar padrão</Button>
        <Button variant="secondary" onClick={() => onCopy(draft)} icon={<ClipboardCopy />}>Copiar</Button>
      </div>
    </div>
  )
}
