import { ArrowLeft, CheckCircle2, FileSearch, FileUp, LockKeyhole, RotateCcw, TriangleAlert } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuthVault } from '../auth/AuthVaultContext'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { DistrictService } from '../district/service'
import type { ChurchEntity } from '../district/types'
import { extractPdfText, pdfHash, validatePdfFile } from '../imports/pdf'
import { parseFidelityText } from '../imports/parsers'
import { ImportService } from '../imports/service'
import type { FidelityImportPreview, ImportBatchEntity, ImportIssue } from '../imports/types'
import { PeopleService } from '../people/service'
import { FIDELITY_CATEGORY_LABELS, type FidelitySnapshot, type PersonEntity } from '../people/types'
import { fidelityCareSummary, isFaithfulByAge, isFidelityCareCandidate } from '../people/fidelitySummary'
import { calculateAge } from '../people/dates'

const imports = new ImportService()
const peopleService = new PeopleService()
const districtService = new DistrictService()

function fidelityDetail(value: FidelitySnapshot): string {
  if (value.precision === 'exact' && value.months !== null) return `${value.months} ${value.months === 1 ? 'mês' : 'meses'} no período`
  if (value.precision === 'range') return `Faixa ${value.rangeMin}–${value.rangeMax} meses`
  return 'Categoria informada pelo relatório'
}

