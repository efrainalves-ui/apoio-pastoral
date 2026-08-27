import { Plus, Search, UsersRound } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuthVault } from '../auth/AuthVaultContext'
import { Card } from '../components/ui/Card'
import { DistrictService } from '../district/service'
import type { ChurchEntity } from '../district/types'
import { FamilyService } from '../families/service'
import type { FamilyEntity } from '../families/types'
import { normalizePersonName } from '../people/validation'

const service = new FamilyService(); const districtService = new DistrictService()
export function FamiliesPage() {
  const { account, masterKey } = useAuthVault(); const [families, setFamilies] = useState<FamilyEntity[]>([]); const [churches, setChurches] = useState<ChurchEntity[]>([]); const [query, setQuery] = useState(''); const [loading, setLoading] = useState(true); const [error, setError] = useState('')
  const load = useCallback(async () => { if (!account || !masterKey) return; try { const district = await districtService.getDistrict(account.id, masterKey); setFamilies(await service.listFamilies(account.id, masterKey)); setChurches(district ? await districtService.listChurches(account.id, masterKey, district.id) : []) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível abrir as famílias.') } finally { setLoading(false) } }, [account, masterKey])
  useEffect(() => { void load() }, [load]); const filtered = useMemo(() => families.filter(({ name }) => normalizePersonName(name).includes(normalizePersonName(query))), [families, query]); const churchName = (id: string) => churches.find((church) => church.id === id)?.name ?? 'Igreja'
  if (loading) return <div className="app-loading">Descriptografando famílias…</div>
  return <div className="page-stack"><header className="page-hero"><div><p className="eyebrow">Famílias</p><h1>Famílias</h1><p>Composições manuais que podem reunir pessoas de igrejas diferentes.</p></div><Link className="button button--primary" to="/app/familias/nova"><Plus />Nova família</Link></header>{error && <div className="alert alert--error">{error}</div>}<section className="district-metrics"><div><small>Famílias formadas</small><strong>{families.length}</strong></div><div><small>Pessoas organizadas</small><strong>{new Set(families.flatMap(({ memberIds }) => memberIds)).size}</strong></div><div><small>Preparação para visitas</small><strong>Pronta</strong></div></section><Card eyebrow="Organização" title="Composições"><label className="field search-only"><span className="field__label">Pesquisar família</span><span className="search-input"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} /></span></label>{filtered.length === 0 ? <div className="empty-state"><UsersRound /><strong>{families.length ? 'Nenhuma família encontrada' : 'Nenhuma família formada'}</strong><span>Crie uma família e selecione pessoas já cadastradas.</span></div> : <div className="church-grid">{filtered.map((family) => <Link className="church-card family-card" key={family.id} to={`/app/familias/${family.id}`}><span className="church-card__icon"><UsersRound /></span><h3>{family.name}</h3><p>{churchName(family.primaryChurchId)}</p><span className="church-card__address">{family.memberIds.length} {family.memberIds.length === 1 ? 'integrante' : 'integrantes'}</span></Link>)}</div>}</Card><Card eyebrow="Estrutura futura" title="Participantes ocasionais"><p className="card-copy">Uma visita poderá incluir um convidado apenas pelo nome, sem criar cadastro permanente e sem alterar a composição da família.</p></Card></div>
}
