import { ArrowLeft, Church, TriangleAlert } from 'lucide-react'
import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { AgendaService } from '../agenda/service'
import type { AgendaEventEntity } from '../agenda/types'
import { useAuthVault } from '../auth/AuthVaultContext'
import { Card } from '../components/ui/Card'
import { igrejasQuePrecisamDeAtencao } from '../district/atencao'
import { DistrictService } from '../district/service'
import type { ChurchEntity } from '../district/types'
import { PeopleService } from '../people/service'
import type { PersonEntity } from '../people/types'
import { localDateKey } from '../shared/dates'
import { useReloadOnSync } from '../sync/useReloadOnSync'

const districts = new DistrictService(); const peopleService = new PeopleService(); const agenda = new AgendaService()

/** As igrejas que pedem atenção, com o motivo de cada uma. O cartão do início traz só o número. */
export function IgrejasComPendenciaPage() {
  const { account, masterKey } = useAuthVault()
  const [churches, setChurches] = useState<ChurchEntity[]>([])
  const [people, setPeople] = useState<PersonEntity[]>([])
  const [events, setEvents] = useState<AgendaEventEntity[]>([])
  const [pronta, setPronta] = useState(false)
  const carregar = useCallback(async () => {
    if (!account || !masterKey) return
    try {
      const district = await districts.getDistrict(account.id, masterKey)
      const [nextChurches, nextPeople, nextEvents] = await Promise.all([
        district ? districts.listChurches(account.id, masterKey, district.id) : [],
        peopleService.listPeople(account.id, masterKey),
        agenda.listEvents(account.id, masterKey),
      ])
      setChurches(nextChurches); setPeople(nextPeople); setEvents(nextEvents)
    } finally { setPronta(true) }
  }, [account, masterKey])
  useReloadOnSync(carregar)

  if (!pronta) return <div className="app-loading" role="status">Abrindo as igrejas…</div>
  const pendencias = igrejasQuePrecisamDeAtencao(churches, people, events, localDateKey())

  return <div className="page-stack">
    <Link className="text-link back-link" to="/app"><ArrowLeft />Voltar ao início</Link>
    <header className="page-hero"><div><p className="eyebrow">Distrito</p><h1>Igrejas que precisam de atenção</h1></div></header>
    <Card eyebrow={`${pendencias.length} de ${churches.length}`} title="O que falta em cada igreja" action={<Link className="icon-button" to="/app/distrito" aria-label="Abrir distrito e igrejas"><Church className="accent-icon" /></Link>}>
      {!pendencias.length
        ? <div className="empty-state compact-empty"><Church /><strong>Nenhuma pendência nas igrejas</strong></div>
        : <ul className="lista-atencao">{pendencias.map((igreja) => <li key={igreja.id}>
          <Link to={`/app/distrito/igrejas/${igreja.id}`}>
            <strong>{igreja.name}</strong>
            <span className="selo-atencao"><TriangleAlert aria-hidden="true" />{igreja.motivo}</span>
          </Link>
        </li>)}</ul>}
    </Card>
  </div>
}
