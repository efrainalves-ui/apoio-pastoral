import { ArrowLeft, FileUp } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuthVault } from '../auth/AuthVaultContext'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Field } from '../components/ui/Field'
import {
  AREA_TARGET_METRIC, AREA_USES_PDF, GOAL_AREAS, GOAL_AREA_LABELS,
  areaProgress, churchProgress, monthlyResults, type GoalArea,
} from '../goals/areas'
import { MONTH_LABELS, formatGoalValue } from '../goals/format'
import { GoalsService, parseGoalsPdf } from '../goals/service'
import type { GoalImportPreview } from '../goals/types'
import { useGoalSources } from '../goals/useGoalSources'
import { extractPdfText, pdfHash, validatePdfFile } from '../imports/pdf'

const goalsService = new GoalsService()

export function GoalAreaPage() {
  const { account, masterKey } = useAuthVault()
  const { area: areaParam = '' } = useParams()
  const area = GOAL_AREAS.includes(areaParam as GoalArea) ? areaParam as GoalArea : null
  const { goals, sources, churches, ready, reload } = useGoalSources()
  const [districtInput, setDistrictInput] = useState('')
  const [churchInputs, setChurchInputs] = useState<Record<string, string>>({})
  const [preview, setPreview] = useState<GoalImportPreview | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const year = new Date().getFullYear()

  if (!area) return <div className="page-stack"><p>Meta não encontrada.</p><Link className="text-link" to="/app/metas">Voltar às metas</Link></div>
  if (!ready) return <div className="app-loading" role="status">Abrindo a meta…</div>

  const progresso = areaProgress(area, goals, sources, year)
  const meses = monthlyResults(area, sources, year)
  const maiorMes = Math.max(1, ...meses)
  const porIgreja = churchProgress(area, goals, sources, year, churches.map(({ id }) => id))
  const anoTerminou = year < new Date().getFullYear() || new Date().getMonth() === 11

  async function salvarMeta(event: FormEvent, churchId: string | null, valor: string) {
    event.preventDefault()
    if (!account || !masterKey || !area) return
    setError(''); setNotice('')
    try {
      await goalsService.saveGoal(account.id, masterKey, { churchId, year, metric: AREA_TARGET_METRIC[area], target: Number(valor) })
      setNotice('Meta salva.')
      if (churchId === null) setDistrictInput('')
      await reload()
    } catch (motivo) {
      setError(motivo instanceof Error ? motivo.message : 'Não foi possível salvar a meta.')
    }
  }

  async function lerPdf(file?: File) {
    if (!file) return
    setBusy(true); setError(''); setNotice(''); setPreview(null)
    try {
      validatePdfFile(file)
      const bytes = await file.arrayBuffer()
      setPreview(parseGoalsPdf(await extractPdfText(bytes), await pdfHash(bytes)))
    } catch (motivo) {
      setError(motivo instanceof Error ? motivo.message : 'Não foi possível ler o arquivo. Nada foi alterado; escolha outro e tente de novo.')
    } finally { setBusy(false) }
  }

  async function aplicarPreview() {
    if (!account || !masterKey || !preview) return
    setBusy(true); setError('')
    try {
      await goalsService.addEntries(account.id, masterKey, preview.entries.map((entry) => ({ ...entry, source: 'pdf' as const })))
      setPreview(null); setNotice('Resultados aplicados.')
      await reload()
    } catch {
      setError('Não foi possível aplicar. Nada foi alterado.')
    } finally { setBusy(false) }
  }

  const nomeIgreja = (id: string) => churches.find((church) => church.id === id)?.name ?? 'Igreja'

  return (
    <div className="page-stack page-narrow">
      <Link className="text-link back-link" to="/app/metas"><ArrowLeft />Voltar às metas</Link>
      <header className="page-hero"><div><p className="eyebrow">{year}</p><h1>{GOAL_AREA_LABELS[area]}</h1></div></header>
      {error && <div className="alert alert--error" role="alert">{error}</div>}
      {notice && <div className="alert alert--success" role="status">{notice}</div>}

      <Card title="No ano">
        <div className="goal-card__numbers">
          <div><small>Meta anual</small><strong>{progresso.target > 0 ? formatGoalValue(area, progresso.target) : 'A definir'}</strong></div>
          <div><small>Resultado</small><strong>{formatGoalValue(area, progresso.result)}</strong></div>
          <div><small>Falta</small><strong>{progresso.target > 0 ? formatGoalValue(area, progresso.missing) : '—'}</strong></div>
        </div>
        <div className="goal-bar" role="img" aria-label={`${progresso.percent}% da meta`}><span style={{ width: `${progresso.percent}%` }} /></div>
        <p className="goal-card__percent">{progresso.target > 0 ? `${progresso.percent}% alcançado` : 'Defina a meta do ano para acompanhar'}</p>
        {anoTerminou && progresso.target > 0 && <p className="card-copy">{progresso.reached ? 'Meta do ano alcançada.' : `Faltaram ${formatGoalValue(area, progresso.missing)} para a meta do ano.`}</p>}
      </Card>

      <Card title="Mês a mês">
        <ul className="goal-months">{meses.map((valor, indice) => (
          <li key={MONTH_LABELS[indice]}>
            <span className="goal-months__bar"><span style={{ height: `${Math.round((valor / maiorMes) * 100)}%` }} /></span>
            <small>{MONTH_LABELS[indice]}</small>
          </li>
        ))}</ul>
      </Card>

      <Card title="Meta do distrito">
        <form className="inline-form" onSubmit={(event) => void salvarMeta(event, null, districtInput)}>
          <Field label="Total do ano" name="district-target" type="number" min={0} value={districtInput} onChange={(event) => setDistrictInput(event.target.value)} hint={progresso.target > 0 ? `Hoje: ${formatGoalValue(area, progresso.target)}` : undefined} />
          <Button type="submit" disabled={!districtInput}>Salvar</Button>
        </form>
        {progresso.targetsMismatch && <p className="field__hint">A soma das igrejas está em {formatGoalValue(area, progresso.churchTargetsSum)}, diferente do total do distrito.</p>}
      </Card>

      <Card title="Metas das igrejas" eyebrow="Distribuição do total">
        {churches.length === 0
          ? <p className="field__hint">Cadastre igrejas para distribuir a meta.</p>
          : <div className="goal-church-list">{porIgreja.map((item) => (
            <form key={item.churchId} className="goal-church" onSubmit={(event) => void salvarMeta(event, item.churchId, churchInputs[item.churchId] ?? '')}>
              <span><strong>{nomeIgreja(item.churchId)}</strong><small>{formatGoalValue(area, item.result)} de {item.target > 0 ? formatGoalValue(area, item.target) : 'meta a definir'}</small></span>
              <input className="field__input" type="number" min={0} aria-label={`Meta de ${nomeIgreja(item.churchId)}`} placeholder={item.target > 0 ? String(item.target) : '0'} value={churchInputs[item.churchId] ?? ''} onChange={(event) => setChurchInputs((atual) => ({ ...atual, [item.churchId]: event.target.value }))} />
              <Button type="submit" variant="secondary" disabled={!churchInputs[item.churchId]}>Salvar</Button>
            </form>
          ))}</div>}
      </Card>

      {AREA_USES_PDF[area] && (
        <Card title="Enviar PDF" eyebrow="Resultados do período">
          <p className="card-copy">O arquivo é lido no próprio aparelho. Nada entra sem você conferir a prévia.</p>
          <label className="file-picker">
            <FileUp />
            <span><strong>{busy ? 'Lendo o arquivo…' : `Escolher PDF de ${GOAL_AREA_LABELS[area]}`}</strong><small>Você confere igreja, período e totais antes de salvar.</small></span>
            <input type="file" accept="application/pdf,.pdf" disabled={busy} onChange={(event) => { void lerPdf(event.target.files?.[0]); event.currentTarget.value = '' }} />
          </label>
          {preview && <div className="goal-preview">
            <h3>Confira antes de salvar</h3>
            {preview.entries.length === 0
              ? <p className="field__hint">Nenhum resultado foi reconhecido neste arquivo. Nada foi alterado — confira o arquivo e envie de novo.</p>
              : <ul className="goal-preview__list">{preview.entries.map((entry, indice) => (
                <li key={`${entry.churchId}-${entry.date}-${indice}`}><span>{nomeIgreja(entry.churchId)}<small>{entry.date}</small></span><strong>{formatGoalValue(area, entry.amount)}</strong></li>
              ))}</ul>}
            {preview.errors.length > 0 && <ul className="goal-preview__warnings">{preview.errors.map((aviso, indice) => <li key={indice}>{aviso}</li>)}</ul>}
            <div className="form-actions">
              <Button onClick={() => void aplicarPreview()} disabled={busy || preview.entries.length === 0}>Confirmar e salvar</Button>
              <Button variant="secondary" onClick={() => setPreview(null)}>Descartar</Button>
            </div>
          </div>}
        </Card>
      )}

      {!AREA_USES_PDF[area] && (
        <Card title="De onde vêm os números">
          <p className="card-copy">{area === 'bible_studies'
            ? 'Os estudos bíblicos já cadastrados no aplicativo contam automaticamente. Não é preciso lançar de novo.'
            : 'As UAPG já cadastradas contam automaticamente. Não é preciso lançar de novo.'}</p>
          <Link className="text-link" to={area === 'bible_studies' ? '/app/missionario' : '/app/missionario/grupos'}>Abrir os cadastros</Link>
        </Card>
      )}
    </div>
  )
}
