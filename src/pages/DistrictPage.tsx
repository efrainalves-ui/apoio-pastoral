import { Archive, Building2, Church, MapPin, Pencil, Plus, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuthVault } from '../auth/AuthVaultContext'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Field } from '../components/ui/Field'
import { DistrictService } from '../district/service'
import { ImportedChurchRepairService, previewImportedChurchNameCorrections, type ChurchNameCorrection } from '../district/importedChurchRepair'
import { CHURCH_STATUS_LABELS, CHURCH_TYPE_LABELS, type ChurchEntity, type DistrictEntity } from '../district/types'
import { DomainValidationError } from '../district/validation'
import { PeopleService } from '../people/service'

const service = new DistrictService()
const peopleService = new PeopleService()
const repairService = new ImportedChurchRepairService()

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : 'Não foi possível concluir a operação.'
}

export function DistrictPage() {
  const { account, masterKey } = useAuthVault()
  const [district, setDistrict] = useState<DistrictEntity | null>(null)
  const [churches, setChurches] = useState<ChurchEntity[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [name, setName] = useState('')
  const [nameError, setNameError] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [corrections, setCorrections] = useState<ChurchNameCorrection[] | null>(null)

  const load = useCallback(async () => {
    if (!account || !masterKey) return
    setLoading(true)
    setError('')
    try {
      const nextDistrict = await service.getDistrict(account.id, masterKey)
      setDistrict(nextDistrict)
      setName(nextDistrict?.name ?? '')
      const nextChurches = nextDistrict ? await service.listChurches(account.id, masterKey, nextDistrict.id) : []
      setChurches(nextChurches)
      const people = await peopleService.listPeople(account.id, masterKey)
      setCorrections(previewImportedChurchNameCorrections(nextChurches, people))
    } catch (loadError) {
      setError(messageFrom(loadError))
    } finally {
      setLoading(false)
    }
  }, [account, masterKey])

  useEffect(() => { void load() }, [load])

  async function saveDistrict(event: React.FormEvent) {
    event.preventDefault()
    if (!account || !masterKey) return
    setBusy(true)
    setError('')
    setNameError('')
    try {
      if (district) await service.updateDistrict(account.id, masterKey, district.id, name)
      else await service.createDistrict(account.id, masterKey, name)
      setEditing(false)
      await load()
    } catch (saveError) {
      if (saveError instanceof DomainValidationError) setNameError(saveError.fieldErrors.name ?? '')
      setError(messageFrom(saveError))
    } finally {
      setBusy(false)
    }
  }

  async function removeDistrict() {
    if (!account || !masterKey || !district) return
    setBusy(true)
    setError('')
    try {
      await service.deleteDistrict(account.id, masterKey, district.id)
      setConfirmDelete(false)
      await load()
    } catch (deleteError) {
      setError(messageFrom(deleteError))
      setConfirmDelete(false)
    } finally {
      setBusy(false)
    }
  }

  async function repairImportedChurches() {
    if (!account || !masterKey || !corrections) return
    setBusy(true); setError('')
    try {
      const result = await repairService.apply(account.id, masterKey, corrections)
      setCorrections(null)
      await load()
      if (result.warnings) setError(`${result.warnings} caso(s) precisam de revisão antes de unir igrejas com pessoas repetidas.`)
    } catch (repairError) { setError(messageFrom(repairError)) } finally { setBusy(false) }
  }

  if (loading) return <div className="app-loading" role="status">Abrindo o distrito…</div>

  if (!district) {
    return (
      <div className="page-stack page-narrow">
        <header className="page-hero"><div><p className="eyebrow">Distrito</p><h1>Seu distrito começa aqui.</h1><p>Organize as igrejas do seu distrito.</p></div></header>
        {error && <div className="alert alert--error" role="alert">{error}</div>}
        <Card className="district-empty-card">
          <div className="scope-icon"><Building2 /></div>
          <h2>Nenhum distrito cadastrado</h2>
          <p className="muted">Você pode criar o distrito manualmente ou começar por uma lista em PDF.</p>
          <form className="inline-form district-create-form" onSubmit={(event) => void saveDistrict(event)} noValidate>
            <Field label="Nome do distrito *" name="district-name" value={name} onChange={(event) => setName(event.target.value)} error={nameError} maxLength={120} autoFocus />
            <Button type="submit" disabled={busy} icon={<Plus size={18} />}>{busy ? 'Criando…' : 'Criar distrito'}</Button>
          </form>
        </Card>
      </div>
    )
  }

  const activeCount = churches.filter(({ status }) => status === 'active').length
  const archivedCount = churches.length - activeCount

  return (
    <div className="page-stack">
      <header className="page-hero district-hero">
        <div><p className="eyebrow">Distrito</p><h1>{district.name}</h1><p>Organize as igrejas do seu distrito.</p></div>
        <div className="page-actions">
          <Button variant="secondary" onClick={() => { setName(district.name); setEditing(true); setConfirmDelete(false) }} icon={<Pencil size={17} />}>Editar distrito</Button>
          <Button variant="danger" onClick={() => { setConfirmDelete(true); setEditing(false) }} icon={<Trash2 size={17} />}>Excluir distrito</Button>
        </div>
      </header>

      {error && <div className="alert alert--error" role="alert">{error}</div>}

      {corrections && corrections.length > 0 && <Card eyebrow="Importações anteriores" title="Corrigir nomes de igrejas importadas">
        <p className="card-copy">Confira os nomes antes de confirmar. A correção reúne vínculos de pessoas sem criar novos cadastros.</p>
        <div className="issue-list">{corrections.map((correction) => <div key={correction.churchId}><strong>{correction.from} → {correction.to}</strong><span>{correction.mergeIntoId ? `Unir com igreja já corrigida · ${correction.members} membro(s)` : `${correction.members} membro(s)`}{correction.warning ? ` · ${correction.warning}` : ''}</span></div>)}</div>
        <div className="form-actions"><Button onClick={() => void repairImportedChurches()} disabled={busy}>{busy ? 'Corrigindo nomes…' : 'Confirmar correção'}</Button><Button variant="secondary" onClick={() => setCorrections(null)} disabled={busy}>Agora não</Button></div>
      </Card>}

      {editing && (
        <Card eyebrow="Dados do distrito" title="Editar nome">
          <form className="inline-form" onSubmit={(event) => void saveDistrict(event)} noValidate>
            <Field label="Nome do distrito *" name="district-name-edit" value={name} onChange={(event) => setName(event.target.value)} error={nameError} maxLength={120} autoFocus />
            <div className="form-actions"><Button type="submit" disabled={busy}>Salvar alterações</Button><Button type="button" variant="secondary" onClick={() => setEditing(false)}>Cancelar</Button></div>
          </form>
        </Card>
      )}

      {confirmDelete && (
        <Card className="danger-card" aria-live="polite">
          <h2>Excluir este distrito?</h2>
          <p>Remova as igrejas antes de excluir o distrito.</p>
          <div className="form-actions"><Button variant="danger" onClick={() => void removeDistrict()} disabled={busy}>Confirmar exclusão</Button><Button variant="secondary" onClick={() => setConfirmDelete(false)}>Cancelar</Button></div>
        </Card>
      )}

      <section className="district-metrics" aria-label="Resumo do distrito">
        <div><small>Total de igrejas</small><strong>{churches.length}</strong></div>
        <div><small>Ativas</small><strong>{activeCount}</strong></div>
        <div><small>Arquivadas</small><strong>{archivedCount}</strong></div>
      </section>

      <Card eyebrow="Igrejas" title="Unidades do distrito" action={<Link className="button button--primary" to="/app/distrito/igrejas/nova"><Plus size={18} /><span>Nova igreja</span></Link>}>
        {churches.length === 0 ? (
          <div className="empty-state church-empty"><Church /><strong>Nenhuma igreja cadastrada</strong><span>Cadastre uma igreja organizada, grupo ou ponto de pregação.</span><Link className="text-link" to="/app/distrito/igrejas/nova">Cadastrar primeira igreja</Link></div>
        ) : (
          <div className="church-grid">
            {churches.map((church) => (
              <Link className="church-card" key={church.id} to={`/app/distrito/igrejas/${church.id}`}>
                <div className="church-card__top"><span className="church-card__icon">{church.status === 'archived' ? <Archive /> : <Church />}</span><span className={`entity-badge entity-badge--${church.status}`}>{CHURCH_STATUS_LABELS[church.status]}</span></div>
                <h3>{church.name}</h3>
                <p>{CHURCH_TYPE_LABELS[church.type]}</p>
                <span className="church-card__address"><MapPin />{church.address || 'Endereço não informado'}</span>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
