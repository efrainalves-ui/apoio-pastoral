import { Cloud, CloudOff, RefreshCw, ShieldCheck } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { currentDeviceId } from '../auth/device'
import { useAuthVault } from '../auth/AuthVaultContext'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { StatusPill } from '../components/ui/StatusPill'
import { corruptedRecordIds } from '../crypto/vault'
import { db } from '../db/database'
import { SyncService } from '../sync/service'
import { createSyncTransport } from '../sync/transport'
import type { SyncSummary } from '../sync/types'

export function SyncPage() {
  const { account, syncKey } = useAuthVault()
  const transport = useMemo(() => createSyncTransport(), [])
  const service = useMemo(() => new SyncService(transport), [transport])
  const [pending, setPending] = useState(0)
  const [lastSync, setLastSync] = useState<string | null>(null)
  const [conflicts, setConflicts] = useState(0)
  const [quarantined, setQuarantined] = useState(0)
  const [corrupted, setCorrupted] = useState(0)
  const [resolved, setResolved] = useState(0)
  const [summary, setSummary] = useState<SyncSummary | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    if (!account) return
    setPending(await db.outbox.where('accountId').equals(account.id).filter(({ status }) => status === 'pending').count())
    setLastSync((await db.syncState.get(account.id))?.lastSyncedAt ?? null)
    setConflicts(await db.syncConflicts.where('accountId').equals(account.id).filter(({ status }) => status === 'pending').count())
    setResolved(await db.syncConflicts.where('accountId').equals(account.id).filter(({ status }) => status === 'resolved').count())
    setQuarantined(await db.quarantine.where('accountId').equals(account.id).count())
    setCorrupted(corruptedRecordIds().length)
  }, [account])

  useEffect(() => { void refresh() }, [refresh])

  async function synchronize() {
    if (!account || !syncKey) return
    setBusy(true)
    setError('')
    try {
      setSummary(await service.synchronize(account.id, currentDeviceId(account.id), syncKey))
      await refresh()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível sincronizar.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page-stack page-narrow">
      <header className="page-hero"><div><p className="eyebrow">Seus dispositivos</p><h1>Sincronização</h1></div><StatusPill tone={navigator.onLine ? 'success' : 'offline'}>{navigator.onLine ? 'Rede disponível' : 'Sem conexão'}</StatusPill></header>
      <div className="metric-row">
        <div><small>Pendentes</small><strong>{pending}</strong></div>
        <div><small>Última sincronização</small><strong>{lastSync ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(lastSync)) : 'Ainda não realizada'}</strong></div>
        <div><small>Disponibilidade</small><strong>{transport.name === 'disabled' ? 'Somente neste dispositivo' : 'Sincronização disponível'}</strong></div>
        <div><small>Revisões pendentes</small><strong>{conflicts}</strong></div>
        <div><small>Revisões já resolvidas</small><strong>{resolved}</strong></div>
        <div><small>Recebidos em quarentena</small><strong>{quarantined}</strong></div>
      </div>
      {quarantined > 0 && <div className="alert alert--error" role="alert">Recebemos {quarantined} alteração(ões) que não conferem com a sua conta e não foram aplicadas. Elas ficaram guardadas de lado, sem alterar nada. Se isso se repetir, avise antes de continuar usando este aparelho.</div>}
      {corrupted > 0 && <div className="alert alert--error" role="alert">{corrupted} registro(s) não abriram neste aparelho e foram pulados na leitura. O restante continua acessível; um backup restaurado costuma resolver.</div>}
      <Card title="Sincronização manual" action={navigator.onLine ? <Cloud /> : <CloudOff />}>
        <p className="card-copy">{transport.name === 'disabled' ? 'A sincronização não está habilitada. Suas informações permanecem somente neste dispositivo.' : 'Se houver uma interrupção, as alterações pendentes serão mantidas para uma nova tentativa.'}</p>
        {summary && <div className="alert alert--success" role="status">Envio: {summary.pushed}. Recebimento: {summary.pulled}. Conflitos: {summary.conflicts}.</div>}
        {summary?.incomplete && <div className="alert alert--error" role="alert">Ainda há alterações para receber: esta rodada parou no limite de uma vez só. Toque em Sincronizar de novo até este aviso sumir.</div>}
        {conflicts > 0 && <div className="alert alert--warning" role="status">Há alterações concorrentes preservadas para revisão. Nenhuma versão foi apagada automaticamente. <Link className="text-link" to="/app/sincronizacao/conflitos">Revisar agora</Link></div>}
        {conflicts === 0 && resolved > 0 && <p className="card-copy">{resolved === 1 ? '1 revisão já foi resolvida.' : `${resolved} revisões já foram resolvidas.`} As versões preteridas continuam guardadas. <Link className="text-link" to="/app/sincronizacao/conflitos">Ver histórico</Link></p>}
        {error && <div className="alert alert--error" role="alert">{error}</div>}
        <Button onClick={() => void synchronize()} disabled={busy || transport.name === 'disabled'} icon={<RefreshCw className={busy ? 'spin' : ''} size={18} />}>{transport.name === 'disabled' ? 'Sincronização desativada' : busy ? 'Sincronizando…' : 'Sincronizar agora'}</Button>
      </Card>
      <Card title="Proteção da conta">
        <ul className="check-list"><li><ShieldCheck />Somente sua conta pode acessar as próprias informações.</li><li><ShieldCheck />Dispositivos removidos perdem o acesso.</li><li><ShieldCheck />O conteúdo pastoral não é lido por ninguém no caminho.</li></ul>
      </Card>
    </div>
  )
}
