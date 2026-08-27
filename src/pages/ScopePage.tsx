import { CalendarDays, Construction } from 'lucide-react'
import { Card } from '../components/ui/Card'

const content = {
  agenda: { icon: CalendarDays, title: 'Agenda', detail: 'Compromissos, folga e conflitos fazem parte da organização do distrito.' },
}

export function ScopePage({ area }: { area: keyof typeof content }) {
  const { icon: Icon, title, detail } = content[area]
  return <div className="scope-page"><Card><div className="scope-icon"><Icon /></div><p className="eyebrow">Escopo protegido</p><h1>{title}</h1><p>{detail}</p><div className="scope-note"><Construction />A fundação está pronta, mas nenhuma regra de produto desta área foi antecipada no Marco 0.</div></Card></div>
}
