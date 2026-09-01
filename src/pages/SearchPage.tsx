import { ArrowLeft, Church, Search, UserRound, UsersRound } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuthVault } from '../auth/AuthVaultContext'
import { Card } from '../components/ui/Card'
import { DistrictService } from '../district/service'
import type { ChurchEntity } from '../district/types'
import { FamilyService } from '../families/service'
import type { FamilyEntity } from '../families/types'
import { PeopleService } from '../people/service'
import type { PersonEntity } from '../people/types'
import { normalizePersonName, normalizePhone } from '../people/validation'

const peopleService = new PeopleService(); const familyService = new FamilyService(); const districtService = new DistrictService()
export function SearchPage() {
  const { account, masterKey } = useAuthVault(); const [people, setPeople] = useState<PersonEntity[]>([]); const [families, setFamilies] = useState<FamilyEntity[]>([]); const [churches, setChurches] = useState<ChurchEntity[]>([]); const [params] = useSearchParams(); const [query, setQuery] = useState(params.get('termo') ?? ''); const [loading, setLoading] = useState(true)
  const load = useCallback(async () => { if (!account || !masterKey) return; const district = await districtService.getDistrict(account.id, masterKey); const [nextPeople, nextFamilies, nextChurches] = await Promise.all([peopleService.listPeople(account.id, masterKey), familyService.listFamilies(account.id, masterKey), district ? districtService.listChurches(account.id, masterKey, district.id) : []]); setPeople(nextPeople); setFamilies(nextFamilies); setChurches(nextChurches); setLoading(false) }, [account, masterKey]); useEffect(() => { void load() }, [load])
  const results = useMemo(() => { const text = normalizePersonName(query); const phone = normalizePhone(query); if (text.length < 2 && phone.length < 3) return { people: [], families: [], churches: [] }; return { people: people.filter((person) => normalizePersonName(person.name).includes(text) || Boolean(phone && person.whatsapp.includes(phone))), families: families.filter((family) => normalizePersonName(family.name).includes(text)), churches: churches.filter((church) => normalizePersonName(church.name).includes(text)) } }, [churches, families, people, query]); const total = results.people.length + results.families.length + results.churches.length
  if (loading) return <div className="app-loading">Preparando busca local…</div>
  return <div className="page-stack page-narrow"><Link className="text-link back-link" to="/app"><ArrowLeft />Voltar ao início</Link><header className="page-hero"><div><p className="eyebrow">Busca</p><h1>Busca global</h1><p>O termo é processado somente neste dispositivo e nunca é sincronizado.</p></div></header><label className="field"><span className="field__label">Pessoa, família, igreja ou WhatsApp</span><span className="search-input search-input--large"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} autoFocus placeholder="Digite pelo menos 2 caracteres" /></span></label>{query && <p className="muted">{total} resultado(s) local(is)</p>}<Card title="Resultados">{!query ? <div className="empty-state"><Search /><strong>Comece a pesquisar</strong><span>Nenhum termo sai do aplicativo.</span></div> : total === 0 ? <div className="empty-state"><Search /><strong>Nenhum resultado</strong><span>Revise o termo pesquisado.</span></div> : <div className="search-results">{results.people.map((person) => <Link key={person.id} to={`/app/pessoas/${person.id}`}><UserRound /><span><strong>{person.name}</strong><small>Pessoa{person.whatsapp ? ' · WhatsApp cadastrado' : ''}</small></span></Link>)}{results.families.map((family) => <Link key={family.id} to={`/app/familias/${family.id}`}><UsersRound /><span><strong>{family.name}</strong><small>Família</small></span></Link>)}{results.churches.map((church) => <Link key={church.id} to={`/app/distrito/igrejas/${church.id}`}><Church /><span><strong>{church.name}</strong><small>Igreja</small></span></Link>)}</div>}</Card></div>
}
