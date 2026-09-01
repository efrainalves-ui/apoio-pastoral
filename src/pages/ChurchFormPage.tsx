import { ArrowLeft, Clock3, Plus, Save, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuthVault } from '../auth/AuthVaultContext'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Field } from '../components/ui/Field'
import { DistrictService } from '../district/service'
import {
  allowedChurchTypes,
  CHURCH_STATUS_LABELS,
  CHURCH_TYPE_LABELS,
  emptyChurchInput,
  WEEKDAY_LABELS,
  WEEKDAYS,
  type ChurchEntity,
  type ChurchInput,
  type ChurchStatus,
  type ChurchType,
} from '../district/types'
import { DomainValidationError, type FieldErrors, validateChurchInput } from '../district/validation'

const service = new DistrictService()

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : 'Não foi possível salvar a igreja.'
}

function churchToInput(church: ChurchEntity): ChurchInput {
  return {
    name: church.name,
    type: church.type,
    externalCode: church.externalCode,
    address: church.address,
    worshipSchedules: church.worshipSchedules,
    administrativeNotes: church.administrativeNotes,
    status: church.status,
  }
}

export function ChurchFormPage() {
  const { churchId } = useParams<{ churchId: string }>()
  const editing = Boolean(churchId)
  const { account, masterKey } = useAuthVault()
  const navigate = useNavigate()
  const [districtId, setDistrictId] = useState('')
  const [districtName, setDistrictName] = useState('')
  const [currentChurch, setCurrentChurch] = useState<ChurchEntity | null>(null)
  const [input, setInput] = useState<ChurchInput>(emptyChurchInput)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!account || !masterKey) return
    setLoading(true)
    try {
      const district = await service.getDistrict(account.id, masterKey)
      if (!district) throw new Error('Crie o distrito antes de cadastrar uma igreja.')
      setDistrictId(district.id)
      setDistrictName(district.name)
      if (churchId) {
        const church = await service.getChurch(account.id, masterKey, churchId)
        if (!church || church.districtId !== district.id) throw new Error('Igreja não encontrada.')
        setCurrentChurch(church)
        setInput(churchToInput(church))
      }
    } catch (loadError) {
      setError(messageFrom(loadError))
    } finally {
      setLoading(false)
    }
  }, [account, churchId, masterKey])

  useEffect(() => { void load() }, [load])

  function update<K extends keyof ChurchInput>(field: K, value: ChurchInput[K]) {
    setInput((current) => ({ ...current, [field]: value }))
    setFieldErrors((current) => ({ ...current, [field]: '' }))
  }

  function addSchedule() {
    update('worshipSchedules', [...input.worshipSchedules, { id: crypto.randomUUID(), day: 'saturday', time: '09:00' }])
  }

  function updateSchedule(index: number, field: 'day' | 'time', value: string) {
    update('worshipSchedules', input.worshipSchedules.map((schedule, scheduleIndex) => scheduleIndex === index ? { ...schedule, [field]: value } : schedule))
    setFieldErrors((current) => ({ ...current, [`schedule-${index}`]: '' }))
  }

  function removeSchedule(index: number) {
    update('worshipSchedules', input.worshipSchedules.filter((_, scheduleIndex) => scheduleIndex !== index))
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!account || !masterKey || !districtId) return
    const errors = validateChurchInput(input, currentChurch?.type)
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) {
      setError('Revise os campos destacados.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const saved = churchId
        ? await service.updateChurch(account.id, masterKey, churchId, input)
        : await service.createChurch(account.id, masterKey, districtId, input)
      await navigate(`/app/distrito/igrejas/${saved.id}`, { replace: true })
    } catch (saveError) {
      if (saveError instanceof DomainValidationError) setFieldErrors(saveError.fieldErrors)
      setError(messageFrom(saveError))
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <div className="app-loading" role="status">Abrindo o formulário…</div>

  if (!districtId) {
    return <div className="page-stack page-narrow"><div className="alert alert--error" role="alert">{error}</div><Link className="text-link" to="/app/distrito"><ArrowLeft />Voltar ao distrito</Link></div>
  }

  const typeOptions = allowedChurchTypes(currentChurch?.type)
  const cancelPath = churchId ? `/app/distrito/igrejas/${churchId}` : '/app/distrito'

  return (
    <div className="page-stack page-narrow">
      <Link className="text-link back-link" to={cancelPath}><ArrowLeft />Voltar</Link>
      <header className="page-hero"><div><p className="eyebrow">{districtName}</p><h1>{editing ? 'Editar igreja' : 'Nova igreja'}</h1><p>Nome e tipo são obrigatórios. Só o nome e o tipo são obrigatórios.</p></div></header>
      {error && <div className="alert alert--error" role="alert">{error}</div>}

      <form className="church-form" onSubmit={(event) => void submit(event)} noValidate>
        <Card eyebrow="Identificação" title="Dados principais">
          <div className="form-grid">
            <Field label="Nome da igreja *" name="church-name" value={input.name} onChange={(event) => update('name', event.target.value)} error={fieldErrors.name} maxLength={160} autoFocus />
            <label className="field" htmlFor="church-type"><span className="field__label">Tipo *</span><select id="church-type" className="field__input" value={input.type} onChange={(event) => update('type', event.target.value as ChurchType | '')} aria-invalid={Boolean(fieldErrors.type)}><option value="">Selecione</option>{typeOptions.map((type) => <option value={type} key={type}>{CHURCH_TYPE_LABELS[type]}</option>)}</select>{fieldErrors.type && <span className="field__error">{fieldErrors.type}</span>}{currentChurch && <span className="field__hint">A evolução preserva o histórico e não permite retrocesso.</span>}</label>
            <Field label="Código externo (opcional)" name="external-code" value={input.externalCode} onChange={(event) => update('externalCode', event.target.value)} error={fieldErrors.externalCode} maxLength={80} />
            <label className="field" htmlFor="church-status"><span className="field__label">Situação *</span><select id="church-status" className="field__input" value={input.status} onChange={(event) => update('status', event.target.value as ChurchStatus)} aria-invalid={Boolean(fieldErrors.status)}>{(Object.keys(CHURCH_STATUS_LABELS) as ChurchStatus[]).map((status) => <option value={status} key={status}>{CHURCH_STATUS_LABELS[status]}</option>)}</select>{fieldErrors.status && <span className="field__error">{fieldErrors.status}</span>}</label>
          </div>
        </Card>

        <Card eyebrow="Localização" title="Endereço">
          <label className="field" htmlFor="church-address"><span className="field__label">Endereço</span><textarea id="church-address" className="field__input field__textarea" value={input.address} onChange={(event) => update('address', event.target.value)} maxLength={500} aria-invalid={Boolean(fieldErrors.address)} placeholder="Rua, número, bairro, cidade e estado" />{fieldErrors.address && <span className="field__error">{fieldErrors.address}</span>}</label>
        </Card>

        <Card eyebrow="Agenda regular" title="Dias e horários de culto" action={<Button type="button" variant="secondary" onClick={addSchedule} icon={<Plus size={17} />}>Adicionar horário</Button>}>
          {input.worshipSchedules.length === 0 ? <div className="empty-state compact-empty"><Clock3 /><strong>Nenhum horário informado</strong><span>Este campo é opcional e pode ser preenchido depois.</span></div> : (
            <div className="schedule-editor">
              {input.worshipSchedules.map((schedule, index) => (
                <div className="schedule-row" key={schedule.id}>
                  <label className="field" htmlFor={`schedule-day-${schedule.id}`}><span className="field__label">Dia</span><select id={`schedule-day-${schedule.id}`} className="field__input" value={schedule.day} onChange={(event) => updateSchedule(index, 'day', event.target.value)}>{WEEKDAYS.map((day) => <option key={day} value={day}>{WEEKDAY_LABELS[day]}</option>)}</select></label>
                  <Field label="Horário" name={`schedule-time-${schedule.id}`} type="time" value={schedule.time} onChange={(event) => updateSchedule(index, 'time', event.target.value)} error={fieldErrors[`schedule-${index}`]} />
                  <button className="icon-button schedule-remove" type="button" onClick={() => removeSchedule(index)} aria-label={`Remover horário ${index + 1}`}><Trash2 /></button>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card eyebrow="Uso interno" title="Observações administrativas">
          <label className="field" htmlFor="administrative-notes"><span className="field__label">Observações</span><textarea id="administrative-notes" className="field__input field__textarea field__textarea--large" value={input.administrativeNotes} onChange={(event) => update('administrativeNotes', event.target.value)} maxLength={2000} aria-invalid={Boolean(fieldErrors.administrativeNotes)} placeholder="Informações administrativas opcionais" />{fieldErrors.administrativeNotes && <span className="field__error">{fieldErrors.administrativeNotes}</span>}</label>
        </Card>

        <div className="form-actions form-actions--sticky"><Button type="submit" disabled={busy} icon={<Save size={18} />}>{busy ? 'Salvando no aplicativo…' : 'Salvar igreja'}</Button><Link className="button button--secondary" to={cancelPath}><span>Cancelar</span></Link></div>
      </form>
    </div>
  )
}
