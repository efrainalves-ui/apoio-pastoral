import { ArchiveRestore, Download, Upload } from 'lucide-react'
import { useState } from 'react'
import { useAuthVault } from '../auth/AuthVaultContext'
import { BackupService, downloadBackup, type BackupSummary } from '../backup/service'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'

const service = new BackupService()

export function BackupPage() {
  const { account, masterKey } = useAuthVault()
  const [summary, setSummary] = useState<BackupSummary | null>(null)
  const [pending, setPending] = useState<File | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [code, setCode] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function create() {
    if (!account || !masterKey) return
    setError('')
    try {
      const backup = await service.create(account.id, masterKey, code)
      downloadBackup(backup.file)
      setSummary(backup.summary)
      setMessage('Backup criado neste dispositivo.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível criar o backup.')
    }
  }

  async function restore() {
    if (!account || !masterKey || !pending || !confirmed) return
    setError('')
    try {
      const parsed = JSON.parse(await pending.text()) as unknown
      const result = await service.restore(account.id, masterKey, code, parsed)
      setMessage(`Backup restaurado: ${result.recordCount} registros protegidos.`)
      setPending(null); setConfirmed(false)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível restaurar.')
    }
  }

  return <div className="page-stack page-narrow">
    <header className="page-hero"><div><p className="eyebrow">Proteção dos seus dados</p><h1>Backup seguro</h1><p>Guarde o arquivo e o código de backup em locais seguros e separados. Nada é enviado automaticamente.</p></div><ArchiveRestore /></header>
    {message && <div className="alert alert--success" role="status">{message}</div>}
    {error && <div className="alert alert--error" role="alert">{error}</div>}
    <label className="field"><span>Código de backup</span><input className="field__input" type="password" value={code} onChange={(event) => setCode(event.target.value)} autoComplete="new-password" /><small className="field__hint">Crie um código exclusivo com pelo menos 12 caracteres. Sem ele, o arquivo não poderá ser aberto.</small></label>
    <Card title="Criar backup" eyebrow="Arquivo local"><p>A criação só acontece quando você clicar no botão. O arquivo leva os dados do distrito e também a sua Leitura e o seu Orçamento Familiar, tudo cifrado com o código que você criar acima.</p><Button onClick={() => void create()} icon={<Download />}>Criar e salvar backup</Button>{summary && <small>Gerado em {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(summary.createdAt))} · {summary.recordCount} registros do distrito · {summary.personalCount} registros pessoais · {Math.ceil(summary.size / 1024)} KB</small>}</Card>
    <Card title="Restaurar backup" eyebrow="Confirmação obrigatória"><p><strong>Atenção:</strong> registros com o mesmo identificador podem substituir versões locais. A restauração aceita somente um backup desta conta e não mistura contas.</p><input aria-label="Arquivo de backup" type="file" accept=".apb,application/octet-stream" onChange={(event) => { setPending(event.target.files?.[0] ?? null); setConfirmed(false) }} />{pending && <><label className="choice-card"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span>Entendo que a restauração pode substituir registros locais desta conta.</span></label><Button variant="danger" disabled={!confirmed} onClick={() => void restore()} icon={<Upload />}>Restaurar este backup</Button></>}</Card>
  </div>
}
