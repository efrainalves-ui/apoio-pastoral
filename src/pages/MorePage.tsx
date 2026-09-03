import { ArchiveRestore, ChevronRight, Cloud, GitCompare, Link2, LockKeyhole, Search, ShieldCheck, TriangleAlert } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Card } from '../components/ui/Card'

const groups = [
  { title: 'Privacidade e dados', links: [
    { to: '/app/configuracoes/privacidade', icon: ShieldCheck, title: 'Privacidade', detail: 'Como o aplicativo cuida dos dados do seu distrito' },
    { to: '/app/configuracoes/encerrar-distrito', icon: TriangleAlert, title: 'Encerrar distrito', detail: 'Apaga os dados do distrito e mantém a conta e suas áreas pessoais' },
  ] },
  { title: 'Referências', links: [
    { to: '/app/links', icon: Link2, title: 'Links úteis', detail: 'Endereços oficiais e material de apoio' },
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
  return <div className="page-stack page-narrow"><header className="page-hero"><div><h1>Configurações</h1></div></header><Card title="Onde ficam seus dados">
    <ul className="plain-list">
      <li>Tudo é gravado cifrado neste aparelho e abre com a sua senha.</li>
      <li>O backup é um arquivo cifrado que só você guarda e restaura.</li>
      <li>Com a sincronização ligada, o serviço recebe apenas conteúdo cifrado — ele não lê nomes, visitas nem anotações.</li>
    </ul>
  </Card>{groups.map((group) => <Card key={group.title} title={group.title}><div className="settings-list">{group.links.map(({ to, icon: Icon, title, detail }) => <Link to={to} key={to}><span><Icon /></span><div><strong>{title}</strong><small>{detail}</small></div><ChevronRight /></Link>)}</div></Card>)}</div>
}
