import { ArrowLeft, Check, Copy, Laptop, Smartphone } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuthVault } from '../auth/AuthVaultContext'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { ConflictService, type ConflictChoice, type ConflictPreview } from '../sync/conflicts'

const service = new ConflictService()

const choiceLabels: Record<ConflictChoice, string> = {
  keep_local: 'Ficou a versão deste aparelho',
  keep_remote: 'Ficou a versão do outro aparelho',
  keep_both: 'As duas versões foram mantidas',
}

const deletionLabels: Partial<Record<ConflictChoice, string>> = {
  keep_local: 'O registro continua valendo e volta para o outro aparelho',
  keep_remote: 'A exclusão foi aceita e vale nos dois aparelhos',
}

const localDeletionLabels: Partial<Record<ConflictChoice, string>> = {
  keep_local: 'A exclusão foi mantida e agora vale nos dois aparelhos',
  keep_remote: 'O registro do outro aparelho voltou a valer aqui',
}

function shortDate(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
}

export function SyncConflictsPage() {
  const { account, masterKey } = useAuthVault()
  const [previews, setPreviews] = useState<ConflictPreview[]>([])
  const [resolvedCount, setResolvedCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    if (!account || !masterKey) return
    setLoading(true)
    const pending = await service.listPending(account.id)
    setPreviews(await Promise.all(pending.map((conflict) => service.preview(conflict, masterKey))))
    setResolvedCount((await service.listResolved(account.id)).length)
    setLoading(false)
  }, [account, masterKey])

  useEffect(() => { void load() }, [load])

  async function choose(conflictId: string, choice: ConflictChoice) {
    if (!account || !masterKey) return
    setBusy(true); setError(''); setNotice('')
    try {
      const alvo = previews.find(({ id }) => id === conflictId)
      await service.resolve(account.id, masterKey, conflictId, choice)
      setNotice(alvo?.remoteIsDeletion
        ? `${deletionLabels[choice] ?? choiceLabels[choice]}.`
        : alvo?.localIsDeletion
          ? `${localDeletionLabels[choice] ?? choiceLabels[choice]}.`
          : `${choiceLabels[choice]}. A outra continua guardada no histórico.`)
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível concluir a revisão.')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <div className="app-loading" role="status">Abrindo as revisões…</div>

  return (
    <div className="page-stack page-narrow">
      <Link className="text-link back-link" to="/app/sincronizacao"><ArrowLeft />Voltar à sincronização</Link>
      <header className="page-hero">
        <div>
          <p className="eyebrow">Sincronização</p>
          <h1>Revisar alterações concorrentes</h1>
          <p>O mesmo registro foi alterado em dois aparelhos. Nada foi apagado: escolha o que deve ficar valendo.</p>
        </div>
      </header>

      {error && <div className="alert alert--error" role="alert">{error}</div>}
      {notice && <div className="alert alert--success" role="status">{notice}</div>}

      {previews.length === 0
        ? <Card title="Nenhuma revisão pendente"><div className="empty-state"><Check /><strong>Está tudo alinhado</strong><span>Quando o mesmo registro for alterado em dois aparelhos, ele aparece aqui para você decidir.</span></div></Card>
        : previews.map((preview) => (
          <Card key={preview.id} eyebrow={preview.kind} title={`Alteração de ${shortDate(preview.createdAt)}`}>
            <div className="conflict-sides">
              <article>
                <h3><Laptop aria-hidden="true" />Neste aparelho</h3>
                <small>Versão {preview.local.version}</small>
                <p className="preserved-text">{preview.local.summary}</p>
              </article>
              <article>
                <h3><Smartphone aria-hidden="true" />No outro aparelho</h3>
                <small>Versão {preview.remote.version}</small>
                <p className="preserved-text">{preview.remote.summary}</p>
              </article>
            </div>

            {preview.differences.length > 0 && (
              <div className="conflict-diff">
                <h4>O que mudou</h4>
                <dl className="detail-list">
                  {preview.differences.map((diferenca) => (
                    <div key={diferenca.field}>
                      <dt>{diferenca.field}</dt>
                      <dd>
                        {diferenca.local === null || diferenca.remote === null
                          ? 'Diferente nas duas versões'
                          : <><span>Neste aparelho: {diferenca.local}</span><span>No outro: {diferenca.remote}</span></>}
                      </dd>
                    </div>
                  ))}
                </dl>
                {preview.hiddenDifferences > 0 && <p className="card-copy">Há também {preview.hiddenDifferences === 1 ? 'uma diferença' : `${preview.hiddenDifferences} diferenças`} em campos que o aplicativo controla sozinho.</p>}
              </div>
            )}

            {preview.differences.length === 0 && preview.hiddenDifferences > 0 && !preview.remoteIsDeletion && (
              <p className="card-copy">As duas versões mudaram apenas em campos que o aplicativo controla sozinho.</p>
            )}

            <p className="card-copy">A versão que não ficar ativa continua guardada e protegida, para você consultar depois.</p>

            <div className="form-actions">
              <Button disabled={busy} onClick={() => void choose(preview.id, 'keep_local')} icon={<Laptop />}>{preview.remoteIsDeletion ? 'Manter o registro' : preview.localIsDeletion ? 'Manter a exclusão' : 'Ficar com a deste aparelho'}</Button>
              <Button variant="secondary" disabled={busy || (!preview.remoteIsDeletion && !preview.remote.available)} onClick={() => void choose(preview.id, 'keep_remote')} icon={<Smartphone />}>{preview.remoteIsDeletion ? 'Aceitar a exclusão' : preview.localIsDeletion ? 'Trazer o registro de volta' : 'Ficar com a do outro aparelho'}</Button>
              <Button variant="secondary" disabled={busy || preview.remoteIsDeletion || !preview.remote.available} onClick={() => void choose(preview.id, 'keep_both')} icon={<Copy />}>Manter as duas</Button>
            </div>

            {preview.remoteIsDeletion && <p className="card-copy">O outro aparelho apagou este registro. Manter faz o registro voltar a valer nos dois; aceitar a exclusão apaga também aqui.</p>}
            {preview.localIsDeletion && <p className="card-copy">Você apagou este registro aqui e o outro aparelho o alterou. Manter a exclusão apaga nos dois; trazer de volta faz a versão do outro voltar a valer aqui.</p>}
          </Card>
        ))}

      {resolvedCount > 0 && (
        <Card title="Histórico de revisões">
          <p className="card-copy">
            {resolvedCount === 1 ? '1 revisão já resolvida.' : `${resolvedCount} revisões já resolvidas.`} As versões preteridas continuam guardadas e protegidas neste aparelho.
          </p>
        </Card>
      )}
    </div>
  )
}
