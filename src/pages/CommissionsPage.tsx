import { useReloadOnSync } from '../sync/useReloadOnSync'
import { ArrowRight, ClipboardCheck, ClipboardList, Plus, Settings, Vote } from 'lucide-react'
import { useCallback, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthVault } from '../auth/AuthVaultContext'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { CommissionService } from '../commissions/service'
import type { CommissionKind } from '../commissions/types'
import { DistrictService } from '../district/service'
import type { ChurchEntity } from '../district/types'

const service = new CommissionService()
const districts = new DistrictService()

const kindPath = (kind: CommissionKind, churchId: string, create = false) => {
  const route = kind === 'board' ? '/app/comissoes/diretiva' : '/app/comissoes/administrativa'
  const query = new URLSearchParams({ churchId })
  if (create) query.set('nova', '1')
  return `${route}?${query.toString()}`
}

const commissionTypes = [
  {
    kind: 'board' as const,
    title: 'Comissão Diretiva',
    detail: 'Prepare pautas, analise assuntos e acompanhe as decisões internas da igreja.',
    icon: <Vote />,
  },
  {
    kind: 'administrative' as const,
    title: 'Reunião Administrativa',
    detail: 'Organize as reuniões e registre as decisões tomadas pela igreja.',
    icon: <ClipboardList />,
  },
]

export function CommissionsPage() {
  const { account, masterKey } = useAuthVault()
  const navigate = useNavigate()
  const [churches, setChurches] = useState<ChurchEntity[]>([])
  const [churchId, setChurchId] = useState('')
  const [meetings, setMeetings] = useState<Awaited<ReturnType<typeof service.meetings>>>([])
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!account || !masterKey) return
    try {
      const district = await districts.getDistrict(account.id, masterKey)
      const next = district ? await districts.listChurches(account.id, masterKey, district.id) : []
      setChurches(next)
      const selected = churchId || next[0]?.id || ''
      setChurchId(selected)
      setMeetings(await service.meetings(account.id, masterKey, selected))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível abrir Comissões.')
    }
  }, [account, masterKey, churchId])

  useReloadOnSync(load)

  const pending = meetings.filter((meeting) => !meeting.finalizedAt).length

  return <div className="page-stack commissions-page">
    <header className="page-hero">
      <div>
        <p className="eyebrow">Organização</p>
        <h1>Comissões</h1>
        <p>Prepare pautas, registre decisões e acompanhe encaminhamentos da igreja.</p>
      </div>
      <Link className="button button--secondary" to={`/app/comissoes/configurar?churchId=${encodeURIComponent(churchId)}`}>
        <Settings />Configurar igreja
      </Link>
    </header>

    {error && <div className="alert alert--error" role="alert">{error}</div>}

    <label className="field">
      <span className="field__label">Igreja</span>
      <select className="field__input" value={churchId} onChange={(event) => setChurchId(event.target.value)}>
        <option value="">Selecionar</option>
        {churches.map((church) => <option key={church.id} value={church.id}>{church.name}</option>)}
      </select>
    </label>

    <section className="dashboard-metrics" aria-label="Resumo de reuniões">
      <div><small>Próximas reuniões</small><strong>{meetings.filter((meeting) => meeting.date >= new Date().toISOString().slice(0, 10)).length}</strong></div>
      <div><small>Rascunhos em andamento</small><strong>{pending}</strong></div>
      <div><small>Aguardam ata</small><strong>{meetings.filter((meeting) => meeting.agenda.some((item) => item.vote) && !meeting.finalizedAt).length}</strong></div>
    </section>

    <div className="commission-type-grid">
      {commissionTypes.map((item) => <article className="commission-type-card" key={item.kind}>
        <Link
          className="commission-type-card__primary"
          to={kindPath(item.kind, churchId)}
          aria-label={`Abrir ${item.title}`}
          aria-disabled={!churchId}
          onClick={(event) => { if (!churchId) event.preventDefault() }}
        >
          <span className="commission-type-card__icon">{item.icon}</span>
          <span>
            <strong>{item.title}</strong>
            <small>{item.detail}</small>
          </span>
          <ArrowRight className="commission-type-card__arrow" />
        </Link>
        <Button
          className="commission-type-card__new"
          variant="secondary"
          disabled={!churchId}
          aria-label={`Nova reunião da ${item.title}`}
          icon={<Plus />}
          onClick={() => { void navigate(kindPath(item.kind, churchId, true)) }}
        >Nova reunião</Button>
      </article>)}

      <Card title="Comissão de Nomeações" action={<ClipboardCheck />} className="commission-nominations-card">
        <p>Forme a comissão, organize cargos e indicações, prepare o relatório e acompanhe a votação da igreja.</p>
        <Link className="button button--primary" to="/app/comissoes/nomeacoes">Abrir Nomeações</Link>
      </Card>
    </div>

    <Card title="Reuniões da igreja">
      {meetings.length ? <div className="entity-list">{meetings.map((meeting) => <Link className="entity-row entity-row--link" to={`/app/comissoes/${meeting.id}`} key={meeting.id}>
        <span><strong>{meeting.kind === 'board' ? 'Comissão Diretiva' : 'Reunião Administrativa'}</strong><small>{meeting.date} · {meeting.agenda.length} assunto(s)</small></span>
        <span>{meeting.finalizedAt ? 'Ata finalizada' : 'Abrir reunião'}</span>
      </Link>)}</div> : <div className="empty-state"><ClipboardList /><strong>Nenhuma reunião nesta igreja</strong></div>}
    </Card>
  </div>
}
