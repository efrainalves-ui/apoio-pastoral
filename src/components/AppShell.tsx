import {
  CalendarDays,
  BookOpen,
  HeartHandshake,
  Church,
  Home,
  LockKeyhole,
  LogOut,
  Menu,
  Settings,
  ShieldCheck,
  Flag,
  ClipboardList,
  Library,
  Boxes,
  WalletCards,
  CalendarRange,
  Megaphone,
  X,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuthVault } from '../auth/AuthVaultContext'
import { isHomologationEnvironment } from '../sync/config'
import { QuickActions } from './QuickActions'
import { SyncNowButton } from './SyncNowButton'
import { Button } from './ui/Button'

const primaryNav = [
  { to: '/app', label: 'Início', icon: Home, end: true },
  { to: '/app/agenda', label: 'Agenda', icon: CalendarDays },
  { to: '/app/distrito', label: 'Distrito', icon: Church },
  { to: '/app/visitacao', label: 'Visitação', icon: HeartHandshake },
  { to: '/app/sermoes', label: 'Sermões', icon: BookOpen },
  { to: '/app/metas', label: 'Metas', icon: Flag },
  { to: '/app/planejamento', label: 'Planejamento Anual', icon: CalendarRange },
  { to: '/app/evangelismo', label: 'Evangelismo', icon: Megaphone },
  { to: '/app/comissoes', label: 'Comissões', icon: ClipboardList },
  { to: '/app/materiais', label: 'Materiais', icon: Boxes },
  { to: '/app/fidelidade', label: 'Fidelidade', icon: ShieldCheck },
  { to: '/app/leitura', label: 'Leitura', icon: Library, personal: true },
  { to: '/app/orcamento', label: 'Orçamento', icon: WalletCards, personal: true },
]

// Quatro entradas, nesta ordem, com rótulos curtos para caber no celular.
// Membros e famílias ficam dentro da igreja, em Distrito; as configurações
// ficam no ícone de engrenagem, ao lado de Sair.
const mobileNav = [
  { to: '/app', label: 'Início', icon: Home, end: true },
  { to: '/app/agenda', label: 'Agenda', icon: CalendarDays, end: false },
  { to: '/app/distrito', label: 'Distrito', icon: Church, end: false },
  { to: '/app/visitacao', label: 'Visitação', icon: HeartHandshake, end: false },
]

export function AppShell() {
  const { account, lock, signOut } = useAuthVault()
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [pathname])

  /**
   * Sair encerra a sessão no serviço, não só fecha o cofre. Sem isso, o
   * aparelho continuava autenticado depois de o pastor achar que tinha saído —
   * o que importa em computador emprestado ou aparelho compartilhado.
   */
  function leave() {
    if (!window.confirm('Sair encerra sua sessão neste aparelho. Para voltar, você entra de novo com e-mail e senha. Deseja sair?')) return
    void signOut()
  }

  /** Fechar o cofre sem sair: volta com a senha, sem entrar de novo. */
  function bloquear() {
    lock()
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
          <div className="sidebar__footer-actions">
            <NavLink className="icon-button sidebar__settings" to="/app/configuracoes" aria-label="Configurações" onClick={() => setOpen(false)}><Settings /></NavLink>
            <button type="button" className="icon-button sidebar__settings" onClick={bloquear} aria-label="Bloquear cofre" title="Bloquear cofre"><LockKeyhole /></button>
            <Button variant="secondary" onClick={leave} icon={<LogOut size={18} />}>Sair</Button>
          </div>
        </div>
      </aside>
      {open && <button className="sidebar-backdrop" aria-label="Fechar menu" onClick={() => setOpen(false)} />}
      <div className="app-main">
        <header className="app-header">
          <button className="icon-button app-header__menu" aria-label="Abrir menu" onClick={() => setOpen(true)}><Menu /></button>
          <span className="app-header__brand">Apoio Pastoral</span>
          {isHomologationEnvironment && <span className="app-header__env" title="Ambiente de testes com dados fictícios">Homologação</span>}
          <div className="app-header__actions">
            <QuickActions />
            <SyncNowButton compact />
          </div>
          <NavLink className="icon-button app-header__settings" to="/app/configuracoes" aria-label="Configurações"><Settings /></NavLink>
          <button className="icon-button app-header__leave" aria-label="Bloquear cofre" onClick={bloquear}><LockKeyhole /></button>
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
