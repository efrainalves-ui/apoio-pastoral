import { CheckCircle2, CircleAlert, CloudOff } from 'lucide-react'

export function StatusPill({ tone = 'success', children }: { tone?: 'success' | 'warning' | 'offline'; children: string }) {
  const Icon = tone === 'success' ? CheckCircle2 : tone === 'offline' ? CloudOff : CircleAlert
  return <span className={`status-pill status-pill--${tone}`}><Icon aria-hidden="true" size={16} />{children}</span>
}
