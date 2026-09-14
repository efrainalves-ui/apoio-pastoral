import {
  Boxes, BookOpen, Briefcase, CalendarClock, CalendarDays, CalendarRange, Church, CircleCheck, ClipboardList, Flag, HeartHandshake, Heart, House,
  Inbox, List, Megaphone, Repeat, ShoppingCart, Star, Bell, TriangleAlert, User, UserCheck, WalletCards, type LucideIcon,
} from 'lucide-react'
import type { AreaDaCentral, BlocoDaCentral } from '../../lembretes/central'
import type { CorDeLista, IconeDeLista } from '../../lembretes/types'

export const ICONE_DO_BLOCO: Record<BlocoDaCentral, LucideIcon> = {
  hoje: CalendarDays, proximos: CalendarClock, todos: Inbox, sinalizados: Flag, urgentes: TriangleAlert, concluidos: CircleCheck,
}

export const ICONE_DA_LISTA: Record<IconeDeLista, LucideIcon> = {
  pessoa: User, repetir: Repeat, carrinho: ShoppingCart, lista: List, coracao: Heart, livro: BookOpen,
  igreja: Church, casa: House, estrela: Star, sino: Bell, bandeira: Flag, maleta: Briefcase,
}

export const ROTULO_DO_ICONE: Record<IconeDeLista, string> = {
  pessoa: 'Pessoa', repetir: 'Repetição', carrinho: 'Carrinho', lista: 'Lista', coracao: 'Coração', livro: 'Livro',
  igreja: 'Igreja', casa: 'Casa', estrela: 'Estrela', sino: 'Sino', bandeira: 'Bandeira', maleta: 'Maleta',
}

export const ROTULO_DA_COR: Record<CorDeLista, string> = {
  vermelho: 'Vermelho', laranja: 'Laranja', amarelo: 'Amarelo', verde: 'Verde', turquesa: 'Turquesa',
  azul: 'Azul', indigo: 'Índigo', roxo: 'Roxo', rosa: 'Rosa', grafite: 'Grafite',
}

export const ICONE_DA_AREA: Record<AreaDaCentral, LucideIcon> = {
  visitacao: HeartHandshake, comissoes: ClipboardList, nomeacoes: UserCheck, evangelismo: Megaphone,
  planejamento: CalendarRange, agenda: CalendarDays, orcamento: WalletCards, materiais: Boxes,
}
