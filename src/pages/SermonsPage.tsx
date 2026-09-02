import { BookOpen, FileText, MapPin, Plus, Search, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuthVault } from '../auth/AuthVaultContext'
import { PreachingPanel } from '../components/PreachingPanel'
import { Card } from '../components/ui/Card'
import { AgendaService } from '../agenda/service'
import type { AgendaEventEntity } from '../agenda/types'
import { Button } from '../components/ui/Button'
import { DistrictService } from '../district/service'
import type { ChurchEntity } from '../district/types'
import { sermonReportLines } from '../reports/areaReports'
import { previewLocalPdf } from '../reports/localPdf'
import { SermonService } from '../sermons/service'
import { SERMON_STATUS_LABELS, type SermonEntity, type SermonStatus } from '../sermons/types'

const sermonsService = new SermonService()
const agendaService = new AgendaService()
const districtService = new DistrictService()

export function SermonsPage() {
  const { account, masterKey } = useAuthVault()
  const [preachingSermon, setPreachingSermon] = useState<SermonEntity | null>(null)
  const [sermons, setSermons] = useState<SermonEntity[]>([])
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<SermonStatus | ''>('')
  const [error, setError] = useState('')
  const [preachings, setPreachings] = useState<AgendaEventEntity[]>([])
  const [churches, setChurches] = useState<ChurchEntity[]>([])
  const load = useCallback(async () => {
    if (!account || !masterKey) return
    const district = await districtService.getDistrict(account.id, masterKey)
    const [lista, eventos, igrejas] = await Promise.all([
      sermonsService.list(account.id, masterKey),
      agendaService.listEvents(account.id, masterKey),
      district ? districtService.listChurches(account.id, masterKey, district.id) : [],
    ])
    setSermons(lista)
    setPreachings(eventos.filter((event) => event.category === 'preaching').sort((a, b) => b.startAt.localeCompare(a.startAt)))
    setChurches(igrejas)
  }, [account, masterKey])
  useEffect(() => { void load() }, [load])
  const visible = sermons.filter((sermon) => (!status || sermon.status === status) && `${sermon.title} ${sermon.theme} ${sermon.mainText} ${sermon.tags.join(' ')}`.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR')))
  async function remove(sermon: SermonEntity) { if (!account || !masterKey || !window.confirm('Remover este sermão? O histórico de pregações continuará preservado.')) return; try { await sermonsService.remove(account.id, masterKey, sermon.id); await load() } catch { setError('Não foi possível remover o sermão.') } }
  return <div className="page-stack"><header className="page-hero"><div><p className="eyebrow">Sermões</p><h1>Sermões e pregações</h1><p>Organize seus sermões e pregações.</p></div><div className="page-actions"><Button variant="secondary" icon={<FileText />} onClick={() => previewLocalPdf('Sermões e Pregações', sermonReportLines(preachings, sermons.length, (id) => churches.find((church) => church.id === id)?.name ?? 'Distrito'))}>Histórico de pregações</Button><Link className="button" to="/app/sermoes/novo"><Plus />Novo sermão</Link></div></header>{error && <div className="alert alert--error" role="alert">{error}</div>}<Card><div className="filter-bar"><label className="field search-only"><span className="field__label">Pesquisar</span><span className="search-input"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} /></span></label><label className="field"><span className="field__label">Situação</span><select className="field__input" value={status} onChange={(event) => setStatus(event.target.value as SermonStatus | '')}><option value="">Todas</option>{Object.entries(SERMON_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>{!visible.length ? <div className="empty-state"><BookOpen /><strong>Nenhum sermão encontrado</strong><Link className="button" to="/app/sermoes/novo">Criar sermão</Link></div> : <div className="sermon-list">{visible.map((sermon) => <article className="sermon-row" key={sermon.id}>
      <span className="sermon-row__icon"><BookOpen /></span>
      <Link className="sermon-row__main" to={`/app/sermoes/${sermon.id}`}>
        <strong>{sermon.title}</strong>
        <small>{[sermon.theme || 'Sem tema', sermon.mainText].filter(Boolean).join(' · ')}</small>
        {sermon.tags.length > 0 && <small className="sermon-row__tags">{sermon.tags.join(' · ')}</small>}
      </Link>
      <div className="sermon-row__actions">
        <button type="button" className="button button--secondary sermon-row__where" onClick={() => setPreachingSermon(sermon)}><MapPin aria-hidden="true" />Onde pregou</button>
        <span className="entity-badge">{SERMON_STATUS_LABELS[sermon.status]}</span>
        <button className="icon-button danger-icon" aria-label={`Remover ${sermon.title}`} onClick={() => void remove(sermon)}><Trash2 /></button>
      </div>
    </article>)}</div>}</Card>{preachingSermon && <PreachingPanel sermon={preachingSermon} onClose={() => setPreachingSermon(null)} />}</div>
}
