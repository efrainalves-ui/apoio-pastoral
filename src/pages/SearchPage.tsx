import { useReloadOnSync } from '../sync/useReloadOnSync'
import { ArrowLeft, CalendarDays, Church, Search, UserRound, UsersRound } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AgendaService } from '../agenda/service'
import type { AgendaEventEntity } from '../agenda/types'
import { useAuthVault } from '../auth/AuthVaultContext'
import { EmptyState, ErrorState, LoadingState } from '../components/ui/AsyncState'
import { Card } from '../components/ui/Card'
import { DistrictService } from '../district/service'
import type { ChurchEntity } from '../district/types'
import { FamilyService } from '../families/service'
import type { FamilyEntity } from '../families/types'
import { PeopleService } from '../people/service'
import type { PersonEntity } from '../people/types'
import { normalizePersonName, normalizePhone } from '../people/validation'

const peopleService = new PeopleService()
const familyService = new FamilyService()
const districtService = new DistrictService()
const agendaService = new AgendaService()

export function SearchPage() {
  const { account, masterKey } = useAuthVault()
  const [people, setPeople] = useState<PersonEntity[]>([])
  const [families, setFamilies] = useState<FamilyEntity[]>([])
  const [churches, setChurches] = useState<ChurchEntity[]>([])
  const [events, setEvents] = useState<AgendaEventEntity[]>([])
  const [params] = useSearchParams()
  const [query, setQuery] = useState(params.get('termo') ?? '')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!account || !masterKey) return
    setLoading(true)
    setError('')
    try {
      const district = await districtService.getDistrict(account.id, masterKey)
      const [nextPeople, nextFamilies, nextChurches, nextEvents] = await Promise.all([
        peopleService.listPeople(account.id, masterKey),
        familyService.listFamilies(account.id, masterKey),
        district ? districtService.listChurches(account.id, masterKey, district.id) : [],
        agendaService.listEvents(account.id, masterKey),
      ])
      setPeople(nextPeople)
      setFamilies(nextFamilies)
      setChurches(nextChurches)
      setEvents(nextEvents)
    } catch {
      setError('Não foi possível abrir os dados locais para pesquisa.')
    } finally {
      setLoading(false)
    }
  }, [account, masterKey])

  useReloadOnSync(load)

  const results = useMemo(() => {
    const text = normalizePersonName(query)
    const phone = normalizePhone(query)
    if (text.length < 2 && phone.length < 3) return { people: [], families: [], churches: [], events: [] }
    return {
      people: people.filter((person) => normalizePersonName(person.name).includes(text) || Boolean(phone && person.whatsapp.includes(phone))),
      families: families.filter((family) => normalizePersonName(family.name).includes(text)),
      churches: churches.filter((church) => normalizePersonName(church.name).includes(text)),
      events: events.filter((event) => [event.title, event.location, event.address].some((value) => normalizePersonName(value).includes(text))),
    }
  }, [churches, events, families, people, query])

  const total = results.people.length + results.families.length + results.churches.length + results.events.length
  if (loading) return <LoadingState title="Preparando busca local…" />
  if (error) return <div className="page-stack page-narrow"><ErrorState title="A busca não pôde ser aberta" detail={error} retry={() => void load()} /></div>

  return <div className="page-stack page-narrow">
    <Link className="text-link back-link" to="/app"><ArrowLeft />Voltar ao início</Link>
    <header className="page-hero"><div><p className="eyebrow">Busca</p><h1>Busca global</h1></div></header>
    <label className="field"><span className="field__label">Pessoa, família, igreja, compromisso ou WhatsApp</span><span className="search-input search-input--large"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} autoFocus placeholder="Digite pelo menos 2 caracteres" /></span></label>
    {query && <p className="muted">{total} resultado(s) local(is)</p>}
    <Card title="Resultados">
      {!query
        ? <EmptyState icon={<Search />} title="Comece a pesquisar" detail="Nenhum termo sai do aplicativo." />
        : total === 0
          ? <EmptyState icon={<Search />} title="Nenhum resultado" detail="Revise o termo pesquisado." />
          : <div className="search-results">
            {results.people.map((person) => <Link key={person.id} to={`/app/pessoas/${person.id}`}><UserRound /><span><strong>{person.name}</strong><small>Pessoa{person.whatsapp ? ' · WhatsApp cadastrado' : ''}</small></span></Link>)}
            {results.families.map((family) => <Link key={family.id} to={`/app/familias/${family.id}`}><UsersRound /><span><strong>{family.name}</strong><small>Família</small></span></Link>)}
            {results.churches.map((church) => <Link key={church.id} to={`/app/distrito/igrejas/${church.id}`}><Church /><span><strong>{church.name}</strong><small>Igreja</small></span></Link>)}
            {results.events.map((event) => <Link key={event.id} to={`/app/agenda/${event.id}/editar`}><CalendarDays /><span><strong>{event.title}</strong><small>Compromisso · {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', ...(event.allDay ? {} : { timeStyle: 'short' }) }).format(new Date(event.startAt))}</small></span></Link>)}
          </div>}
    </Card>
  </div>
}
