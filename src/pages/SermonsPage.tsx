import { BookOpen, Plus, Search, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuthVault } from '../auth/AuthVaultContext'
import { Card } from '../components/ui/Card'
import { SermonService } from '../sermons/service'
import { SERMON_STATUS_LABELS, type SermonEntity, type SermonStatus } from '../sermons/types'

const sermonsService = new SermonService()

export function SermonsPage() {
  const { account, masterKey } = useAuthVault()
  const [sermons, setSermons] = useState<SermonEntity[]>([])
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<SermonStatus | ''>('')
  const [error, setError] = useState('')
  const load = useCallback(async () => { if (account && masterKey) setSermons(await sermonsService.list(account.id, masterKey)) }, [account, masterKey])
  useEffect(() => { void load() }, [load])
  const visible = sermons.filter((sermon) => (!status || sermon.status === status) && `${sermon.title} ${sermon.theme} ${sermon.mainText} ${sermon.tags.join(' ')}`.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR')))
  async function remove(sermon: SermonEntity) { if (!account || !masterKey || !window.confirm('Remover este sermão? O histórico de pregações continuará preservado.')) return; try { await sermonsService.remove(account.id, masterKey, sermon.id); await load() } catch { setError('Não foi possível remover o sermão.') } }
  return <div className="page-stack"><header className="page-hero"><div><p className="eyebrow">Sermões</p><h1>Sermões e pregações</h1><p>Organize seus sermões e pregações.</p></div><Link className="button" to="/app/sermoes/novo"><Plus />Novo sermão</Link></header>{error && <div className="alert alert--error" role="alert">{error}</div>}<Card><div className="filter-bar"><label className="field search-only"><span className="field__label">Pesquisar</span><span className="search-input"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} /></span></label><label className="field"><span className="field__label">Situação</span><select className="field__input" value={status} onChange={(event) => setStatus(event.target.value as SermonStatus | '')}><option value="">Todas</option>{Object.entries(SERMON_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>{!visible.length ? <div className="empty-state"><BookOpen /><strong>Nenhum sermão encontrado</strong><Link className="button" to="/app/sermoes/novo">Criar sermão</Link></div> : <div className="entity-list">{visible.map((sermon) => <div className="entity-row" key={sermon.id}><span className="avatar"><BookOpen /></span><Link to={`/app/sermoes/${sermon.id}`}><strong>{sermon.title}</strong><small>{sermon.theme || 'Sem tema'} · {sermon.mainText}</small><small>{sermon.tags.join(' · ')}</small></Link><span className="entity-badge">{SERMON_STATUS_LABELS[sermon.status]}</span><button className="icon-button danger-icon" aria-label={`Remover ${sermon.title}`} onClick={() => void remove(sermon)}><Trash2 /></button></div>)}</div>}</Card></div>
}
