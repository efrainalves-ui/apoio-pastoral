import { useReloadOnSync } from '../sync/useReloadOnSync'
/* eslint-disable @typescript-eslint/no-misused-promises */
import { Trash2, Upload } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { useAuthVault } from '../auth/AuthVaultContext'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { parseAcmsFile } from '../acms/parser'
import { AcmsService, periodLabel, periodoValido } from '../acms/service'
import { ACMS_INDICATOR_LABELS, acmsTotals, compareAcms, type AcmsPreview, type AcmsReportEntity } from '../acms/types'

const service = new AcmsService()

function trimestreAtual(): string {
  const hoje = new Date()
  return `${hoje.getFullYear()}-T${Math.floor(hoje.getMonth() / 3) + 1}`
}

/** Barra proporcional ao maior valor da série. Sem biblioteca de gráfico. */
function BarraComparativa({ label, value, max }: { label: string; value: number; max: number }) {
  const percentual = max > 0 ? Math.round((value / max) * 100) : 0
  return <div className="acms-bar">
    <span>{label}</span>
    <div className="acms-bar__track"><div className="acms-bar__fill" style={{ width: `${percentual}%` }} /></div>
    <strong>{value.toLocaleString('pt-BR')}</strong>
  </div>
}

/**
 * Importação do relatório ACMS, sempre dentro do aparelho.
 *
 * A planilha é aberta na memória, mostrada em prévia e descartada. O que fica
 * guardado são os números por igreja, depois de o pastor confirmar — o arquivo
 * bruto não é salvo, não sobe para o serviço e não entra em backup.
 */
