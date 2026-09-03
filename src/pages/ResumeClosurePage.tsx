import { TriangleAlert } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuthVault } from '../auth/AuthVaultContext'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { db } from '../db/database'
import { CloseDistrictService, CLOSURE_STAGE_LABELS, districtClosureStage } from '../district/closeDistrict'
import { closeDistrictRemote } from '../district/closeDistrictRemote'
import type { PendingActionStage } from '../db/types'

/**
 * Encerramento de distrito que ficou pela metade.
 *
 * Entre revogar os aparelhos e autorizar este de novo há um instante em que a
 * conta abre aqui e não entra mais no serviço. Se o navegador fecha bem aí, era
 * assim que ficava: nada na tela, nenhuma explicação, e nenhum caminho de
 * volta a não ser a chave de recuperação. Esta tela é esse caminho.
 */
export function ResumeClosurePage({ onDone }: { onDone: () => void }) {
  const { account, masterKey, syncKey } = useAuthVault()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [etapa, setEtapa] = useState<PendingActionStage | null>(null)
  const service = useMemo(
    () => new CloseDistrictService(db, account && syncKey ? closeDistrictRemote(account.id, syncKey) : undefined),
    [account, syncKey],
  )

  const carregar = useCallback(async () => {
    if (!account) return
    setEtapa(await districtClosureStage(account.id))
  }, [account])
  useEffect(() => { void carregar() }, [carregar])

  async function concluir() {
    if (!account || !masterKey) return
    setBusy(true)
    setError('')
    try {
      const resultado = await service.resume(account.id, masterKey)
      if (!resultado.completed) {
        setError(resultado.pending ?? 'O encerramento ainda não terminou. Conecte-se e tente de novo.')
        await carregar()
        setBusy(false)
        return
      }
      onDone()
    } catch (motivo) {
      setError(motivo instanceof Error ? motivo.message : 'Não foi possível concluir agora.')
      await carregar()
      setBusy(false)
    }
  }

  return (
    <div className="page-stack page-narrow">
      <header className="page-hero">
        <div>
          <p className="eyebrow">Encerramento em andamento</p>
          <h1>Falta concluir o encerramento do distrito</h1>
          <p>O encerramento começou e não terminou neste aparelho. Ele continua exatamente de onde parou, sem repetir nada do que já foi feito.</p>
          {etapa && <p>Próxima etapa: <strong>{CLOSURE_STAGE_LABELS[etapa]}</strong>.</p>}
        </div>
      </header>
      {error && <div className="alert alert--error" role="alert">{error}</div>}
      <Card title="O que acontece ao concluir">
        <ul className="plain-list">
          <li>As exclusões que faltarem são publicadas, enviadas ao serviço e confirmadas antes de qualquer outra coisa.</li>
          <li>O histórico do distrito no serviço é apagado, e só então as autorizações são removidas.</li>
          <li>Este aparelho recebe uma autorização nova, sem herdar nada da anterior.</li>
          <li>Os outros aparelhos continuam removidos e precisam entrar de novo com e-mail e senha.</li>
          <li>Sua conta, sua senha, a chave de recuperação, a leitura, o orçamento familiar e a agenda pessoal continuam como estão.</li>
        </ul>
        <div className="form-actions">
          <Button disabled={busy} onClick={() => void concluir()} icon={<TriangleAlert />}>
            {busy ? 'Concluindo…' : 'Concluir encerramento'}
          </Button>
        </div>
      </Card>
    </div>
  )
}
