import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuthVault } from '../auth/AuthVaultContext'
import { linkDoLembrete } from '../lembretes/avisoNoApp'
import { localizarOcorrencia } from '../lembretes/push'
import { fusoDoAparelho } from '../lembretes/tempo'
import { servicoDeLembretes } from '../lembretes/useCentral'

/**
 * Onde a notificação chega.
 *
 * O endereço traz só a chave opaca. Com o cofre aberto, ela é reconhecida aqui
 * e o lembrete certo abre; se não for reconhecida (concluído em outro aparelho,
 * horário mudado, outra conta), abre Hoje.
 */
export function LembreteAvisoPage() {
  const { chave = '' } = useParams()
  const { account, masterKey } = useAuthVault()
  const navigate = useNavigate()

  useEffect(() => {
    if (!account || !masterKey) return
    let cancelado = false
    void (async () => {
      let destino = '/app/lembretes/bloco/hoje'
      try {
        const achada = await localizarOcorrencia(masterKey, await servicoDeLembretes.lembretes(account.id, masterKey), chave, new Date(), fusoDoAparelho())
        if (achada) destino = linkDoLembrete(achada)
      } catch { /* sem reconhecer, Hoje */ }
      if (!cancelado) void navigate(destino, { replace: true })
    })()
    return () => { cancelado = true }
  }, [account, masterKey, chave, navigate])

  return <div className="app-loading" role="status">Abrindo o lembrete…</div>
}
