import { ArrowLeft, FileUp } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuthVault } from '../auth/AuthVaultContext'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Field } from '../components/ui/Field'
import {
  AREA_TARGET_METRIC, AREA_USES_PDF, GOAL_AREAS, GOAL_AREA_LABELS,
  areaComparison, churchProgress, monthlyResults, type GoalArea,
} from '../goals/areas'
import { MONTH_LABELS, formatGoalValue } from '../goals/format'
import { GoalsService, parseGoalsPdf } from '../goals/service'
import { HISTORY_AREAS, type GoalHistoryData, type GoalImportPreview } from '../goals/types'
import { useGoalSources } from '../goals/useGoalSources'
import { extractPdfText, pdfHash, validatePdfFile } from '../imports/pdf'
import { AREA_PDF_DOCUMENT } from '../goals/areas'
import { previaDeBatismos, previaFinanceira } from '../goals/importacaoAcms'

const goalsService = new GoalsService()

export function GoalAreaPage() {
  const { account, masterKey } = useAuthVault()
  const { area: areaParam = '' } = useParams()
  const area = GOAL_AREAS.includes(areaParam as GoalArea) ? areaParam as GoalArea : null
  const { goals, sources, churches, ready, reload } = useGoalSources()
  const [districtInput, setDistrictInput] = useState('')
  const [previousInput, setPreviousInput] = useState('')
  const [churchInputs, setChurchInputs] = useState<Record<string, string>>({})
  const [preview, setPreview] = useState<GoalImportPreview | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const year = new Date().getFullYear()
  // O texto que saiu do PDF fica à mão quando nada é reconhecido. Sem isso, o
  // pastor só tem "não reconhecido" e ninguém consegue descobrir o porquê — o
  // arquivo dele não pode sair do aparelho para alguém olhar.
  const [textoLido, setTextoLido] = useState('')
  const [mostrarTexto, setMostrarTexto] = useState(false)
  // O Comparativo traz o ano anterior junto. Guardá-lo aqui é o que permite
  // gravar a base de comparação no mesmo gesto, sem pedir para ninguém digitar
  // o ano passado inteiro.
  const [anoAnteriorDoPdf, setAnoAnteriorDoPdf] = useState<{ ano: number; total: number } | null>(null)

  if (!area) return <div className="page-stack"><p>Meta não encontrada.</p><Link className="text-link" to="/app/metas">Voltar às metas</Link></div>
  if (!ready) return <div className="app-loading" role="status">Abrindo a meta…</div>

  const progresso = areaComparison(area, goals, sources, year)
  const guardaHistorico = HISTORY_AREAS.includes(area as GoalHistoryData['area'])
  const meses = monthlyResults(area, sources, year)
  const maiorMes = Math.max(1, ...meses)
  const porIgreja = churchProgress(area, goals, sources, year, churches.map(({ id }) => id))
  const anoTerminou = year < new Date().getFullYear() || new Date().getMonth() === 11
  /**
   * Sem nenhum resultado, enviar o relatório é o que a tela existe para pedir —
   * então ele sobe. Com dados dentro, o que importa é o acompanhamento, e o
   * envio vira manutenção: desce para o fim, discreto.
   */
  const semNenhumResultado = progresso.result === 0 && !progresso.hasPrevious

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

  async function salvarAnoAnterior(event: FormEvent) {
    event.preventDefault()
    if (!account || !masterKey || !area || !guardaHistorico) return
    setError(''); setNotice('')
    try {
      await goalsService.saveHistory(account.id, masterKey, { area: area as GoalHistoryData['area'], year: year - 1, amount: Number(previousInput), source: 'manual', reference: `Consolidado ${year - 1}` })
      setPreviousInput(''); setNotice(`Resultado de ${year - 1} guardado para comparação.`)
      await reload()
    } catch (motivo) {
      setError(motivo instanceof Error ? motivo.message : 'Não foi possível guardar o resultado do ano anterior.')
    }
  }

  async function lerPdf(file?: File) {
    if (!file) return
    setBusy(true); setError(''); setNotice(''); setPreview(null)
    try {
      validatePdfFile(file)
      const bytes = await file.arrayBuffer()
      const texto = await extractPdfText(bytes)
      setTextoLido(texto)
      setMostrarTexto(false)
      setAnoAnteriorDoPdf(null)
      const hash = await pdfHash(bytes)
      if (area === 'baptisms') {
        setPreview(previaDeBatismos(texto, hash, churches))
      } else if (area === 'financial') {
        const lida = previaFinanceira(texto, hash, churches)
        setAnoAnteriorDoPdf({ ano: lida.anoAnterior, total: lida.totalDoAnoAnterior })
        setPreview(lida)
      } else {
        setPreview(parseGoalsPdf(texto, hash))
      }
    } catch (motivo) {
      setError(motivo instanceof Error ? motivo.message : 'Não foi possível ler o arquivo. Nada foi alterado; escolha outro e tente de novo.')
    } finally { setBusy(false) }
  }

  async function aplicarPreview() {
    if (!account || !masterKey || !preview) return
    setBusy(true); setError('')
    try {
      await goalsService.addEntries(account.id, masterKey, preview.entries.map((entry) => ({ ...entry, source: 'pdf' as const })))
      // O ano anterior veio no mesmo arquivo: guardá-lo aqui é o que faz a
      // comparação existir sem trabalho manual nenhum.
      if (anoAnteriorDoPdf && guardaHistorico && anoAnteriorDoPdf.ano < year) {
        await goalsService.saveHistory(account.id, masterKey, {
          area: area as GoalHistoryData['area'],
          year: anoAnteriorDoPdf.ano,
          amount: anoAnteriorDoPdf.total,
          source: 'pdf',
          reference: `Comparativo de Entradas ${anoAnteriorDoPdf.ano}`,
        })
      }
      setPreview(null); setAnoAnteriorDoPdf(null); setNotice('Resultados aplicados.')
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

      {guardaHistorico && <Card title={`Comparação com ${year - 1}`}>
        <div className="goal-card__numbers">
          <div><small>Resultado {year - 1}</small><strong>{progresso.hasPrevious ? formatGoalValue(area, progresso.previous) : 'A registrar'}</strong></div>
          <div><small>Meta {year}</small><strong>{progresso.target > 0 ? formatGoalValue(area, progresso.target) : 'A definir'}</strong></div>
          <div><small>Resultado {year}</small><strong>{formatGoalValue(area, progresso.result)}</strong></div>
          <div><small>Alcançado</small><strong>{progresso.target > 0 ? `${progresso.percent}%` : '—'}</strong></div>
          <div><small>Falta</small><strong>{progresso.target > 0 ? formatGoalValue(area, progresso.missing) : '—'}</strong></div>
          <div><small>Diferença</small><strong>{progresso.hasPrevious ? `${progresso.difference >= 0 ? '+' : '−'}${formatGoalValue(area, Math.abs(progresso.difference))}` : '—'}</strong></div>
        </div>
        <form className="inline-form" onSubmit={(event) => void salvarAnoAnterior(event)}>
          <Field label={`Resultado consolidado de ${year - 1}`} name="previous-year" type="number" min={0} step="any" value={previousInput} onChange={(event) => setPreviousInput(event.target.value)} />
          <Button type="submit" variant="secondary" disabled={!previousInput}>Guardar</Button>
        </form>
      </Card>}

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
        <Card className={semNenhumResultado ? 'goal-pdf-card goal-pdf-card--primeiro' : 'goal-pdf-card'} title={`Enviar o ${AREA_PDF_DOCUMENT[area]?.nome ?? 'PDF'}`} eyebrow="Resultados do período">
          <p className="card-copy">{AREA_PDF_DOCUMENT[area]?.caminho}</p>
          <label className="file-picker">
            <FileUp />
            <span><strong>{busy ? 'Lendo o arquivo…' : `Escolher o ${AREA_PDF_DOCUMENT[area]?.nome ?? 'PDF'}`}</strong><small>Você confere igreja, período e totais antes de salvar.</small></span>
            <input type="file" accept="application/pdf,.pdf" disabled={busy} onChange={(event) => { void lerPdf(event.target.files?.[0]); event.currentTarget.value = '' }} />
          </label>
          {textoLido && preview?.entries.length === 0 && <>
            <button type="button" className="text-button" onClick={() => setMostrarTexto((atual) => !atual)}>
              {mostrarTexto ? 'Esconder o texto lido' : 'Ver o texto que foi lido do arquivo'}
            </button>
            {mostrarTexto && <>
              <p className="field__hint">Isto é o que o aplicativo enxergou dentro do PDF. Serve para descobrir por que o formato não foi reconhecido — o arquivo em si não sai deste aparelho.</p>
              <textarea className="field__input" rows={12} readOnly value={textoLido} aria-label="Texto lido do arquivo" />
            </>}
          </>}
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
