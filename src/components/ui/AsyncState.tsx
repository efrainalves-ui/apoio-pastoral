import { AlertTriangle, Inbox, LoaderCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from './Button'

interface StateProps {
  title: string
  detail?: string
  icon?: ReactNode
}

export function LoadingState({ title, detail }: StateProps) {
  return <div className="empty-state" role="status"><LoaderCircle className="spin" /><strong>{title}</strong>{detail && <span>{detail}</span>}</div>
}

export function EmptyState({ title, detail, icon = <Inbox /> }: StateProps) {
  return <div className="empty-state">{icon}<strong>{title}</strong>{detail && <span>{detail}</span>}</div>
}

export function ErrorState({ title, detail, retry }: StateProps & { retry?: () => void }) {
  return <div className="empty-state" role="alert"><AlertTriangle /><strong>{title}</strong>{detail && <span>{detail}</span>}{retry && <Button variant="secondary" onClick={retry}>Tentar novamente</Button>}</div>
}
