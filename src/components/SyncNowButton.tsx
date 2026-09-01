import { RefreshCw } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { useAuthVault } from '../auth/AuthVaultContext'
import { currentDeviceId } from '../auth/device'
import { SyncService } from '../sync/service'
import { createSyncTransport } from '../sync/transport'

type Situacao = 'parado' | 'sincronizando' | 'pronto' | 'offline' | 'erro'

const MENSAGENS: Record<Exclude<Situacao, 'parado'>, string> = {
  sincronizando: 'Sincronizando…',
  pronto: 'Dados atualizados',
  offline: 'Sem internet agora. Suas alterações ficam guardadas e sobem quando a conexão voltar.',
  erro: 'Não foi possível atualizar agora. Suas alterações continuam guardadas neste aparelho.',
}

/**
 * Atalho diário da tela inicial. A tela completa continua em Mais; aqui o
 * pastor só precisa saber se está atualizado — nada de detalhe técnico.
 */
export function SyncNowButton() {
  const { account } = useAuthVault()
  const transport = useMemo(() => createSyncTransport(), [])
  const service = useMemo(() => new SyncService(transport), [transport])
  const [situacao, setSituacao] = useState<Situacao>('parado')

  const sincronizar = useCallback(async () => {
    if (!account || situacao === 'sincronizando') return
    if (!navigator.onLine) { setSituacao('offline'); return }
    setSituacao('sincronizando')
    try {
      await service.synchronize(account.id, currentDeviceId(account.id))
      setSituacao('pronto')
    } catch {
      setSituacao(navigator.onLine ? 'erro' : 'offline')
    }
  }, [account, service, situacao])

  if (transport.name === 'disabled') return null

  return (
    <>
      <button type="button" className="button button--secondary" onClick={() => void sincronizar()} disabled={situacao === 'sincronizando'}>
        <RefreshCw className={situacao === 'sincronizando' ? 'spin' : ''} aria-hidden="true" />
        {situacao === 'sincronizando' ? 'Sincronizando…' : 'Sincronizar'}
      </button>
      {situacao !== 'parado' && (
        <p className={`sync-now__notice${situacao === 'pronto' ? ' sync-now__notice--ok' : ''}`} role="status">{MENSAGENS[situacao]}</p>
      )}
    </>
  )
}
