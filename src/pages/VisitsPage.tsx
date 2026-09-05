import { useReloadOnSync } from '../sync/useReloadOnSync'
import { CalendarPlus, ChevronRight, HeartHandshake, Plus, UsersRound } from 'lucide-react'
import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { CareService } from '../care/service'
import { VISIT_REASON_LABELS, type VisitEntity } from '../care/types'
import { useAuthVault } from '../auth/AuthVaultContext'
import { Card } from '../components/ui/Card'
import { FamilyService } from '../families/service'
import type { FamilyEntity } from '../families/types'
import { PeopleService } from '../people/service'
import type { PersonEntity } from '../people/types'

const care = new CareService(); const familiesService = new FamilyService(); const peopleService = new PeopleService()
export function VisitsPage() {
  const { account, masterKey } = useAuthVault(); const [visits, setVisits] = useState<VisitEntity[]>([]); const [families, setFamilies] = useState<FamilyEntity[]>([]); const [people, setPeople] = useState<PersonEntity[]>([])
  const load = useCallback(async () => { if (!account || !masterKey) return; const [nextVisits, nextFamilies, nextPeople] = await Promise.all([care.listVisits(account.id, masterKey), familiesService.listFamilies(account.id, masterKey), peopleService.listPeople(account.id, masterKey)]); setVisits(nextVisits); setFamilies(nextFamilies); setPeople(nextPeople) }, [account, masterKey])
  useReloadOnSync(load)
  const targetName = (visit: VisitEntity) => visit.targetType === 'family' ? families.find(({ id }) => id === visit.targetId)?.name : people.find(({ id }) => id === visit.targetId)?.name
  return <div className="page-stack"><header className="page-hero"><div><p className="eyebrow">Visitas</p><h1>Visitas pastorais</h1><p>Registre visitas e acompanhamentos.</p></div><div className="page-actions"><Link className="button button--secondary" to="/app/agenda/novo"><CalendarPlus />Agendar</Link><Link className="button" to="/app/visitas/nova"><Plus />Registrar visita</Link></div></header><section className="dashboard-metrics"><Link to="/app/visitas"><small>Visitas registradas</small><strong>{visits.length}</strong><span>Histórico</span></Link><Link to="/app/cuidados"><small>Cuidados</small><strong>→</strong><span>Pedidos e tarefas</span></Link></section><Card eyebrow="Histórico" title="Visitas concluídas">{!visits.length ? <div className="empty-state"><HeartHandshake /><strong>Nenhuma visita registrada</strong><p>Uma visita espontânea não precisa de agendamento prévio.</p></div> : <div className="visit-list">{visits.map((visit) => { const version = visit.versions.at(-1)!; return <Link key={visit.id} to={`/app/visitas/${visit.id}`}><span className="avatar"><UsersRound /></span><span><strong>{targetName(visit) ?? 'Cadastro preservado'}</strong><small>{VISIT_REASON_LABELS[version.reason]} · {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(version.startAt))}</small></span><span className="entity-badge">v{visit.currentVersion}</span><ChevronRight /></Link> })}</div>}</Card></div>
}
