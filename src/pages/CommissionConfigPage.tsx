import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuthVault } from '../auth/AuthVaultContext'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { CommissionService } from '../commissions/service'
import { DistrictService } from '../district/service'
import type { ChurchEntity } from '../district/types'
import { PeopleService } from '../people/service'
import type { PersonEntity } from '../people/types'

const commissions = new CommissionService()
const districts = new DistrictService()
const peopleService = new PeopleService()

export function CommissionConfigPage() {
  const { account, masterKey } = useAuthVault()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const requestedChurchId = searchParams.get('churchId') ?? ''
  const requestedReturn = searchParams.get('returnTo') ?? ''
  const returnTo = requestedReturn.startsWith('/app/comissoes/') ? requestedReturn : '/app/comissoes'
  const [churches, setChurches] = useState<ChurchEntity[]>([])
  const [people, setPeople] = useState<PersonEntity[]>([])
  const [churchId, setChurchId] = useState(requestedChurchId)
  const [year, setYear] = useState(new Date().getFullYear())
  const [members, setMembers] = useState<string[]>([])
  const [president, setPresident] = useState('')
  const [secretary, setSecretary] = useState('')
  const [boardQuorum, setBoardQuorum] = useState(0)
  const [administrativeQuorum, setAdministrativeQuorum] = useState(0)
  const [nextBoardVote, setNextBoardVote] = useState(1)
  const [nextAdministrativeVote, setNextAdministrativeVote] = useState(1)
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!account || !masterKey) return
    setLoading(true)
    try {
      const district = await districts.getDistrict(account.id, masterKey)
      const nextChurches = district ? await districts.listChurches(account.id, masterKey, district.id) : []
      const selected = requestedChurchId || churchId || nextChurches[0]?.id || ''
      setChurches(nextChurches)
      setPeople(await peopleService.listPeople(account.id, masterKey))
      setChurchId(selected)
      if (selected) {
        const config = await commissions.config(account.id, masterKey, selected)
        setYear(config?.year ?? new Date().getFullYear())
        setMembers(config?.boardMemberIds ?? [])
        setPresident(config?.boardPresidentId ?? '')
        setSecretary(config?.secretaryId ?? '')
        setBoardQuorum(config?.boardQuorum ?? 0)
        setAdministrativeQuorum(config?.administrativeQuorum ?? 0)
        setNextBoardVote(config?.nextBoardVote ?? 1)
        setNextAdministrativeVote(config?.nextAdministrativeVote ?? 1)
      }
    } finally {
      setLoading(false)
    }
  }, [account, masterKey, requestedChurchId, churchId])

  useEffect(() => { void load() }, [load])

  async function save() {
    if (!account || !masterKey || !churchId || busy) return
    setBusy(true)
    setNotice('')
    try {
      const saved = await commissions.saveConfig(account.id, masterKey, {
        churchId,
        year,
        boardMemberIds: members,
        boardPresidentId: president,
        secretaryId: secretary,
        boardQuorum,
        administrativeQuorum,
        nextBoardVote,
        nextAdministrativeVote,
      })
      setNextBoardVote(saved.nextBoardVote)
      setNextAdministrativeVote(saved.nextAdministrativeVote)
      if (requestedReturn) void navigate(returnTo, { replace: true })
      else setNotice('Configuração anual salva.')
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : 'Não foi possível salvar.')
    } finally {
      setBusy(false)
    }
  }

  const options = people.filter((person) => !churchId || person.currentChurchId === churchId)

  return <div className="page-stack commission-config-page">
    <Link className="text-link back-link" to="/app/comissoes">Voltar a Comissões</Link>
    <header className="page-hero"><div><p className="eyebrow">Configuração anual</p><h1>Configuração de Comissões</h1><p>Defina os responsáveis e os quóruns aprovados pela igreja.</p></div></header>
    {notice && <div className={notice.includes('salva') ? 'alert alert--success' : 'alert alert--error'} role="status">{notice}</div>}
    {requestedReturn && <div className="commission-return-note">Depois de salvar, você voltará automaticamente para criar a reunião.</div>}

    <Card title="Igreja e quóruns">
      <div className="form-grid">
        <label className="field"><span className="field__label">Igreja</span><select className="field__input" disabled={loading} value={churchId} onChange={(event) => setChurchId(event.target.value)}>{churches.map((church) => <option key={church.id} value={church.id}>{church.name}</option>)}</select></label>
        <label className="field"><span className="field__label">Ano eclesiástico</span><input className="field__input" disabled={loading} type="number" value={year} onChange={(event) => setYear(Number(event.target.value))} /></label>
        <label className="field"><span className="field__label">Quórum da Comissão Diretiva</span><input className="field__input" disabled={loading} type="number" min="1" value={boardQuorum || ''} onChange={(event) => setBoardQuorum(Number(event.target.value))} /></label>
        <label className="field"><span className="field__label">Quórum da Reunião Administrativa</span><input className="field__input" disabled={loading} type="number" min="1" value={administrativeQuorum || ''} onChange={(event) => setAdministrativeQuorum(Number(event.target.value))} /></label>
      </div>
      <p className="muted">Próximo voto da Comissão Diretiva: {year}-{String(nextBoardVote).padStart(3, '0')} · Próximo voto da Reunião Administrativa: {year}-{String(nextAdministrativeVote).padStart(3, '0')}</p>
    </Card>

    <Card title="Pessoas responsáveis">
      <p>Marque os membros que compõem a Comissão Diretiva neste ano.</p>
      <div className="checkbox-grid">{options.map((person) => <label className="choice-card" key={person.id}><input type="checkbox" disabled={loading} checked={members.includes(person.id)} onChange={() => setMembers(members.includes(person.id) ? members.filter((id) => id !== person.id) : [...members, person.id])} /><span>{person.name}</span></label>)}</div>
      <div className="form-grid">
        <label className="field"><span className="field__label">Presidente</span><select className="field__input" disabled={loading} value={president} onChange={(event) => setPresident(event.target.value)}><option value="">Selecionar</option>{options.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
        <label className="field"><span className="field__label">Secretário(a)</span><select className="field__input" disabled={loading} value={secretary} onChange={(event) => setSecretary(event.target.value)}><option value="">Selecionar</option>{options.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
      </div>
      <Button disabled={loading || busy} onClick={() => void save()}>{busy ? 'Salvando…' : 'Salvar configuração'}</Button>
    </Card>
  </div>
}