export function AcmsPage() {
  const { account, masterKey } = useAuthVault()
  const [reports, setReports] = useState<AcmsReportEntity[]>([])
  const [preview, setPreview] = useState<AcmsPreview | null>(null)
  const [period, setPeriod] = useState(trimestreAtual())
  const [comparar, setComparar] = useState('')
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!account || !masterKey) return
    setLoading(true)
    try { setReports(await service.reports(account.id, masterKey)) } catch (motivo) { setError(motivo instanceof Error ? motivo.message : 'Não foi possível abrir os relatórios.') } finally { setLoading(false) }
  }, [account, masterKey])
  useReloadOnSync(load)

  const atual = reports[0] ?? null
  const totais = useMemo(() => atual ? acmsTotals(atual.rows) : null, [atual])
  const comparacao = useMemo(() => {
    const anterior = reports.find(({ period: chave }) => chave === comparar)
    return atual && anterior && anterior.id !== atual.id ? compareAcms(anterior, atual) : []
  }, [atual, reports, comparar])

  async function escolherArquivo(arquivo: File | null) {
    setError(''); setNotice(''); setPreview(null)
    if (!arquivo) return
    try {
      setPreview(await parseAcmsFile(await arquivo.arrayBuffer()))
    } catch (motivo) {
      setError(motivo instanceof Error ? motivo.message : 'Não foi possível ler esta planilha. Nada foi importado.')
    }
  }

  async function confirmar() {
    if (!account || !masterKey || !preview) return
    try {
      await service.importPreview(account.id, masterKey, period, preview)
      setPreview(null)
      setNotice(`Relatório de ${periodLabel(period)} importado com ${preview.rows.length} igreja(s).`)
      await load()
    } catch (motivo) { setError(motivo instanceof Error ? motivo.message : 'Não foi possível importar.') }
  }

  async function apagar(relatorio: AcmsReportEntity) {
    if (!account || !masterKey || !window.confirm(`Apagar o relatório de ${periodLabel(relatorio.period)}?`)) return
    try { await service.remove(account.id, masterKey, relatorio.id); setNotice('Relatório apagado.'); await load() } catch (motivo) { setError(motivo instanceof Error ? motivo.message : 'Não foi possível apagar.') }
  }

  if (loading) return <div className="app-loading" role="status">Abrindo os relatórios…</div>

  const maiorTotal = totais ? Math.max(1, ...Object.values(totais.indicators), ...totais.strategicPoints.map(({ value }) => value)) : 1

  return <div className="page-stack page-narrow">
    <header className="page-hero"><div><p className="eyebrow">Missão e discipulado</p><h1>Relatório ACMS</h1></div></header>
    {notice && <div className="alert alert--success" role="status">{notice}</div>}
    {error && <div className="alert alert--error" role="alert">{error}</div>}

    <Card title="Importar planilha">
      <p className="card-copy">A planilha é lida neste aparelho e não é salva em lugar nenhum. Só os indicadores por igreja ficam guardados, e apenas depois de você confirmar.</p>
      <div className="form-grid">
        <label className="field"><span className="field__label">Período</span>
          <select className="field__input" value={period} onChange={(event) => setPeriod(event.target.value)}>
            {[0, 1, 2, 3, 4, 5, 6, 7].map((recuo) => {
              const base = new Date()
              base.setMonth(base.getMonth() - recuo * 3)
              const chave = `${base.getFullYear()}-T${Math.floor(base.getMonth() / 3) + 1}`
              return <option key={chave} value={chave}>{periodLabel(chave)}</option>
            })}
          </select>
        </label>
        <label className="field"><span className="field__label">Arquivo .xlsx</span>
          <input className="field__input" type="file" accept=".xlsx" aria-label="Planilha do relatório ACMS" onChange={(event) => void escolherArquivo(event.target.files?.[0] ?? null)} />
        </label>
      </div>
    </Card>

    {preview && <Card title="Prévia por igreja" eyebrow="Confirme antes de importar">
      <p className="card-copy">
        Aba <strong>{preview.sheetName}</strong> · {preview.rows.length} igreja(s)
        {preview.ignoredRows > 0 ? ` · ${preview.ignoredRows} linha(s) ignorada(s) por não ter igreja e número` : ''}
      </p>
      <div className="table-scroll"><table className="data-table">
        <thead><tr>
          <th scope="col">Igreja</th>
          {preview.recognizedIndicators.map((indicador) => <th scope="col" key={indicador}>{ACMS_INDICATOR_LABELS[indicador]}</th>)}
          {preview.strategicLabels.map((rotulo) => <th scope="col" key={rotulo}>{rotulo}</th>)}
        </tr></thead>
        <tbody>{preview.rows.map((linha) => <tr key={linha.churchName}>
          <th scope="row">{linha.churchName}</th>
          {preview.recognizedIndicators.map((indicador) => <td key={indicador}>{linha.indicators[indicador] ?? '—'}</td>)}
          {preview.strategicLabels.map((rotulo) => <td key={rotulo}>{linha.strategicPoints.find((ponto) => ponto.label === rotulo)?.value ?? '—'}</td>)}
        </tr>)}</tbody>
      </table></div>
      <div className="form-actions">
        <Button icon={<Upload />} disabled={!periodoValido(period)} onClick={confirmar}>Importar {periodLabel(period)}</Button>
        <Button variant="secondary" onClick={() => setPreview(null)}>Descartar</Button>
      </div>
    </Card>}

    {totais && atual && <Card title={`Totais do distrito · ${periodLabel(atual.period)}`}>
      <p className="card-copy">{totais.churches} igreja(s). Somas do distrito, sem nome de membro.</p>
      {Object.entries(totais.indicators).map(([indicador, valor]) => <BarraComparativa key={indicador} label={ACMS_INDICATOR_LABELS[indicador as keyof typeof ACMS_INDICATOR_LABELS]} value={valor} max={maiorTotal} />)}
      {totais.strategicPoints.map((ponto) => <BarraComparativa key={ponto.label} label={ponto.label} value={ponto.value} max={maiorTotal} />)}
    </Card>}

    {reports.length > 1 && <Card title="Comparar períodos">
      <label className="field"><span className="field__label">Comparar {atual ? periodLabel(atual.period) : ''} com</span>
        <select className="field__input" value={comparar} onChange={(event) => setComparar(event.target.value)}>
          <option value="">Escolha um período</option>
          {reports.filter((item) => item.id !== atual?.id).map((item) => <option key={item.id} value={item.period}>{periodLabel(item.period)}</option>)}
        </select>
      </label>
      {comparacao.length > 0 && <div className="entity-list">{comparacao.map((linha) => <div className="entity-row" key={linha.label}>
        <span><strong>{linha.label}</strong><small>{linha.before.toLocaleString('pt-BR')} → {linha.after.toLocaleString('pt-BR')}</small></span>
        <strong className={linha.difference >= 0 ? 'positive' : 'negative'}>{linha.difference >= 0 ? '+' : ''}{linha.difference.toLocaleString('pt-BR')}</strong>
      </div>)}</div>}
    </Card>}

    <Card title="Períodos importados neste aparelho">
      {reports.length === 0 ? <p className="card-copy">Nenhum relatório importado ainda.</p> : <div className="entity-list">{reports.map((relatorio) => <div className="entity-row" key={relatorio.id}>
        <span><strong>{periodLabel(relatorio.period)}</strong><small>{relatorio.rows.length} igreja(s) · aba {relatorio.sheetName}</small></span>
        <Button variant="danger" icon={<Trash2 />} aria-label={`Apagar relatório de ${periodLabel(relatorio.period)}`} onClick={() => apagar(relatorio)} />
      </div>)}</div>}
    </Card>
  </div>
}
