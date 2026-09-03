import { RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuthVault } from '../auth/AuthVaultContext'
import { currentDeviceId } from '../auth/device'
import { countPendingChanges, pendingLabel } from '../sync/pending'
import { SyncService } from '../sync/service'
import { createSyncTransport } from '../sync/transport'

type Situacao = 'parado' | 'sincronizando' | 'pronto' | 'incompleto' | 'offline' | 'erro'

const MENSAGENS: Record<Exclude<Situacao, 'parado'>, string> = {
  sincronizando: 'Sincronizando…',
  pronto: 'Dados atualizados',
  // Anunciar "Dados atualizados" com páginas faltando é a pior das saídas: o
  // pastor para de sincronizar acreditando estar em dia.
  incompleto: 'Ainda faltam dados para receber. Toque em Sincronizar de novo até este aviso sumir.',
  offline: 'Sem internet agora. Suas alterações ficam guardadas e sobem quando a conexão voltar.',
  erro: 'Não foi possível atualizar agora. Suas alterações continuam guardadas neste aparelho.',
}

/**
 * Atalho diário da tela inicial. A tela completa continua em Mais; aqui o
 * pastor só precisa saber se está atualizado — nada de detalhe técnico.
 */
export function SyncNowButton({ compact = false }: { compact?: boolean } = {}) {
  const { account, syncKey } = useAuthVault()
  const transport = useMemo(() => createSyncTransport(), [])
  const service = useMemo(() => new SyncService(transport), [transport])
  const [situacao, setSituacao] = useState<Situacao>('parado')
  const [pendentes, setPendentes] = useState(0)

  // A fila é local: conferir de tempos em tempos custa pouco e mantém o aviso
  // certo mesmo quando o registro foi salvo em outra tela.
  const conferirFila = useCallback(async () => {
    if (!account) return
    try { setPendentes(await countPendingChanges(account.id)) } catch { /* sem fila legível, segue sem aviso */ }
  }, [account])

  useEffect(() => {
    void conferirFila()
    const relogio = window.setInterval(() => { void conferirFila() }, 15_000)
    const aoVoltar = () => { void conferirFila() }
    window.addEventListener('focus', aoVoltar)
    return () => { window.clearInterval(relogio); window.removeEventListener('focus', aoVoltar) }
  }, [conferirFila])

  const sincronizar = useCallback(async () => {
    if (!account || !syncKey || situacao === 'sincronizando') return
    if (!navigator.onLine) { setSituacao('offline'); return }
    setSituacao('sincronizando')
    try {
      const resumo = await service.synchronize(account.id, currentDeviceId(account.id), syncKey)
      setSituacao(resumo.incomplete ? 'incompleto' : 'pronto')
    } catch {
      setSituacao(navigator.onLine ? 'erro' : 'offline')
    } finally {
      await conferirFila()
    }
  }, [account, conferirFila, service, situacao, syncKey])

  if (transport.name === 'disabled') return null

  // No cabeçalho o atalho é só o ícone; o aviso aparece logo abaixo dele.
  const aviso = pendentes > 0 ? pendingLabel(pendentes) : ''

  if (compact) return (
    <div className="sync-now">
      <button type="button" className="icon-button sync-now__trigger" aria-label={situacao === 'sincronizando' ? 'Sincronizando' : aviso ? `Sincronizar · ${aviso}` : 'Sincronizar'} onClick={() => void sincronizar()} disabled={situacao === 'sincronizando'}>
        <RefreshCw className={situacao === 'sincronizando' ? 'spin' : ''} aria-hidden="true" />
        {pendentes > 0 && <span className="sync-now__dot" aria-hidden="true" />}
      </button>
      {situacao !== 'parado' ? <p className="sync-now__toast" role="status">{MENSAGENS[situacao]}</p> : null}
    </div>
  )

  return (
    <>
      <button type="button" className="button button--secondary" onClick={() => void sincronizar()} disabled={situacao === 'sincronizando'}>
        <RefreshCw className={situacao === 'sincronizando' ? 'spin' : ''} aria-hidden="true" />
        {situacao === 'sincronizando' ? 'Sincronizando…' : 'Sincronizar'}
      </button>
      {situacao === 'parado' && aviso && <p className="sync-now__notice" role="status">{aviso}</p>}
      {situacao !== 'parado' && (
        <p className={`sync-now__notice${situacao === 'pronto' ? ' sync-now__notice--ok' : ''}`} role={situacao === 'incompleto' ? 'alert' : 'status'}>{MENSAGENS[situacao]}</p>
      )}
    </>
  )
}
