import {
  CalendarDays,
  BookOpen,
  HeartHandshake,
  Church,
  Home,
  LogOut,
  Menu,
  MoreHorizontal,
  ShieldCheck,
  Users,
  Flag,
  ClipboardList,
  Heart,
  Library,
  WalletCards,
  CalendarRange,
  Megaphone,
  X,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuthVault } from '../auth/AuthVaultContext'
import { GlobalSearchField } from './GlobalSearchField'
import { QuickActions } from './QuickActions'
import { Button } from './ui/Button'

const primaryNav = [
  { to: '/app', label: 'Início', icon: Home, end: true },
  { to: '/app/agenda', label: 'Agenda', icon: CalendarDays },
  { to: '/app/distrito', label: 'Distrito e igrejas', icon: Church },
  { to: '/app/pessoas', label: 'Pessoas e famílias', icon: Users },
  { to: '/app/visitas', label: 'Visitas e cuidados', icon: HeartHandshake },
  { to: '/app/pedidos-oracao', label: 'Pedidos de Oração', icon: Heart },
  { to: '/app/sermoes', label: 'Sermões', icon: BookOpen },
  { to: '/app/metas', label: 'Metas', icon: Flag },
  { to: '/app/planejamento', label: 'Planejamento Anual', icon: CalendarRange },
  { to: '/app/evangelismo', label: 'Evangelismo', icon: Megaphone },
  { to: '/app/comissoes', label: 'Comissões', icon: ClipboardList },
  { to: '/app/leitura', label: 'Leitura', icon: Library, personal: true },
  { to: '/app/orcamento', label: 'Orçamento Familiar', icon: WalletCards, personal: true },
  { to: '/app/mais', label: 'Mais', icon: MoreHorizontal },
]

// A Bíblia do Produto define estas cinco entradas, nesta ordem, com rótulos
// curtos para caber no celular. Visitas e cuidados continua a um toque pelo
// Início, por "Mais" e pelos vínculos de cada pessoa e família.
const mobileNav = [
  { to: '/app', label: 'Início', icon: Home, end: true },
  { to: '/app/agenda', label: 'Agenda', icon: CalendarDays, end: false },
  { to: '/app/pessoas', label: 'Pessoas', icon: Users, end: false },
  { to: '/app/distrito', label: 'Distrito', icon: Church, end: false },
  { to: '/app/mais', label: 'Mais', icon: MoreHorizontal, end: false },
]

export function AppShell() {
  const { account, lock } = useAuthVault()
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [pathname])

  function leave() {
    if (window.confirm('Deseja sair do Apoio Pastoral neste dispositivo?')) lock()
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${open ? 'sidebar--open' : ''}`} aria-label="Navegação principal">
        <div className="brand">
          <div className="brand__mark" aria-hidden="true"><ShieldCheck /></div>
          <div><strong>Apoio Pastoral</strong></div>
          <button className="icon-button sidebar__close" onClick={() => setOpen(false)} aria-label="Fechar menu"><X /></button>
        </div>
        <nav className="sidebar__nav">
          {primaryNav.map(({ to, label, icon: Icon, end, personal }) => (
            <NavLink key={to} to={to} {...(end ? { end: true } : {})} onClick={() => setOpen(false)} className={({ isActive }) => `nav-item ${personal ? 'nav-item--personal' : ''} ${isActive ? 'nav-item--active' : ''}`}>
              <Icon aria-hidden="true" /> <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar__footer">
          <div className="account-chip"><span>{account?.email}</span></div>
          <Button variant="secondary" full onClick={leave} icon={<LogOut size={18} />}>Sair</Button>
        </div>
      </aside>
      {open && <button className="sidebar-backdrop" aria-label="Fechar menu" onClick={() => setOpen(false)} />}
      <div className="app-main">
        <header className="app-header">
          <button className="icon-button app-header__menu" aria-label="Abrir menu" onClick={() => setOpen(true)}><Menu /></button>
          <span className="app-header__brand">Apoio Pastoral</span>
          <GlobalSearchField />
          <QuickActions />
          <button className="icon-button app-header__leave" aria-label="Sair" onClick={leave}><LogOut /></button>
        </header>
        <main id="conteudo" className="content" tabIndex={-1}><Outlet /></main>
        <nav className="bottom-nav" aria-label="Navegação principal móvel">
          {mobileNav.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} {...(end ? { end: true } : {})} className={({ isActive }) => `bottom-nav__item ${isActive ? 'bottom-nav__item--active' : ''}`}>
              <Icon aria-hidden="true" /><span>{label}</span>
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  )
}
