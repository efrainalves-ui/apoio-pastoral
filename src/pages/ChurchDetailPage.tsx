import { useReloadOnSync } from '../sync/useReloadOnSync'
import { Archive, ArrowLeft, CalendarDays, Clock3, FileUp, History, MapPin, Pencil, Plus, Trash2, UsersRound } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AgendaService } from '../agenda/service'
import type { AgendaEventEntity } from '../agenda/types'
import { useAuthVault } from '../auth/AuthVaultContext'
import { CareService } from '../care/service'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { DistrictService } from '../district/service'
import { FamilyService } from '../families/service'
import type { FamilyEntity } from '../families/types'
import { MissionaryService } from '../missionary/service'
import { metaDeGrupos } from '../missionary/metasDeGrupos'
import type { SabbathClassEntity, SmallGroupEntity, UapgEntity } from '../missionary/types'
import { calculateAge } from '../people/dates'
import { PeopleService } from '../people/service'
import { PASTORAL_STATUS_LABELS, type PersonEntity } from '../people/types'
import {
  CHURCH_STATUS_LABELS,
  CHURCH_TYPE_LABELS,
  historyEventLabel,
  WEEKDAY_LABELS,
  type ChurchEntity,
} from '../district/types'
import { MemberImportPage } from './MemberImportPage'

const service = new DistrictService()
const agenda = new AgendaService()
const peopleService = new PeopleService()
const familyService = new FamilyService()
const missionary = new MissionaryService()
const careService = new CareService()

const TABS = [
  ['visao', 'Visão geral'],
  ['membros', 'Membros'],
  ['familias', 'Famílias'],
  ['agenda', 'Agenda'],
  ['historico', 'Histórico'],
  ['indicadores', 'Indicadores'],
] as const
type ChurchTab = (typeof TABS)[number][0]

const dataCurta = (valor: string) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(new Date(valor))

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : 'Não foi possível abrir a igreja.'
}

