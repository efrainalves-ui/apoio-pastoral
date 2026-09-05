import { useReloadOnSync } from '../sync/useReloadOnSync'
/* eslint-disable @typescript-eslint/no-misused-promises */
import { ArrowLeft, TriangleAlert } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthVault } from '../auth/AuthVaultContext'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Field } from '../components/ui/Field'
import { db } from '../db/database'
import { CloseDistrictService, type CloseDistrictPreview } from '../district/closeDistrict'
import { closeDistrictRemote } from '../district/closeDistrictRemote'

const CONFIRMACAO = 'ENCERRAR'

export function CloseDistrictPage() {
  const { account, masterKey, syncKey } = useAuthVault()
  const navigate = useNavigate()
  const service = useMemo(
    () => new CloseDistrictService(db, account && syncKey ? closeDistrictRemote(account.id, syncKey) : undefined),
    [account, syncKey],
  )
  const [previa, setPrevia] = useState<CloseDistrictPreview | null>(null)
  const [texto, setTexto] = useState('')
  const [ciente, setCiente] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!account || !masterKey) return
    try { setPrevia(await service.preview(account.id, masterKey)) } catch { setError('Não foi possível abrir os dados do distrito.') }
  }, [account, masterKey, service])
  useReloadOnSync(load)

  async function encerrar() {
    if (!account || !masterKey || texto.trim().toUpperCase() !== CONFIRMACAO || !ciente) return
    if (!window.confirm('Encerrar o distrito? Os dados do distrito serão apagados e o aplicativo não poderá recuperá-los depois desta confirmação.')) return
    setBusy(true); setError('')
    try {
      const resultado = await service.close(account.id, masterKey)
      // Encerramento que parou em uma etapa não vira "pronto": a tela diz o
      // que falta e o pastor conclui pela retomada, com rede.
      if (!resultado.completed) {
        setError(resultado.pending ?? 'O encerramento não terminou. Conecte-se e conclua.')
        setBusy(false)
        return
      }
      await navigate('/app', { replace: true })
    } catch (motivo) {
      setError(motivo instanceof Error ? motivo.message : 'Não foi possível encerrar o distrito.')
      setBusy(false)
    }
  }

  if (!previa) return <div className="app-loading" role="status">Abrindo os dados do distrito…</div>

  return <div className="page-stack page-narrow">
    <Link className="text-link back-link" to="/app/configuracoes"><ArrowLeft />Voltar às configurações</Link>
    <header className="page-hero"><div><h1>Encerrar distrito</h1></div></header>
    {error && <div className="alert alert--error" role="alert">{error}</div>}

    <Card title="O que será apagado">
      <div className="goal-card__numbers">
        <div><small>Registros do distrito</small><strong>{previa.districtRecords}</strong></div>
        <div><small>Aparelhos autorizados</small><strong>{previa.devices}</strong></div>
        <div><small>Registros pessoais preservados</small><strong>{previa.personalRecords}</strong></div>
      </div>
      <ul className="plain-list">{previa.removedLabels.map((label) => <li key={label}>{label}</li>)}</ul>
      {previa.unreadableRecords > 0 && <div className="alert alert--warning" role="status">{previa.unreadableRecords} registro(s) não abriram neste aparelho e ficaram em quarentena. Eles não serão apagados por este encerramento, porque não é possível saber o que são.</div>}
    </Card>

    <Card title="O que permanece">
      <ul className="plain-list">
        <li>Sua conta, sua senha e sua chave de recuperação.</li>
        <li>Leitura, Orçamento Familiar e os compromissos marcados como pessoais.</li>
        <li>Depois de encerrar, você começa um novo distrito vazio nesta mesma conta.</li>
      </ul>
    </Card>

    <Card className="danger-card" title="Antes de confirmar">
      <ul className="plain-list">
        <li>Backups que você baixou ficam com você: o aplicativo não alcança esses arquivos.</li>
        <li>Todos os aparelhos autorizados perdem o acesso; este aparelho recebe uma autorização nova.</li>
        <li>A remoção também vale para o serviço de sincronização na próxima conexão.</li>
      </ul>
      <label className="confirmation-check">
        <input type="checkbox" checked={ciente} onChange={(event) => setCiente(event.target.checked)} />
        <span><strong>Entendi que os dados do distrito serão apagados e não poderão ser recuperados pelo aplicativo.</strong></span>
      </label>
      <Field label={`Escreva ${CONFIRMACAO} para liberar o botão`} name="confirmar-encerramento" value={texto} onChange={(event) => setTexto(event.target.value)} />
      <div className="form-actions">
        <Button variant="danger" icon={<TriangleAlert />} disabled={busy || !ciente || texto.trim().toUpperCase() !== CONFIRMACAO} onClick={encerrar}>{busy ? 'Encerrando…' : 'Encerrar distrito'}</Button>
        <Link className="button button--secondary" to="/app/configuracoes">Cancelar</Link>
      </div>
    </Card>
  </div>
}
