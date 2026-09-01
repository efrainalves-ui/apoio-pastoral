import { ShieldCheck, Smartphone } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useAuthVault } from '../auth/AuthVaultContext'
import { currentDeviceId, deviceConfirmationCode, refreshCurrentDeviceStatus } from '../auth/device'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'

/**
 * Um aparelho recém-instalado abre o cofre com a senha, mas ainda não
 * sincroniza. Esta tela mostra o código que o pastor confere no aparelho que já
 * estava valendo, e libera sozinha assim que a confirmação chega.
 */
export function DeviceApprovalPage({ onApproved }: { onApproved: () => void }) {
  const { account, lock } = useAuthVault()
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState('')
  const code = deviceConfirmationCode(currentDeviceId())

  const check = useCallback(async () => {
    if (!account) return
    setChecking(true)
    setError('')
    try {
      const status = await refreshCurrentDeviceStatus(account.id)
      if (status === 'active') onApproved()
      else if (status === 'revoked') setError('Este aparelho foi removido da conta. Peça uma nova autorização.')
    } catch {
      setError('Não foi possível falar com o serviço agora. Tentaremos de novo.')
    } finally {
      setChecking(false)
    }
  }, [account, onApproved])

  useEffect(() => {
    void check()
    const timer = setInterval(() => void check(), 5000)
    return () => clearInterval(timer)
  }, [check])

  return (
    <div className="page-stack page-narrow device-approval">
      <Card title="Confirme este aparelho" eyebrow="Proteção da conta">
        <p className="card-copy">
          Sua senha abriu o cofre aqui. Para este aparelho começar a sincronizar, confirme-o
          em um aparelho que você já usa.
        </p>
        <div className="device-approval__code" aria-label="Código de confirmação deste aparelho">
          <Smartphone aria-hidden="true" />
          <strong>{code}</strong>
        </div>
        <ol className="check-list">
          <li><ShieldCheck />No aparelho que já está conectado, abra <strong>Mais</strong> e depois <strong>Segurança</strong>.</li>
          <li><ShieldCheck />Confira se o código mostrado lá é o mesmo desta tela.</li>
          <li><ShieldCheck />Toque em <strong>Confirmar</strong>.</li>
        </ol>
        {error && <div className="alert alert--error" role="alert">{error}</div>}
        <p className="card-copy">Enquanto isso, nada é enviado nem recebido por este aparelho.</p>
        <div className="form-actions">
          <Button onClick={() => void check()} disabled={checking}>{checking ? 'Verificando…' : 'Já confirmei'}</Button>
          <Button variant="secondary" onClick={() => lock()}>Sair</Button>
        </div>
      </Card>
      <Card title="Perdeu o acesso a todos os aparelhos?">
        <p className="card-copy">
          Só nesse caso use a chave de recuperação que você guardou ao criar a conta. Ela
          libera o acesso sem depender de outro aparelho.
        </p>
      </Card>
    </div>
  )
}
