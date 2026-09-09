import { ArchiveRestore, ChevronRight, Cloud, GitCompare, Link2, LockKeyhole, Search, ShieldCheck, TriangleAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { guardarTema, temaGuardado, type Tema } from '../app/tema'
import { pedirPermissaoDeAviso } from '../tasks/useAvisosDeTarefa'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { formatStorage, requestPersistentStorage, storageStatus, type StorageStatus } from '../storage/persistence'

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
  const [tema, setTema] = useState<Tema>(() => temaGuardado())
  const [avisos, setAvisos] = useState<NotificationPermission>(() => typeof Notification === 'undefined' ? 'denied' : Notification.permission)
  const [armazenamento, setArmazenamento] = useState<StorageStatus | null>(null)
  function escolherTema(escolha: Tema) { setTema(escolha); guardarTema(escolha) }
  useEffect(() => { void storageStatus().then(setArmazenamento) }, [])

  return <div className="page-stack page-narrow"><header className="page-hero"><div><h1>Configurações</h1></div></header>
  {/*
    A preferência de tema fica neste aparelho, e não na conta: ela é sobre a
    tela que está na frente da pessoa. Seguir o aparelho continua sendo o
    padrão — a escolha existe para o púlpito com luz forte e para a visita à
    noite, quando o que o celular decidiu não serve.
  */}
  <Card title="Aparência">
    <div className="segmented" role="group" aria-label="Tema do aplicativo">
      <button type="button" className={tema === 'sistema' ? 'active' : ''} aria-pressed={tema === 'sistema'} onClick={() => escolherTema('sistema')}>Seguir o aparelho</button>
      <button type="button" className={tema === 'claro' ? 'active' : ''} aria-pressed={tema === 'claro'} onClick={() => escolherTema('claro')}>Claro</button>
      <button type="button" className={tema === 'escuro' ? 'active' : ''} aria-pressed={tema === 'escuro'} onClick={() => escolherTema('escuro')}>Escuro</button>
    </div>
  </Card>
  <Card title="Avisos de tarefa">
    <div className="private-summary"><div><span>Situação</span><strong>{avisos === 'granted' ? 'Permitidos' : avisos === 'denied' ? 'Bloqueados no aparelho' : 'Ainda não perguntado'}</strong></div></div>
    {avisos !== 'granted' && <Button variant="secondary" onClick={() => { void pedirPermissaoDeAviso().then(setAvisos) }}>Permitir avisos</Button>}
  </Card>
  <Card title="Onde ficam seus dados">
    <ul className="plain-list">
      <li>Tudo é gravado cifrado neste aparelho e abre com a sua senha.</li>
      <li>O backup é um arquivo cifrado que só você guarda e restaura.</li>
      <li>Com a sincronização ligada, o serviço recebe apenas conteúdo cifrado — ele não lê nomes, visitas nem anotações.</li>
    </ul>
    {armazenamento && <div className="private-summary"><div><span>Uso local</span><strong>{formatStorage(armazenamento.usage)}</strong></div><div><span>Espaço disponível</span><strong>{armazenamento.quota === null || armazenamento.usage === null ? 'Não informado' : formatStorage(Math.max(0, armazenamento.quota - armazenamento.usage))}</strong></div><div><span>Proteção contra limpeza automática</span><strong>{armazenamento.persisted ? 'Ativada' : armazenamento.supported ? 'Disponível' : 'Não oferecida neste navegador'}</strong></div></div>}
    {armazenamento?.supported && !armazenamento.persisted && <Button variant="secondary" onClick={() => { void requestPersistentStorage().then(setArmazenamento) }}>Proteger armazenamento neste aparelho</Button>}
  </Card>{groups.map((group) => <Card key={group.title} title={group.title}><div className="settings-list">{group.links.map(({ to, icon: Icon, title, detail }) => <Link to={to} key={to}><span><Icon /></span><div><strong>{title}</strong><small>{detail}</small></div><ChevronRight /></Link>)}</div></Card>)}</div>
}
