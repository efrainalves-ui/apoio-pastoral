import { useReloadOnSync } from '../sync/useReloadOnSync'
import { ArrowLeft, Check, Copy, Laptop, Smartphone } from 'lucide-react'
import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuthVault } from '../auth/AuthVaultContext'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { ErrorState, LoadingState } from '../components/ui/AsyncState'
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
  const [resolvedPreviews, setResolvedPreviews] = useState<ConflictPreview[]>([])
  const [guardadas, setGuardadas] = useState(0)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    if (!account || !masterKey) return
    setLoading(true)
    setError('')
    try {
      const [pending, resolved] = await Promise.all([service.listPending(account.id), service.listResolved(account.id)])
      const [pendingViews, resolvedViews] = await Promise.all([
        Promise.all(pending.map((conflict) => service.preview(conflict, masterKey))),
        Promise.all(resolved.sort((a, b) => (b.resolvedAt ?? '').localeCompare(a.resolvedAt ?? '')).slice(0, 20).map((conflict) => service.preview(conflict, masterKey))),
      ])
      setPreviews(pendingViews)
      setResolvedPreviews(resolvedViews)
      setGuardadas(resolved.length)
    } catch {
      setError('Não foi possível abrir as revisões guardadas neste aparelho.')
    } finally {
      setLoading(false)
    }
  }, [account, masterKey])

  useReloadOnSync(load)

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

  /**
   * Resolve de uma vez as que não têm diferença nenhuma.
   *
   * Pedir um clique por revisão em que as duas versões são idênticas não é
   * proteção: é transferir ao pastor um trabalho que o aplicativo sabe fazer.
   */
  async function resolverIguais() {
    if (!account || !masterKey) return
    setBusy(true); setError(''); setNotice('')
    try {
      const quantas = await service.resolverSemDiferenca(account.id, masterKey)
      setNotice(quantas === 1
        ? '1 revisão resolvida: as duas versões eram iguais.'
        : `${quantas} revisões resolvidas: as duas versões eram iguais.`)
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível resolver as revisões.')
    } finally {
      setBusy(false)
    }
  }

  /**
   * Esquece o histórico já resolvido.
   *
   * Guardar as duas versões de cada revisão nasceu de uma promessa boa, mas a
   * promessa não tinha fim: a lista só crescia. O que sai é a cópia da versão
   * que não ficou valendo; o registro ativo não é tocado. Não dá para voltar
   * atrás, e por isso é o pastor que decide.
   */
  async function esquecerHistorico() {
    if (!account) return
    if (!window.confirm(`Esquecer ${guardadas} ${guardadas === 1 ? 'revisão já resolvida' : 'revisões já resolvidas'}? A versão que não ficou valendo deixa de poder ser consultada. Os registros ativos não mudam.`)) return
    setBusy(true); setError(''); setNotice('')
    try {
      const quantas = await service.esquecerResolvidas(account.id)
      setNotice(quantas === 1 ? '1 revisão esquecida.' : `${quantas} revisões esquecidas.`)
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível esquecer o histórico.')
    } finally {
      setBusy(false)
    }
  }

  const semDiferenca = previews.filter((preview) => service.semDiferencaReal(preview)).length

  if (loading) return <LoadingState title="Abrindo as revisões…" />

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

      {error && previews.length > 0 && <div className="alert alert--error" role="alert">{error}</div>}
      {error && previews.length === 0 && <ErrorState title="As revisões não puderam ser abertas" detail={error} retry={() => void load()} />}
      {notice && <div className="alert alert--success" role="status">{notice}</div>}

      {semDiferenca > 0 && <Card title="Revisões sem diferença">
        <p className="card-copy">
          {semDiferenca === 1
            ? '1 revisão tem as duas versões iguais: mudou só o que o aplicativo controla sozinho.'
            : `${semDiferenca} revisões têm as duas versões iguais: mudou só o que o aplicativo controla sozinho.`}
        </p>
        <Button disabled={busy} onClick={() => void resolverIguais()}>
          {busy ? 'Resolvendo…' : 'Resolver todas de uma vez'}
        </Button>
      </Card>}

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

      {resolvedPreviews.length > 0 && (
        <Card title="Histórico de revisões">
          <p className="card-copy">
            {guardadas === 1 ? '1 revisão já resolvida.' : `${guardadas} revisões já resolvidas.`}
            {guardadas > resolvedPreviews.length ? ` ${resolvedPreviews.length} mais recentes abaixo.` : ''} As duas versões continuam guardadas e protegidas neste aparelho.
          </p>
          <div className="form-actions">
            <Button variant="danger" disabled={busy} onClick={() => void esquecerHistorico()}>
              {busy ? 'Esquecendo…' : `Esquecer ${guardadas} ${guardadas === 1 ? 'revisão' : 'revisões'}`}
            </Button>
          </div>
          <div className="settings-list">
            {resolvedPreviews.map((preview) => <details key={preview.id}><summary><strong>{preview.kind}</strong> · {shortDate(preview.resolvedAt ?? preview.createdAt)}</summary><p>{preview.choice ? choiceLabels[preview.choice] : 'Revisão concluída'}.</p><div className="conflict-sides"><article><h3><Laptop aria-hidden="true" />Neste aparelho</h3><p className="preserved-text">{preview.local.summary}</p></article><article><h3><Smartphone aria-hidden="true" />No outro aparelho</h3><p className="preserved-text">{preview.remote.summary}</p></article></div></details>)}
          </div>
        </Card>
      )}
    </div>
  )
}
