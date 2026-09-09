import { Search } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'

/** Busca do cabeçalho: leva o termo para a Busca global, que procura só neste dispositivo. */
export function GlobalSearchField() {
  const [term, setTerm] = useState('')
  const navigate = useNavigate()

  function submit(event: FormEvent) {
    event.preventDefault()
    const value = term.trim()
    void navigate(value ? `/app/busca?termo=${encodeURIComponent(value)}` : '/app/busca')
  }

  return (
    <form className="app-header__search" role="search" onSubmit={submit}>
      <Search aria-hidden="true" />
      <input
        type="search"
        aria-label="Buscar pessoa, família, igreja ou compromisso"
        placeholder="Buscar pessoa, família, igreja ou compromisso"
        value={term}
        onChange={(event) => setTerm(event.target.value)}
      />
    </form>
  )
}
