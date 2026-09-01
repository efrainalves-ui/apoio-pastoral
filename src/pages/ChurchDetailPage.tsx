import { Archive, ArrowLeft, Clock3, History, MapPin, Pencil, Trash2, UsersRound } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuthVault } from '../auth/AuthVaultContext'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { DistrictService } from '../district/service'
import { FamilyService } from '../families/service'
import { PeopleService } from '../people/service'
import {
  CHURCH_STATUS_LABELS,
  CHURCH_TYPE_LABELS,
  historyEventLabel,
  WEEKDAY_LABELS,
  type ChurchEntity,
} from '../district/types'

const service = new DistrictService()
const peopleService = new PeopleService()
const familyService = new FamilyService()

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : 'Não foi possível abrir a igreja.'
}

export function ChurchDetailPage() {
  const { churchId = '' } = useParams<{ churchId: string }>()
  const { account, masterKey } = useAuthVault()
  const navigate = useNavigate()
  const [church, setChurch] = useState<ChurchEntity | null>(null)
  const [districtName, setDistrictName] = useState('')
  const [memberCount, setMemberCount] = useState(0)
  const [familyCount, setFamilyCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!account || !masterKey) return
    setLoading(true)
    try {
      const [nextChurch, district, people, families] = await Promise.all([
        service.getChurch(account.id, masterKey, churchId),
        service.getDistrict(account.id, masterKey),
        peopleService.listPeople(account.id, masterKey),
        familyService.listFamilies(account.id, masterKey),
      ])
      if (!nextChurch) throw new Error('Igreja não encontrada ou removida.')
      setChurch(nextChurch)
      setDistrictName(district?.name ?? 'Distrito')
      setMemberCount(people.filter(({ currentChurchId, importStatus }) => currentChurchId === churchId && importStatus !== 'archived').length)
      setFamilyCount(families.filter(({ primaryChurchId }) => primaryChurchId === churchId).length)
    } catch (loadError) {
      setError(messageFrom(loadError))
    } finally {
      setLoading(false)
    }
  }, [account, churchId, masterKey])

  useEffect(() => { void load() }, [load])

  async function removeChurch() {
    if (!account || !masterKey || !church) return
    setBusy(true)
    setError('')
    try {
      await service.deleteChurch(account.id, masterKey, church.id)
      await navigate('/app/distrito', { replace: true })
    } catch (deleteError) {
      setError(messageFrom(deleteError))
      setBusy(false)
    }
  }

  if (loading) return <div className="app-loading" role="status">Abrindo a igreja…</div>
  if (!church) return <div className="page-stack page-narrow"><div className="alert alert--error" role="alert">{error}</div><Link className="text-link" to="/app/distrito"><ArrowLeft />Voltar ao distrito</Link></div>

  return (
    <div className="page-stack">
      <Link className="text-link back-link" to="/app/distrito"><ArrowLeft />Voltar ao distrito</Link>
      <header className="page-hero district-hero">
        <div><p className="eyebrow">{districtName}</p><div className="title-with-badge"><h1>{church.name}</h1><span className={`entity-badge entity-badge--${church.status}`}>{CHURCH_STATUS_LABELS[church.status]}</span></div><p>{CHURCH_TYPE_LABELS[church.type]} · dados protegidos e disponíveis offline.</p></div>
        <div className="page-actions"><Link className="button button--secondary" to={`/app/distrito/igrejas/${church.id}/editar`}><Pencil size={17} /><span>Editar</span></Link><Button variant="danger" onClick={() => setConfirmDelete(true)} icon={<Trash2 size={17} />}>Remover</Button></div>
      </header>

      {error && <div className="alert alert--error" role="alert">{error}</div>}
      {confirmDelete && <Card className="danger-card"><h2>Remover esta igreja?</h2><p>A unidade deixará de aparecer no distrito. Uma tombstone cifrada será sincronizada; nomes e endereço não sairão em texto aberto.</p><div className="form-actions"><Button variant="danger" disabled={busy} onClick={() => void removeChurch()}>{busy ? 'Removendo…' : 'Confirmar remoção'}</Button><Button variant="secondary" onClick={() => setConfirmDelete(false)}>Cancelar</Button></div></Card>}

      <div className="church-detail-grid">
        <Card eyebrow="Cadastro" title="Informações da igreja">
          <dl className="detail-list">
            <div><dt>Tipo</dt><dd>{CHURCH_TYPE_LABELS[church.type]}</dd></div>
            <div><dt>Situação</dt><dd>{CHURCH_STATUS_LABELS[church.status]}</dd></div>
            <div><dt>Código externo</dt><dd>{church.externalCode || 'Não informado'}</dd></div>
            <div><dt>Endereço</dt><dd><MapPin />{church.address || 'Não informado'}</dd></div>
          </dl>
        </Card>

        <Card eyebrow="Agenda regular" title="Cultos">
          {church.worshipSchedules.length === 0 ? <div className="empty-state compact-empty"><Clock3 /><strong>Nenhum horário informado</strong><span>Edite a igreja para adicionar cultos.</span></div> : <ul className="schedule-list">{church.worshipSchedules.map((schedule) => <li key={schedule.id}><Clock3 /><span><strong>{WEEKDAY_LABELS[schedule.day]}</strong><small>{schedule.time}</small></span></li>)}</ul>}
        </Card>
      </div>

      <Card eyebrow="Pessoas e famílias" title="Comunidade local" action={<UsersRound className="accent-icon" />}>
        <div className="community-summary"><Link to={`/app/pessoas?church=${church.id}`}><strong>{memberCount}</strong><span>{memberCount === 1 ? 'membro na lista atual' : 'membros na lista atual'}</span></Link><Link to="/app/familias"><strong>{familyCount}</strong><span>{familyCount === 1 ? 'família principal' : 'famílias principais'}</span></Link></div>
      </Card>

      <Card eyebrow="Uso interno" title="Observações administrativas">
        <p className={church.administrativeNotes ? 'preserved-text' : 'muted'}>{church.administrativeNotes || 'Nenhuma observação cadastrada.'}</p>
      </Card>

      <Card eyebrow="Histórico preservado" title="Linha do tempo" action={<History className="accent-icon" />}>
        <ol className="history-list">
          {[...church.history].reverse().map((entry) => <li key={entry.id}><span className="history-list__marker">{entry.event === 'status_changed' ? <Archive /> : <History />}</span><div><strong>{historyEventLabel(entry)}</strong><small>{new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(entry.at))}</small></div></li>)}
        </ol>
      </Card>
    </div>
  )
}
