import { TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { useAuthVault } from '../auth/AuthVaultContext'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { resumeDistrictClosure } from '../district/closeDistrict'

/**
 * Encerramento de distrito que ficou pela metade.
 *
 * Entre revogar os aparelhos e autorizar este de novo há um instante em que a
 * conta abre aqui e não entra mais no serviço. Se o navegador fecha bem aí, era
 * assim que ficava: nada na tela, nenhuma explicação, e nenhum caminho de
 * volta a não ser a chave de recuperação. Esta tela é esse caminho.
 */
export function ResumeClosurePage({ onDone }: { onDone: () => void }) {
  const { account } = useAuthVault()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function concluir() {
    if (!account) return
    setBusy(true)
    setError('')
    try {
      await resumeDistrictClosure(account.id)
      onDone()
    } catch (motivo) {
      setError(motivo instanceof Error ? motivo.message : 'Não foi possível concluir agora.')
      setBusy(false)
    }
  }

  return (
    <div className="page-stack page-narrow">
      <header className="page-hero">
        <div>
          <p className="eyebrow">Encerramento em andamento</p>
          <h1>Falta concluir o encerramento do distrito</h1>
          <p>O encerramento começou e não terminou neste aparelho. Os registros do distrito já saíram e os aparelhos foram removidos da conta; falta autorizar este aparelho de novo.</p>
        </div>
      </header>
      {error && <div className="alert alert--error" role="alert">{error}</div>}
      <Card title="O que acontece ao concluir">
        <ul className="plain-list">
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
