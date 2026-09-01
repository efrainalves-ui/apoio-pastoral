import { ArchiveRestore, BookHeart, Cake, CalendarRange, ChevronRight, Cloud, FileText, FileUp, GitCompare, Heart, HeartHandshake, Library, LockKeyhole, Megaphone, Search, ShieldCheck, UsersRound, WalletCards } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Card } from '../components/ui/Card'

const groups = [
  { title: 'Pessoas e cuidado', links: [
    { to: '/app/familias', icon: UsersRound, title: 'Famílias', detail: 'Organize os lares do distrito' },
    { to: '/app/cuidados', icon: HeartHandshake, title: 'Cuidados pastorais', detail: 'Pedidos, tarefas e rodadas' },
    { to: '/app/pedidos-oracao', icon: Heart, title: 'Pedidos de Oração', detail: 'Acompanhe pedidos recebidos' },
    { to: '/app/aniversarios', icon: Cake, title: 'Aniversários', detail: 'Acompanhe as próximas datas' },
    { to: '/app/pessoas/importar', icon: FileUp, title: 'Importar pessoas', detail: 'Revise e organize os cadastros' },
    { to: '/app/fidelidade', icon: ShieldCheck, title: 'Fidelidade', detail: 'Visão particular do pastor' },
  ] },
  { title: 'Missão e planejamento', links: [
    { to: '/app/planejamento', icon: CalendarRange, title: 'Planejamento Anual', detail: 'Organize metas e ações do ano' },
    { to: '/app/evangelismo', icon: Megaphone, title: 'Evangelismo', detail: 'Planeje campanhas e acompanhamentos' },
    { to: '/app/missionario', icon: BookHeart, title: 'Interessados e estudos bíblicos', detail: 'Acompanhe cada pessoa' },
    { to: '/app/missionario/duplas', icon: UsersRound, title: 'Duplas missionárias', detail: 'Organize as duplas por igreja' },
    { to: '/app/missionario/grupos', icon: UsersRound, title: 'Escola Sabatina, PG e UAPG', detail: 'Classes e grupos' },
    { to: '/app/relatorios', icon: FileText, title: 'Relatórios', detail: 'Prepare os relatórios do distrito' },
  ] },
  { title: 'Área pessoal', links: [
    { to: '/app/leitura', icon: Library, title: 'Leitura', detail: 'Livros, páginas e metas pessoais' },
    { to: '/app/orcamento', icon: WalletCards, title: 'Orçamento Familiar', detail: 'Organização financeira da família' },
  ] },
  { title: 'Dados e acesso', links: [
    { to: '/app/busca', icon: Search, title: 'Busca', detail: 'Encontre informações rapidamente' },
    { to: '/app/backup', icon: ArchiveRestore, title: 'Backup', detail: 'Criar ou restaurar uma cópia' },
    { to: '/app/seguranca', icon: LockKeyhole, title: 'Segurança', detail: 'Senha e dispositivos' },
    { to: '/app/sincronizacao', icon: Cloud, title: 'Sincronização', detail: 'Acompanhe suas atualizações' },
    { to: '/app/sincronizacao/conflitos', icon: GitCompare, title: 'Revisar alterações concorrentes', detail: 'Escolha o que fica quando dois aparelhos mudam o mesmo registro' },
    { to: '/app/visitas', icon: HeartHandshake, title: 'Visitas e cuidados', detail: 'Rodadas, acompanhamentos e visitas' },
  ] },
]

export function MorePage() {
  return <div className="page-stack page-narrow"><header className="page-hero"><div><p className="eyebrow">Recursos</p><h1>Mais</h1><p>Encontre as ferramentas do seu distrito em um só lugar.</p></div></header>{groups.map((group) => <Card key={group.title} title={group.title}><div className="settings-list">{group.links.map(({ to, icon: Icon, title, detail }) => <Link to={to} key={to}><span><Icon /></span><div><strong>{title}</strong><small>{detail}</small></div><ChevronRight /></Link>)}</div></Card>)}</div>
}
