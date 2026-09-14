import { Bell } from 'lucide-react'

/** Substituído pelo painel de push; até lá, a Central não mostra estado de notificação. */
export function PainelDeNotificacoes() {
  return <span hidden><Bell aria-hidden="true" /></span>
}
