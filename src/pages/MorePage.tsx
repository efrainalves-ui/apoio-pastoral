import { ArchiveRestore, BookHeart, Cake, ChevronRight, Cloud, FileText, GitCompare, LockKeyhole, Search, UsersRound } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Card } from '../components/ui/Card'

const groups = [
  { title: 'Pessoas', links: [
    { to: '/app/aniversarios', icon: Cake, title: 'Aniversários', detail: 'Acompanhe as próximas datas' },
  ] },
  { title: 'Missão e relatórios', links: [
    { to: '/app/missionario', icon: BookHeart, title: 'Interessados e estudos bíblicos', detail: 'Acompanhe cada pessoa' },
    { to: '/app/missionario/duplas', icon: UsersRound, title: 'Duplas missionárias', detail: 'Organize as duplas por igreja' },
    { to: '/app/missionario/grupos', icon: UsersRound, title: 'Escola Sabatina, PG e UAPG', detail: 'Classes e grupos' },
    { to: '/app/relatorios', icon: FileText, title: 'Relatórios', detail: 'Prepare os relatórios do distrito' },
  ] },
  { title: 'Dados e acesso', links: [
    { to: '/app/busca', icon: Search, title: 'Busca', detail: 'Encontre informações rapidamente' },
    { to: '/app/backup', icon: ArchiveRestore, title: 'Backup', detail: 'Criar ou restaurar uma cópia' },
    { to: '/app/seguranca', icon: LockKeyhole, title: 'Segurança', detail: 'Senha e dispositivos' },
    { to: '/app/sincronizacao', icon: Cloud, title: 'Sincronização', detail: 'Acompanhe suas atualizações' },
    { to: '/app/sincronizacao/conflitos', icon: GitCompare, title: 'Revisar alterações concorrentes', detail: 'Escolha o que fica quando dois aparelhos mudam o mesmo registro' },
  ] },
]

export function MorePage() {
  return <div className="page-stack page-narrow"><header className="page-hero"><div><p className="eyebrow">Recursos</p><h1>Mais</h1><p>Módulos que ficam fora do menu principal.</p></div></header>{groups.map((group) => <Card key={group.title} title={group.title}><div className="settings-list">{group.links.map(({ to, icon: Icon, title, detail }) => <Link to={to} key={to}><span><Icon /></span><div><strong>{title}</strong><small>{detail}</small></div><ChevronRight /></Link>)}</div></Card>)}</div>
}