export function ChurchDetailPage() {
  const { churchId = '' } = useParams<{ churchId: string }>()
  const { account, masterKey } = useAuthVault()
  const navigate = useNavigate()
  const [search, setSearch] = useSearchParams()
  const tab = (TABS.some(([value]) => value === search.get('aba')) ? search.get('aba') : 'visao') as ChurchTab
  const [church, setChurch] = useState<ChurchEntity | null>(null)
  const [districtName, setDistrictName] = useState('')
  const [members, setMembers] = useState<PersonEntity[]>([])
  const [families, setFamilies] = useState<FamilyEntity[]>([])
  const [classes, setClasses] = useState<SabbathClassEntity[]>([])
  const [smallGroups, setSmallGroups] = useState<SmallGroupEntity[]>([])
  const [integracoes, setIntegracoes] = useState<UapgEntity[]>([])
  const [events, setEvents] = useState<AgendaEventEntity[]>([])
  const [visitCount, setVisitCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [importing, setImporting] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!account || !masterKey) return
    setLoading(true)
    try {
      const [nextChurch, district, people, nextFamilies, nextEvents, visits] = await Promise.all([
        service.getChurch(account.id, masterKey, churchId),
        service.getDistrict(account.id, masterKey),
        peopleService.listPeople(account.id, masterKey),
        familyService.listFamilies(account.id, masterKey),
        agenda.listEvents(account.id, masterKey),
        careService.listVisits(account.id, masterKey),
      ])
      if (!nextChurch) throw new Error('Igreja não encontrada ou removida.')
      setChurch(nextChurch)
      setDistrictName(district?.name ?? 'Distrito')
      setMembers(people.filter((person) => person.currentChurchId === churchId && person.importStatus !== 'archived').sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')))
      setFamilies(nextFamilies.filter(({ primaryChurchId }) => primaryChurchId === churchId))
      const [nextClasses, nextGroups, nextIntegracoes] = await Promise.all([
        missionary.listClasses(account.id, masterKey), missionary.listSmallGroups(account.id, masterKey), missionary.listUapgs(account.id, masterKey),
      ])
      setClasses(nextClasses.filter((item) => item.churchId === churchId))
      setSmallGroups(nextGroups.filter((item) => item.churchId === churchId && item.active))
      setIntegracoes(nextIntegracoes.filter((item) => item.churchId === churchId && item.active))
      setEvents(nextEvents.filter((event) => event.churchId === churchId).sort((a, b) => b.startAt.localeCompare(a.startAt)))
      setVisitCount(visits.filter((visit) => visit.churchId === churchId).length)
    } catch (loadError) {
      setError(messageFrom(loadError))
    } finally {
      setLoading(false)
    }
  }, [account, churchId, masterKey])

  useReloadOnSync(load)
  // No celular a faixa de abas rola: a aba escolhida fica sempre à vista.
  useEffect(() => { document.querySelector('.tab-bar .button--primary')?.scrollIntoView({ inline: 'center', block: 'nearest' }) }, [tab])

  async function removeChurch() {
    if (!account || !masterKey || !church) return
    setBusy(true); setError('')
    try {
      await service.deleteChurch(account.id, masterKey, church.id)
      await navigate('/app/distrito', { replace: true })
    } catch (deleteError) {
      setError(messageFrom(deleteError)); setBusy(false)
    }
  }

  if (loading) return <div className="app-loading" role="status">Abrindo a igreja…</div>
  if (!church) return <div className="page-stack page-narrow"><div className="alert alert--error" role="alert">{error}</div><Link className="text-link" to="/app/distrito"><ArrowLeft />Voltar ao distrito</Link></div>

  const preachings = events.filter((event) => event.category === 'preaching')
  const proximos = events.filter((event) => event.startAt.slice(0, 10) >= new Date().toISOString().slice(0, 10)).slice(0, 8)

  return (
    <div className="page-stack church-page">
      <Link className="text-link back-link" to="/app/distrito"><ArrowLeft />Voltar ao distrito</Link>
      <header className="page-hero district-hero">
        <div>
          <p className="eyebrow">{districtName}</p>
          <div className="title-with-badge"><h1>{church.name}</h1><span className={`entity-badge entity-badge--${church.status}`}>{CHURCH_STATUS_LABELS[church.status]}</span></div>
          <p>{CHURCH_TYPE_LABELS[church.type]} · {members.length} membro(s) · {families.length} família(s)</p>
        </div>
        <div className="page-actions">
          <Link className="button button--secondary" to={`/app/distrito/igrejas/${church.id}/editar`}><Pencil size={17} /><span>Editar</span></Link>
          <Button variant="danger" onClick={() => setConfirmDelete(true)} icon={<Trash2 size={17} />}>Remover</Button>
        </div>
      </header>

      {error && <div className="alert alert--error" role="alert">{error}</div>}
      {confirmDelete && <Card className="danger-card"><h2>Remover esta igreja?</h2><p>A igreja deixará de aparecer no distrito. Os outros aparelhos recebem apenas o aviso da remoção; nome e endereço não saem daqui em texto aberto.</p><div className="form-actions"><Button variant="danger" disabled={busy} onClick={() => void removeChurch()}>{busy ? 'Removendo…' : 'Confirmar remoção'}</Button><Button variant="secondary" onClick={() => setConfirmDelete(false)}>Cancelar</Button></div></Card>}

      <nav className="tab-bar" aria-label="Áreas da igreja">
        {TABS.map(([value, label]) => <Button key={value} variant={tab === value ? 'primary' : 'secondary'} onClick={() => setSearch(value === 'visao' ? {} : { aba: value })}>{label}</Button>)}
      </nav>

      {tab === 'visao' && <>
        <Card title="Informações da igreja">
          <dl className="detail-list">
            <div><dt>Tipo</dt><dd>{CHURCH_TYPE_LABELS[church.type]}</dd></div>
            <div><dt>Situação</dt><dd>{CHURCH_STATUS_LABELS[church.status]}</dd></div>
            <div><dt>Código externo</dt><dd>{church.externalCode || 'Não informado'}</dd></div>
            <div><dt>Endereço</dt><dd><MapPin />{church.address || 'Não informado'}</dd></div>
          </dl>
        </Card>
        <Card title="Observações administrativas">
          <p className={church.administrativeNotes ? 'preserved-text' : 'muted'}>{church.administrativeNotes || 'Nenhuma observação cadastrada.'}</p>
        </Card>
      </>}

      {tab === 'membros' && <Card title="Membros desta igreja">
        <div className="page-actions">
          <Link className="button" to={`/app/pessoas/nova?church=${church.id}`}><Plus />Cadastrar membro</Link>
          <Button variant="secondary" icon={<FileUp />} onClick={() => setImporting((atual) => !atual)}>{importing ? 'Fechar importação' : 'Importar lista de membros'}</Button>
        </div>
        {importing && <MemberImportPage churchId={church.id} embedded />}
        {members.length === 0
          ? <div className="empty-state"><UsersRound /><strong>Nenhum membro nesta igreja</strong><p>Cadastre um membro ou importe a lista da igreja.</p></div>
          : <div className="entity-list">{members.map((person) => <Link className="entity-row" to={`/app/pessoas/${person.id}`} key={person.id}>
            <span className="avatar">{person.name.slice(0, 1).toUpperCase()}</span>
            <span><strong>{person.name}</strong><small>{calculateAge(person.birthDate) ?? 'idade não informada'}{person.birthDate ? ' anos' : ''}</small></span>
            <span className={`entity-badge entity-badge--${person.pastoralStatus === 'active' ? 'active' : 'archived'}`}>{PASTORAL_STATUS_LABELS[person.pastoralStatus]}</span>
          </Link>)}</div>}
      </Card>}

      {tab === 'familias' && <Card title="Famílias desta igreja">
        <div className="page-actions"><Link className="button" to="/app/familias/nova"><Plus />Nova família</Link></div>
        {families.length === 0
          ? <div className="empty-state"><UsersRound /><strong>Nenhuma família nesta igreja</strong><p>Uma família reúne pessoas já cadastradas.</p></div>
          : <div className="entity-list">{families.map((family) => <Link className="entity-row" to={`/app/familias/${family.id}`} key={family.id}>
            <UsersRound aria-hidden="true" />
            <span><strong>{family.name}</strong><small>{family.memberIds.length} {family.memberIds.length === 1 ? 'integrante' : 'integrantes'}</small></span>
            <span>Abrir</span>
          </Link>)}</div>}
      </Card>}

      {tab === 'agenda' && <>
        <Card title="Agenda regular">
          {church.worshipSchedules.length === 0
            ? <div className="empty-state compact-empty"><Clock3 /><strong>Nenhum horário informado</strong><span>Edite a igreja para adicionar cultos.</span></div>
            : <ul className="schedule-list">{church.worshipSchedules.map((schedule) => <li key={schedule.id}><Clock3 /><span><strong>{WEEKDAY_LABELS[schedule.day]}</strong><small>{schedule.time}</small></span></li>)}</ul>}
        </Card>
        <Card title="Próximos compromissos">
          {proximos.length === 0
            ? <div className="empty-state compact-empty"><CalendarDays /><strong>Nenhum compromisso próximo</strong></div>
            : <div className="entity-list">{proximos.map((event) => <Link className="entity-row" key={event.id} to={`/app/agenda/${event.id}/editar`}>
              <CalendarDays aria-hidden="true" />
              <span><strong>{event.title}</strong><small>{dataCurta(event.startAt)}</small></span>
              <span>Abrir</span>
            </Link>)}</div>}
        </Card>
      </>}

      {tab === 'historico' && <>
        <Card title="Linha do tempo" action={<History className="accent-icon" />}>
          <ol className="history-list">
            {[...church.history].reverse().map((entry) => <li key={entry.id}><span className="history-list__marker">{entry.event === 'status_changed' ? <Archive /> : <History />}</span><div><strong>{historyEventLabel(entry)}</strong><small>{new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(entry.at))}</small></div></li>)}
          </ol>
        </Card>
        <Card title="Pregações nesta igreja">
          {preachings.length === 0
            ? <div className="empty-state compact-empty"><strong>Ainda não há pregação registrada aqui</strong><span>Registre a pregação no sermão ou crie um compromisso de pregação.</span></div>
            : <div className="entity-list">{preachings.map((event) => <Link className="entity-row" key={event.id} to={event.sermonId ? `/app/sermoes/${event.sermonId}` : `/app/agenda/${event.id}/editar`}>
              <span><strong>{event.sermonSnapshot?.title ?? event.title}</strong><small>{dataCurta(event.startAt)}</small></span>
              <span>Abrir</span>
            </Link>)}</div>}
        </Card>
      </>}

      {tab === 'visao' && (() => {
        // O mesmo quadro que a página de Escola Sabatina mostra do distrito
        // inteiro, recortado nesta igreja: aqui é onde o pastor está quando
        // pergunta se esta igreja já tem os grupos que devia ter.
        const meta = metaDeGrupos(members.length)
        const linha = (rotulo: string, alcancado: number) => <div key={rotulo}><small>{rotulo}</small><strong className={alcancado >= meta ? 'quadro--alcancado' : 'quadro--falta'}>{alcancado}<small>/{meta}</small></strong></div>
        return <Card title="Escola Sabatina e Pequenos Grupos" eyebrow={`Meta de ${meta} para ${members.length} membro(s)`} action={<Link className="text-link" to="/app/metas/uapg">Abrir</Link>}>
          <div className="private-summary">
            {linha('Unidades da Escola Sabatina', classes.length)}
            {linha('Pequenos Grupos', smallGroups.length)}
            {linha('Integração', integracoes.length)}
          </div>
        </Card>
      })()}

      {tab === 'indicadores' && <section className="district-metrics" aria-label="Indicadores da igreja">
        <div><small>Membros</small><strong>{members.length}</strong></div>
        <div><small>Ativos</small><strong>{members.filter(({ pastoralStatus }) => pastoralStatus === 'active').length}</strong></div>
        <div><small>A resgatar</small><strong>{members.filter(({ pastoralStatus }) => pastoralStatus === 'rescue').length}</strong></div>
        <div><small>Famílias</small><strong>{families.length}</strong></div>
        <div><small>Visitas registradas</small><strong>{visitCount}</strong></div>
        <div><small>Pregações</small><strong>{preachings.length}</strong></div>
      </section>}
    </div>
  )
}
