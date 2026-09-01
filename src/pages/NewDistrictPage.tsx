import { ArchiveRestore, Trash2, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BackupService, downloadBackup, type BackupSummary } from '../backup/service'
import { useAuthVault } from '../auth/AuthVaultContext'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { NewDistrictService, type NewDistrictMode, type NewDistrictPreview } from '../district/newDistrict'

const backup = new BackupService()
const transition = new NewDistrictService()
const phrase = 'INICIAR NOVO DISTRITO'

export function NewDistrictPage() {
  const { account, masterKey } = useAuthVault()
  const navigate = useNavigate()
  const [summary, setSummary] = useState<BackupSummary | null>(null)
  const [mode, setMode] = useState<NewDistrictMode>('empty')
  const [preview, setPreview] = useState<NewDistrictPreview | null>(null)
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const loadPreview = useCallback(async () => {
    if (!account || !masterKey) return
    try { setPreview(await transition.preview(account.id, masterKey, mode)) } catch { setError('Não foi possível preparar a prévia do novo distrito.') }
  }, [account, masterKey, mode])

  useEffect(() => {
    if (!account) return
    try { setSummary(JSON.parse(localStorage.getItem(`apoio-pastoral:recent-backup:${account.id}`) ?? 'null') as BackupSummary | null) } catch { setSummary(null) }
  }, [account])
  useEffect(() => { void loadPreview() }, [loadPreview])

  async function createBackup() {
    if (!account || !masterKey) return
    setError('')
    try {
      const item = await backup.create(account.id, masterKey, 'novo-distrito-local')
      downloadBackup(item.file)
      localStorage.setItem(`apoio-pastoral:recent-backup:${account.id}`, JSON.stringify(item.summary))
      setSummary(item.summary)
    } catch { setError('Não foi possível criar o backup.') }
  }

  async function execute() {
    if (!account || !masterKey || !summary || confirm !== phrase) return
    setBusy(true); setError('')
    try {
      await transition.start(account.id, masterKey, mode)
      void navigate('/app/distrito', { replace: true })
    } catch { setError('Não foi possível iniciar o novo distrito. Nenhum dado adicional foi removido.') } finally { setBusy(false) }
  }

  return <div className="page-stack page-narrow"><header className="page-hero"><div><p className="eyebrow">Transição · ação irreversível no dispositivo</p><h1>Iniciar novo distrito</h1><p>Revise a prévia, preserve seu backup e confirme a limpeza antes de criar o próximo distrito.</p></div><ArchiveRestore /></header>{error && <div className="alert alert--error" role="alert">{error}</div>}<Card title="1. Backup seguro" eyebrow="Obrigatório e preservado">{summary ? <p>Backup confirmado: {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(summary.createdAt))} · {summary.recordCount} registros · {Math.ceil(summary.size / 1024)} KB. O arquivo já salvo não será removido por esta jornada.</p> : <><p>Não há backup recente registrado neste dispositivo.</p><Button onClick={() => void createBackup()}>Criar backup antes de continuar</Button></>}</Card><Card title="2. Escolher início" eyebrow="Prévia da limpeza"><label className="field"><span><input type="radio" name="new-district-mode" checked={mode === 'empty'} onChange={() => setMode('empty')} /> Começar totalmente vazio</span><small className="field__hint">Todos os registros do distrito atual serão removidos deste dispositivo.</small></label><label className="field"><span><input type="radio" name="new-district-mode" checked={mode === 'technical'} onChange={() => setMode('technical')} /> Preservar somente histórico técnico não nominal</span><small className="field__hint">Será criado um resumo cifrado agregado; nenhum nome, contato ou conteúdo atual será mantido.</small></label><div className="new-district-preview" aria-live="polite"><p><strong>Registros atuais:</strong> {preview?.recordCount ?? '…'}</p><p><strong>Será preservado:</strong></p><ul>{(preview?.preserved ?? []).map((item) => <li key={item}>{item}</li>)}</ul><p><strong>Será removido:</strong></p>{preview?.removed.length ? <ul>{preview.removed.map((item) => <li key={item}>{item}</li>)}</ul> : <p className="muted">Nenhum registro do distrito atual.</p>}</div></Card><Card title="3. Confirmar limpeza" eyebrow="Nada acontece automaticamente"><p>Digite exatamente <strong>{phrase}</strong> para concluir. Em seguida, a criação do novo distrito será aberta e você poderá importar uma Transferência de Distrito depois, se desejar.</p><label className="field"><span className="field__label">Frase de confirmação</span><input className="field__input" value={confirm} onChange={(event) => setConfirm(event.target.value)} autoComplete="off" /></label><div className="form-actions"><Button variant="danger" disabled={!summary || confirm !== phrase || busy} onClick={() => void execute()} icon={<Trash2 />}>{busy ? 'Iniciando…' : 'Confirmar novo distrito'}</Button><Button variant="secondary" disabled={busy} onClick={() => { void navigate('/app/distrito') }} icon={<X />}>Cancelar</Button></div></Card></div>
}
