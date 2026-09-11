import { Download } from 'lucide-react'
import { useState } from 'react'
import { useAuthVault } from '../auth/AuthVaultContext'
import { BackupService, downloadBackup, type BackupSummary } from '../backup/service'
import { RestaurarBackup } from '../components/RestaurarBackup'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'

const service = new BackupService()

export function BackupPage() {
  const { account, masterKey } = useAuthVault()
  const [summary, setSummary] = useState<BackupSummary | null>(null)
  const [code, setCode] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function create() {
    if (!account || !masterKey) return
    setBusy(true)
    setError('')
    try {
      const backup = await service.create(account.id, masterKey, code)
      downloadBackup(backup.file)
      setSummary(backup.summary)
      setMessage('Backup criado neste dispositivo.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível criar o backup.')
    } finally { setBusy(false) }
  }

  return <div className="page-stack page-narrow">
    <header className="page-hero"><div><p className="eyebrow">Proteção dos seus dados</p><h1>Backup seguro</h1><p>Guarde o arquivo e o código de backup em locais seguros e separados. Nada é enviado automaticamente.</p></div></header>
    {message && <div className="alert alert--success" role="status">{message}</div>}
    {error && <div className="alert alert--error" role="alert">{error}</div>}
    <Card title="Criar backup" eyebrow="Arquivo local">
      <p>A criação só acontece quando você clicar no botão. O arquivo leva os dados do distrito e também a sua Leitura e o seu Orçamento Familiar, tudo cifrado com o código que você criar abaixo.</p>
      <label className="field" htmlFor="backup-code"><span>Código para este backup</span>
        <input id="backup-code" className="field__input" type="password" value={code} onChange={(event) => setCode(event.target.value)} autoComplete="new-password" />
        <small className="field__hint">Crie um código exclusivo com pelo menos 12 caracteres. Sem ele, o arquivo não poderá ser aberto.</small>
      </label>
      <Button disabled={busy || code.length < 12} onClick={() => void create()} icon={<Download />}>{busy ? 'Preparando…' : 'Criar e salvar backup'}</Button>
      {summary && <small>Gerado em {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(summary.createdAt))} · {summary.recordCount} registros do distrito · {summary.personalCount} registros pessoais · {Math.ceil(summary.size / 1024)} KB{summary.skippedCount > 0 ? ` · ${summary.skippedCount} registro(s) não abriram neste aparelho e ficaram de fora` : ''}</small>}
    </Card>
    {/* A mesma restauração que existe antes de haver distrito: uma só, em um lugar só. */}
    <RestaurarBackup />
  </div>
}