export function FidelityPage() {
  const { account, masterKey } = useAuthVault()
  const [people, setPeople] = useState<PersonEntity[]>([])
  const [churches, setChurches] = useState<ChurchEntity[]>([])
  const [batches, setBatches] = useState<ImportBatchEntity[]>([])
  const [preview, setPreview] = useState<FidelityImportPreview | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [churchId, setChurchId] = useState('')
  const [category, setCategory] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [report, setReport] = useState<ImportBatchEntity | null>(null)
  const [autoSummary, setAutoSummary] = useState<{ resolved: number; pending: number; manual: number } | null>(null)
  const [manualChurches, setManualChurches] = useState<Record<string, string>>({})
  const [assessmentOpen, setAssessmentOpen] = useState(false)

  const load = useCallback(async () => {
    if (!account || !masterKey) return
    const district = await districtService.getDistrict(account.id, masterKey)
    const [nextPeople, nextChurches, nextBatches] = await Promise.all([
      peopleService.listPeople(account.id, masterKey),
      district ? districtService.listChurches(account.id, masterKey, district.id) : [],
      imports.listBatches(account.id, masterKey, 'fidelity'),
    ])
    setPeople(nextPeople); setChurches(nextChurches); setBatches(nextBatches)
  }, [account, masterKey])

  useEffect(() => { void load() }, [load])
  const fidelityPeople = useMemo(() => people.filter((person) => person.fidelity && (!churchId || person.currentChurchId === churchId) && (!category || person.fidelity.category === category)), [category, churchId, people])
  const percent = (count: number, total: number) => total ? `${Math.round(count / total * 100)}%` : '0%'
  const churchName = (id: string) => churches.find((church) => church.id === id)?.name ?? 'Igreja'

  async function analyze(text: string, hash: string) {
    if (!account || !masterKey) return
    setPreview(await imports.previewFidelity(account.id, masterKey, hash, parseFidelityText(text), people, churches))
    setConfirmed(false); setReport(null); setAutoSummary(null); setManualChurches({})
  }

  async function selectFile(file: File | undefined) {
    if (!file) return
    setBusy(true); setError('')
    try {
      validatePdfFile(file)
      const bytes = await file.arrayBuffer()
      const [hash, pdfText] = await Promise.all([pdfHash(bytes), extractPdfText(bytes)])
      await analyze(pdfText, hash)
    } catch (reason) {
      setPreview(null)
      setError(reason instanceof Error ? reason.message : 'Não foi possível analisar o PDF.')
    } finally { setBusy(false) }
  }

  async function simulate() {
    setBusy(true); setError('')
    try {
      const withChurch = people.filter((person) => churches.some(({ id }) => id === person.currentChurchId)).slice(0, 3)
      if (!withChurch.length) throw new Error('Cadastre pessoas antes de importar fidelidade.')
      const tokens = ['FAIXA_8_12', 'FAIXA_1_7', 'CATEGORIA_SEM_REGISTRO']
      const pdfText = withChurch.map((person, index) => `${churchName(person.currentChurchId)};${person.name};${tokens[index] ?? 'FAIXA_8_12'}`).join('\n')
      await analyze(pdfText, `simulated-fidelity-v2-${withChurch.map(({ id }) => id).join('-')}`)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível preparar a demonstração.') }
    finally { setBusy(false) }
  }

  function resolveIssue(item: ImportIssue, personId: string) {
    if (!preview) return
    try { setPreview(imports.resolveFidelityIssue(preview, item.id, personId, people, churches)); setConfirmed(false); setError('') }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível confirmar a correspondência.') }
  }

  function locateAutomatically() {
    if (!preview) return
    try { const result = imports.locateFidelityIssuesAutomatically(preview, people, churches); setPreview(result.preview); setAutoSummary({ resolved: result.resolved, pending: result.pending, manual: result.manual }); setConfirmed(false); setError('') }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível localizar as pessoas automaticamente.') }
  }

  function undoAssociation(personId: string) { if (preview) { setPreview(imports.undoFidelityIssueAssociation(preview, personId)); setAutoSummary(null); setConfirmed(false) } }

  async function apply() {
    if (!account || !masterKey || !preview || !confirmed) return
    setBusy(true); setError('')
    try { const result = await imports.applyPreview(account.id, masterKey, preview); setReport(result.batch); setPreview(null); setConfirmed(false); await load() }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível aplicar.') }
    finally { setBusy(false) }
  }

  async function undo() {
    if (!account || !masterKey) return
    setBusy(true); setError('')
    try { await imports.undoLatest(account.id, masterKey, 'fidelity'); await load() }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível desfazer.') }
    finally { setBusy(false) }
  }

  async function updateIncome(person: PersonEntity, incomeStatus: PersonEntity['incomeStatus']) {
    if (!account || !masterKey) return
    setBusy(true); setError('')
    try { await peopleService.updateIncomeStatus(account.id, masterKey, person.id, incomeStatus); await load() }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível atualizar a situação de renda.') }
    finally { setBusy(false) }
  }

  const total = people.filter(({ fidelity }) => fidelity).length
  const tither = people.filter(({ fidelity }) => fidelity?.category === 'tither').length
  const nonSystematicTither = people.filter(({ fidelity }) => fidelity?.category === 'non_systematic_tither').length
  const nonTither = people.filter(({ fidelity }) => fidelity?.category === 'non_tither').length
  const selectedPeople = people.filter((person) => !churchId || person.currentChurchId === churchId)
  const careSummary = fidelityCareSummary(selectedPeople)
  const toEvaluate = selectedPeople.filter((person) => isFidelityCareCandidate(person) && !isFaithfulByAge(person) && person.incomeStatus === 'unknown')
  const incomeCandidates = selectedPeople.filter(isFidelityCareCandidate)
  const assessmentChurchId = churchId || churches[0]?.id || ''
  const assessmentPeople = people.filter((person) => person.currentChurchId === assessmentChurchId && isFidelityCareCandidate(person) && !isFaithfulByAge(person) && person.incomeStatus === 'unknown')

  if (assessmentOpen) return <div className="page-stack"><Link className="text-link back-link" to="/app/fidelidade" onClick={() => setAssessmentOpen(false)}><ArrowLeft />Voltar à fidelidade</Link><header className="page-hero"><div><p className="eyebrow">Avaliação</p><h1>{churchName(assessmentChurchId)}</h1><p>Avalie somente a situação de renda, sem registrar valores.</p></div></header><Card title="Pessoas a avaliar"><label className="field"><span className="field__label">Igreja</span><select className="field__input" value={assessmentChurchId} onChange={(event) => setChurchId(event.target.value)}>{churches.map((church) => <option key={church.id} value={church.id}>{church.name}</option>)}</select></label><p className="card-copy">{assessmentPeople.length} pessoa(s) a avaliar.</p>{assessmentPeople.length === 0 ? <div className="empty-state compact-empty"><CheckCircle2 /><strong>Nenhuma pessoa pendente nesta igreja</strong></div> : <div className="entity-list">{assessmentPeople.map((person) => <div className="entity-row" key={person.id}><span><strong>{person.name}</strong><small>{FIDELITY_CATEGORY_LABELS[person.fidelity!.category]} · {calculateAge(person.birthDate)} anos</small></span><div className="form-actions"><Button variant="secondary" disabled={busy} onClick={() => void updateIncome(person, 'has_income')}>Tem renda</Button><Button variant="secondary" disabled={busy} onClick={() => void updateIncome(person, 'no_income')}>Não tem renda</Button><Button variant="secondary" disabled={busy}>Deixar para depois</Button></div></div>)}</div>}</Card></div>

  return <div className="page-stack">
    <Link className="text-link back-link" to="/app/mais"><ArrowLeft />Voltar</Link>
    <header className="page-hero"><div><p className="eyebrow">Fidelidade</p><h1>Fidelidade nos dízimos</h1></div><LockKeyhole /></header>
    {error && <div className="alert alert--error" role="alert">{error}</div>}
    <section className="district-metrics fidelity-metrics"><div><small>Não dizimistas</small><strong>{nonTither} · {percent(nonTither, total)}</strong></div><div><small>Dizimistas não sistemáticos</small><strong>{nonSystematicTither} · {percent(nonSystematicTither, total)}</strong></div><div><small>Dizimistas</small><strong>{tither} · {percent(tither, total)}</strong></div></section>
    <Card eyebrow={churchId ? churchName(churchId) : 'Distrito'} title="Fidelidade da igreja"><div className="private-summary"><div><span>Fiéis</span><strong>{careSummary.faithful}</strong></div><div><span>Em acompanhamento</span><strong>{careSummary.followingUp}</strong></div><button type="button" onClick={() => setAssessmentOpen(true)}><span>A avaliar</span><strong>{careSummary.toEvaluate}</strong></button></div><p className="field__hint">Fiéis reúne dizimistas, pessoas sem renda e pessoas de até 15 anos. A partir de 16 anos, quem não for dizimista sistemático entra na avaliação normal.</p></Card>
    <Card eyebrow="Importação local" title="Selecionar PDF de fidelidade">
      <label className="file-picker"><FileUp /><span><strong>{busy ? 'Lendo o PDF…' : 'Escolher PDF'}</strong><small>O arquivo é processado somente neste dispositivo e não é mantido.</small></span><input type="file" accept="application/pdf,.pdf" disabled={busy} onChange={(event) => { void selectFile(event.target.files?.[0]); event.currentTarget.value = '' }} /></label>
      <div className="form-actions"><Button variant="secondary" onClick={() => void simulate()} disabled={busy} icon={<FileSearch />}>Usar importação fictícia simulada</Button><Button variant="secondary" disabled={!preview || busy} onClick={locateAutomatically}>Tentar localizar automaticamente</Button></div>
    </Card>
    {preview && <Card eyebrow="Prévia obrigatória" title="Conferir fidelidade">
      {preview.alreadyImported && <div className="alert alert--success">Este PDF já foi aplicado com a classificação atual; nada será duplicado.</div>}
      <h3>Totais gerais do relatório</h3>
      <div className="import-metrics"><div><small>Linhas</small><strong>{preview.parsedRows}</strong></div><div><small>Não dizimistas</small><strong>{preview.categories.nonTither}</strong></div><div><small>Dizimistas não sistemáticos</small><strong>{preview.categories.nonSystematicTither}</strong></div><div><small>Dizimistas</small><strong>{preview.categories.tither}</strong></div></div>
      <h3>Associações seguras</h3>
      <div className="import-metrics"><div><small>Correspondências</small><strong>{preview.changes.length + preview.unchanged}</strong></div><div><small>Alterações</small><strong>{preview.changes.length}</strong></div><div><small>Sem mudança</small><strong>{preview.unchanged}</strong></div><div><small>Divergências</small><strong>{preview.issues.length}</strong></div><div><small>Não dizimistas</small><strong>{preview.associatedCategories.nonTither}</strong></div><div><small>Dizimistas não sistemáticos</small><strong>{preview.associatedCategories.nonSystematicTither}</strong></div><div><small>Dizimistas</small><strong>{preview.associatedCategories.tither}</strong></div></div>
      {autoSummary && <div className="alert alert--success">{autoSummary.resolved} divergência(s) resolvida(s) automaticamente; {autoSummary.pending} pendente(s); {autoSummary.manual} para revisão manual. Fidelidade associada à igreja onde a pessoa já está cadastrada.</div>}
      {(preview.resolvedIssues?.length ?? 0) > 0 && <div className="issue-list"><h3>Associações preparadas</h3>{preview.resolvedIssues!.map((association) => <div key={association.issue.id}><span><strong>{association.issue.displayName}</strong><small>{association.automatic ? 'Fidelidade associada à igreja onde a pessoa já está cadastrada.' : 'Associação escolhida manualmente.'}</small></span><Button variant="secondary" onClick={() => undoAssociation(association.personId)}>Desfazer associação</Button></div>)}</div>}
      {preview.issues.length > 0 && <div className="issue-list"><h3><TriangleAlert />Divergências preservadas para revisão</h3>{preview.issues.map((item) => {
        const selectedChurchId = manualChurches[item.id] ?? ''
        const candidates = people.filter((person) => person.currentChurchId === selectedChurchId && !preview.changes.some((change) => change.personId === person.id))
        const reviewable = Boolean(item.sourceRow && (item.kind === 'person_not_found' || item.kind === 'ambiguous_person'))
        return <div key={item.id} className="import-issue"><span><strong>{item.displayName}</strong><small>{item.churchName} · {item.message}</small></span>{reviewable && <span className="manual-match"><label><span className="sr-only">Igreja para {item.displayName}</span><select value={selectedChurchId} onChange={(event) => setManualChurches((current) => ({ ...current, [item.id]: event.target.value }))}><option value="">Escolher igreja…</option>{churches.map((church) => <option key={church.id} value={church.id}>{church.name}</option>)}</select></label>{selectedChurchId && <label><span className="sr-only">Pessoa para {item.displayName}</span><select defaultValue="" onChange={(event) => event.target.value && resolveIssue(item, event.target.value)}><option value="">Escolher pessoa em {churches.find((church) => church.id === selectedChurchId)?.name}…</option>{candidates.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>}</span>}</div>
      })}</div>}
      <label className="confirmation-check"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span>Revisei as correspondências. Confirmo que a classificação será privada e não será usada para condenar ou automatizar decisões.</span></label>
      <Button disabled={!confirmed || busy || preview.alreadyImported} onClick={() => void apply()} icon={<CheckCircle2 />}>Confirmar e aplicar</Button>
    </Card>}
    {report && <Card eyebrow="Relatório final" title="Fidelidade atualizada"><div className="alert alert--success"><CheckCircle2 />{report.summary.updated} pessoa(s) atualizada(s); {report.summary.issues} divergência(s) preservada(s) no histórico protegido.</div></Card>}
    <Card eyebrow="Visão nominal privada" title="Pessoas e categorias">
      <div className="filter-bar"><label className="field"><span className="field__label">Igreja</span><select className="field__input" value={churchId} onChange={(event) => setChurchId(event.target.value)}><option value="">Todas</option>{churches.map((church) => <option key={church.id} value={church.id}>{church.name}</option>)}</select></label><label className="field"><span className="field__label">Categoria</span><select className="field__input" value={category} onChange={(event) => setCategory(event.target.value)}><option value="">Todas</option>{Object.entries(FIDELITY_CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
      {fidelityPeople.length === 0 ? <div className="empty-state"><LockKeyhole /><strong>Nenhuma informação neste filtro</strong></div> : <div className="entity-list">{fidelityPeople.map((person) => <Link className="entity-row" key={person.id} to={`/app/pessoas/${person.id}`}><span className="avatar">{person.name[0]}</span><span><strong>{person.name}</strong><small>{churchName(person.currentChurchId)}</small></span><span className="entity-badge entity-badge--active">{FIDELITY_CATEGORY_LABELS[person.fidelity!.category]}</span><span>{fidelityDetail(person.fidelity!)}</span></Link>)}</div>}
    </Card>
    <Card eyebrow="Acompanhamento" title="Pessoas para avaliar"><p className="card-copy">Pessoas com 16 anos ou mais, não dizimistas ou dizimistas não sistemáticos, cuja situação de renda ainda não foi avaliada.</p>{toEvaluate.length === 0 ? <div className="empty-state compact-empty"><CheckCircle2 /><strong>Nenhuma pessoa pendente de avaliação</strong></div> : <div className="entity-list">{toEvaluate.map((person) => <div className="entity-row" key={person.id}><span><strong>{person.name}</strong><small>{churchName(person.currentChurchId)} · {FIDELITY_CATEGORY_LABELS[person.fidelity!.category]} · {calculateAge(person.birthDate)} anos</small></span><Button variant="secondary" onClick={() => { setChurchId(person.currentChurchId); setAssessmentOpen(true) }}>Avaliar</Button></div>)}</div>}</Card>
    <Card eyebrow="Acompanhamento" title="Situação de renda">{incomeCandidates.length === 0 ? <p className="muted">Não há pessoas nesta classificação.</p> : <div className="entity-list">{incomeCandidates.map((person) => <div className="entity-row" key={person.id}><span><strong>{person.name}</strong><small>{churchName(person.currentChurchId)} · {FIDELITY_CATEGORY_LABELS[person.fidelity!.category]}</small></span><label className="field"><span className="field__label">Situação de renda</span><select className="field__input" value={person.incomeStatus} disabled={busy} onChange={(event) => void updateIncome(person, event.target.value as PersonEntity['incomeStatus'])}><option value="unknown">Ainda não avaliada</option><option value="has_income">Tem renda</option><option value="no_income">Não tem renda</option></select></label></div>)}</div>}</Card>
    <Card eyebrow="Por igreja" title="Fidelidade da igreja"><div className="fidelity-church-table">{churches.map((church) => { const group = people.filter((person) => person.currentChurchId === church.id); const summary = fidelityCareSummary(group); return <button className="fidelity-church-row" type="button" key={church.id} onClick={() => setChurchId(church.id)}><strong>{church.name}</strong><span><small>Fiéis</small>{summary.faithful}</span><span><small>Em acompanhamento</small>{summary.followingUp}</span><span><small>A avaliar</small>{summary.toEvaluate}</span></button> })}</div><p className="field__hint">Selecione uma igreja para ver suas pessoas. Não há ranking ou valores financeiros.</p></Card>
    <Card eyebrow="Histórico" title="Importações de fidelidade" action={batches.some(({ status }) => status === 'applied') ? <Button variant="secondary" onClick={() => void undo()} disabled={busy} icon={<RotateCcw />}>Desfazer última</Button> : null}>{batches.length === 0 ? <div className="empty-state compact-empty"><FileSearch /><strong>Nenhuma importação</strong></div> : <div className="import-history">{batches.map((batch) => <div key={batch.id}><span><strong>{new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(batch.appliedAt))}</strong><small>{batch.status === 'applied' ? 'Aplicada' : 'Desfeita'} · modelo {batch.modelVersion ?? 1}</small></span><span>{batch.summary.updated} atualizações · {batch.summary.issues} divergências</span></div>)}</div>}</Card>
  </div>
}
