import { ArchiveRestore, ChevronRight, Cloud, GitCompare, LockKeyhole, Search } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Card } from '../components/ui/Card'

const groups = [
  { title: 'Dados e acesso', links: [
    { to: '/app/busca', icon: Search, title: 'Busca', detail: 'Encontre informações rapidamente' },
    { to: '/app/backup', icon: ArchiveRestore, title: 'Backup', detail: 'Criar ou restaurar uma cópia' },
    { to: '/app/seguranca', icon: LockKeyhole, title: 'Segurança', detail: 'Senha e dispositivos' },
    { to: '/app/sincronizacao', icon: Cloud, title: 'Sincronização', detail: 'Acompanhe suas atualizações' },
    { to: '/app/sincronizacao/conflitos', icon: GitCompare, title: 'Revisar alterações concorrentes', detail: 'Escolha o que fica quando dois aparelhos mudam o mesmo registro' },
  ] },
]

export function MorePage() {
  return <div className="page-stack page-narrow"><header className="page-hero"><div><h1>Configurações</h1></div></header>{groups.map((group) => <Card key={group.title} title={group.title}><div className="settings-list">{group.links.map(({ to, icon: Icon, title, detail }) => <Link to={to} key={to}><span><Icon /></span><div><strong>{title}</strong><small>{detail}</small></div><ChevronRight /></Link>)}</div></Card>)}</div>
}
