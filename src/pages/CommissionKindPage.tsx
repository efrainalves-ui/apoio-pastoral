import { useReloadOnSync } from '../sync/useReloadOnSync'
import { ArrowLeft, ClipboardList, Plus, Settings, Vote } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuthVault } from '../auth/AuthVaultContext'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { commissionPresident } from '../commissions/core'
import { CommissionService } from '../commissions/service'
import type { CommissionConfigData, CommissionEntity, CommissionKind, CommissionMeetingData } from '../commissions/types'
import { DistrictService } from '../district/service'
import type { ChurchEntity } from '../district/types'

const service = new CommissionService()
const districts = new DistrictService()

export function commissionConfigReady(config: CommissionEntity<CommissionConfigData> | null, kind: CommissionKind) {
  // Quem preside é o pastor por padrão, então a configuração fica pronta sem
  // escolher presidente; o ancião é exceção e aí precisa estar escolhido.
  if (!config?.secretaryId) return false
  if (config.presidentMode === 'elder' && !config.boardPresidentId) return false
  if (kind === 'board') return config.boardQuorum > 0 && config.boardMemberIds.length > 0
  return config.administrativeQuorum > 0
}

const labels = {
  board: { title: 'Comissão Diretiva', icon: <Vote />, route: '/app/comissoes/diretiva' },
  administrative: { title: 'Reunião Administrativa', icon: <ClipboardList />, route: '/app/comissoes/administrativa' },
}

export function CommissionKindPage({ kind }: { kind: CommissionKind }) {
  const { account, masterKey } = useAuthVault()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const requestedChurchId = searchParams.get('churchId') ?? ''
  const createRequested = searchParams.get('nova') === '1'
  const creating = useRef(false)
  const [churches, setChurches] = useState<ChurchEntity[]>([])
  const [churchId, setChurchId] = useState(requestedChurchId)
  const [config, setConfig] = useState<CommissionEntity<CommissionConfigData> | null>(null)
  const [meetings, setMeetings] = useState<CommissionEntity<CommissionMeetingData>[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const label = labels[kind]

  const load = useCallback(async () => {
    if (!account || !masterKey) return
    setLoading(true)
    setError('')
    try {
      const district = await districts.getDistrict(account.id, masterKey)
      const nextChurches = district ? await districts.listChurches(account.id, masterKey, district.id) : []
      const selected = requestedChurchId || churchId || nextChurches[0]?.id || ''
      setChurches(nextChurches)
      setChurchId(selected)
      const nextConfig = selected ? await service.config(account.id, masterKey, selected) : null
      setConfig(nextConfig)
      setMeetings((await service.meetings(account.id, masterKey, selected)).filter((meeting) => meeting.kind === kind))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível abrir esta comissão.')
    } finally {
      setLoading(false)
    }
  }, [account, masterKey, requestedChurchId, churchId, kind])

  useReloadOnSync(load)

  const createMeeting = useCallback(async () => {
    if (!account || !masterKey || !churchId || creating.current) return
    creating.current = true
    setError('')
    try {
      const currentConfig = await service.config(account.id, masterKey, churchId)
      if (!commissionConfigReady(currentConfig, kind)) {
        creating.current = false
        return
      }
      const timestamp = new Date().toISOString()
      const church = await districts.getChurch(account.id, masterKey, churchId)
      // Pastor por padrão; o ancião entra como pessoa cadastrada da igreja.
      const presidencia = commissionPresident(currentConfig, church?.type)
      const meeting = await service.saveMeeting(account.id, masterKey, {
        churchId,
        kind,
        date: timestamp.slice(0, 10),
        time: '',
        location: '',
        presidentId: presidencia.mode === 'elder' ? presidencia.personId : '',
        ...(presidencia.mode === 'pastor' ? { presidentLabel: presidencia.label } : {}),
        secretaryId: currentConfig!.secretaryId,
        participantIds: kind === 'board' ? currentConfig!.boardMemberIds : [],
        guestNames: [],
        votingGuestNames: [],
        openingPrayer: '',
        reflection: '',
        notes: '',
        agenda: [],
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      void navigate(`/app/comissoes/${meeting.id}`, { replace: true })
    } catch (reason) {
      creating.current = false
      setError(reason instanceof Error ? reason.message : 'Não foi possível criar a reunião.')
    }
  }, [account, masterKey, churchId, kind, navigate])

  useEffect(() => {
    if (!loading && createRequested && commissionConfigReady(config, kind)) void createMeeting()
  }, [loading, createRequested, config, kind, createMeeting])

  const returnPath = `${label.route}?${new URLSearchParams({ churchId, ...(createRequested ? { nova: '1' } : {}) }).toString()}`
  const configurePath = `/app/comissoes/configurar?${new URLSearchParams({ churchId, returnTo: returnPath }).toString()}`

  return <div className="page-stack commission-kind-page">
    <Link className="text-link back-link" to="/app/comissoes"><ArrowLeft />Voltar a Comissões</Link>
    <header className="page-hero">
      <div><p className="eyebrow">Comissões</p><h1>{label.title}</h1></div>
      <span className="commission-kind-page__icon">{label.icon}</span>
    </header>

    {error && <div className="alert alert--error" role="alert">{error}</div>}

    <label className="field">
      <span className="field__label">Igreja</span>
      <select className="field__input" value={churchId} onChange={(event) => { void navigate(`${label.route}?${new URLSearchParams({ churchId: event.target.value }).toString()}`) }}>
        <option value="">Selecionar</option>
        {churches.map((church) => <option key={church.id} value={church.id}>{church.name}</option>)}
      </select>
    </label>

    {loading ? <div className="app-loading" role="status">Abrindo comissão…</div> : !commissionConfigReady(config, kind) ? <Card className="commission-setup-card" title="Configuração necessária" action={<Settings />}>
      <p>Antes de criar uma reunião, configure os responsáveis e o quórum desta igreja.</p>
      <Link className="button button--primary" to={configurePath}>Configurar igreja</Link>
    </Card> : <>
      <div className="page-actions">
        <Button icon={<Plus />} onClick={() => void createMeeting()}>{createRequested ? 'Criando reunião…' : 'Nova reunião'}</Button>
        <Link className="button button--secondary" to={configurePath}><Settings />Revisar configuração</Link>
      </div>
      <Card title={`Reuniões · ${label.title}`}>
        {meetings.length ? <div className="entity-list">{meetings.map((meeting) => <Link className="entity-row entity-row--link" to={`/app/comissoes/${meeting.id}`} key={meeting.id}>
          <span><strong>{meeting.date}</strong><small>{meeting.agenda.length} assunto(s) · {meeting.finalizedAt ? 'Ata finalizada' : 'Em preparação'}</small></span>
          <span>Abrir</span>
        </Link>)}</div> : <div className="empty-state"><ClipboardList /><strong>Nenhuma reunião deste tipo</strong><p>Use “Nova reunião” para começar.</p></div>}
      </Card>
    </>}
  </div>
}
