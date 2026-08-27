import { Cake, FileUp, Search, UsersRound } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuthVault } from '../auth/AuthVaultContext'
import { Card } from '../components/ui/Card'
import { DistrictService } from '../district/service'
import type { ChurchEntity } from '../district/types'
import { calculateAge } from '../people/dates'
import { PeopleService } from '../people/service'
import { IMPORT_STATUS_LABELS, PASTORAL_STATUS_LABELS, type PersonEntity } from '../people/types'
import { normalizePersonName } from '../people/validation'

const service = new PeopleService(); const districtService = new DistrictService()

export function PeoplePage() {
  const [searchParams] = useSearchParams()
  const { account, masterKey } = useAuthVault(); const [people, setPeople] = useState<PersonEntity[]>([]); const [churches, setChurches] = useState<ChurchEntity[]>([])
  const [query, setQuery] = useState(''); const [churchId, setChurchId] = useState(searchParams.get('church') ?? ''); const [loading, setLoading] = useState(true); const [error, setError] = useState('')
  const load = useCallback(async () => { if (!account || !masterKey) return; setLoading(true); try { const district = await districtService.getDistrict(account.id, masterKey); setPeople(await service.listPeople(account.id, masterKey)); setChurches(district ? await districtService.listChurches(account.id, masterKey, district.id) : []) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível abrir as pessoas.') } finally { setLoading(false) } }, [account, masterKey])
  useEffect(() => { void load() }, [load])
  const filtered = useMemo(() => people.filter((person) => (!churchId || person.currentChurchId === churchId) && (!query || normalizePersonName(person.name).includes(normalizePersonName(query)))), [people, churchId, query])
  const churchName = (id: string) => churches.find((church) => church.id === id)?.name ?? 'Igreja não encontrada'
  if (loading) return <div className="app-loading" role="status">Abrindo pessoas…</div>
  return <div className="page-stack"><header className="page-hero"><div><p className="eyebrow">Pessoas</p><h1>Pessoas</h1><p>Cadastre e acompanhe pessoas e famílias.</p></div><div className="page-actions"><Link className="button button--secondary" to="/app/pessoas/importar"><FileUp size={18} />Importar membros</Link><Link className="button button--primary" to="/app/pessoas/nova"><UsersRound size={18} />Nova pessoa</Link></div></header>{error && <div className="alert alert--error" role="alert">{error}</div>}
    <section className="district-metrics" aria-label="Resumo de pessoas"><div><small>Total no distrito</small><strong>{people.length}</strong></div><div><small>Ativas</small><strong>{people.filter(({ pastoralStatus }) => pastoralStatus === 'active').length}</strong></div><div><small>A resgatar</small><strong>{people.filter(({ pastoralStatus }) => pastoralStatus === 'rescue').length}</strong></div></section>
    <Card eyebrow="Filtro local" title="Lista de membros" action={<Link className="text-link" to="/app/aniversarios"><Cake />Aniversários</Link>}><div className="filter-bar"><label className="field"><span className="field__label">Pesquisar por nome</span><span className="search-input"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Digite um nome" /></span></label><label className="field"><span className="field__label">Igreja</span><select className="field__input" value={churchId} onChange={(event) => setChurchId(event.target.value)}><option value="">Todas as igrejas</option>{churches.map((church) => <option key={church.id} value={church.id}>{church.name}</option>)}</select></label></div>
      {filtered.length === 0 ? <div className="empty-state"><UsersRound /><strong>{people.length ? 'Nenhuma pessoa encontrada' : 'Nenhuma pessoa cadastrada'}</strong><span>{people.length ? 'Ajuste a pesquisa ou o filtro.' : 'Cadastre manualmente ou importe uma lista em PDF.'}</span></div> : <div className="entity-list">{filtered.map((person) => <Link className="entity-row" to={`/app/pessoas/${person.id}`} key={person.id}><span className="avatar">{person.name.slice(0, 1).toUpperCase()}</span><span><strong>{person.name}</strong><small>{churchName(person.currentChurchId)} · {calculateAge(person.birthDate) ?? 'idade não informada'}{person.birthDate ? ' anos' : ''}</small></span><span className={`entity-badge entity-badge--${person.pastoralStatus === 'active' ? 'active' : 'archived'}`}>{PASTORAL_STATUS_LABELS[person.pastoralStatus]}</span><small className="row-meta">{IMPORT_STATUS_LABELS[person.importStatus]}</small></Link>)}</div>}
    </Card>
    {churches.length > 0 && <Card eyebrow="Distribuição" title="Membros por igreja"><div className="breakdown-list">{churches.map((church) => <div key={church.id}><span>{church.name}</span><strong>{people.filter((person) => person.currentChurchId === church.id && person.importStatus !== 'archived').length}</strong></div>)}</div></Card>}
  </div>
}
