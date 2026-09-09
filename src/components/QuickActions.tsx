import { BookOpen, CalendarPlus, Church, ClipboardList, Heart, HeartHandshake, Megaphone, Plus, RotateCcw, SquareCheck, UserRound, UsersRound } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'

const actions = [
  { to: '/app/agenda/novo', label: 'Novo compromisso', icon: CalendarPlus },
  { to: '/app/visitas/nova', label: 'Nova visita', icon: HeartHandshake },
  { to: '/app/pessoas/nova', label: 'Nova pessoa', icon: UserRound },
  { to: '/app/familias/nova', label: 'Nova família', icon: UsersRound },
  { to: '/app/visitacao?aba=oracao', label: 'Novo pedido de oração', icon: Heart },
  { to: '/app/visitacao?aba=acompanhamentos&novo=1', label: 'Novo acompanhamento', icon: RotateCcw },
  { to: '/app/visitacao?aba=tarefas', label: 'Nova tarefa', icon: SquareCheck },
  { to: '/app/sermoes/novo', label: 'Novo sermão', icon: BookOpen },
  { to: '/app/evangelismo/nova', label: 'Nova campanha', icon: Megaphone },
  { to: '/app/comissoes', label: 'Nova reunião', icon: ClipboardList },
  { to: '/app/distrito/igrejas/nova', label: 'Nova igreja', icon: Church },
]

export function QuickActions() {
  const [open, setOpen] = useState(false)
  const container = useRef<HTMLDivElement>(null)
  const { pathname } = useLocation()

  useEffect(() => { setOpen(false) }, [pathname])

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: MouseEvent) {
      if (!container.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div className="quick-actions" ref={container}>
      <button
        type="button"
        className="quick-actions__trigger"
        aria-label="Criar"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Plus aria-hidden="true" />
      </button>
      {open && (
        <nav className="quick-actions__menu" aria-label="Criar">
          {actions.map(({ to, label, icon: Icon }) => (
            <Link key={label} to={to} onClick={() => setOpen(false)}>
              <Icon aria-hidden="true" />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
      )}
    </div>
  )
}
