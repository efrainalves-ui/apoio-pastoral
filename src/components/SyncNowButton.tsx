import { notificarDadosSincronizados } from '../sync/useReloadOnSync'
import { RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuthVault } from '../auth/AuthVaultContext'
import { currentDeviceId } from '../auth/device'
import { deveSincronizarAgora } from '../sync/autoSync'
import { countPendingChanges, pendingLabel } from '../sync/pending'
import { SyncService, syncConfirmed } from '../sync/service'
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
  // Em `ref`, e não em estado: quem decide se pode começar uma rodada precisa
  // do valor do instante, não do valor que existia quando o efeito foi criado.
  // Com estado, dois gatilhos próximos leem "parado" ao mesmo tempo e disparam
  // duas rodadas sobre o mesmo cursor.
  const emCurso = useRef(false)
  const ultimaRodada = useRef<number | null>(null)

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

  const sincronizar = useCallback(async ({ automatica = false } = {}) => {
    if (!account || !syncKey || emCurso.current) return
    if (!navigator.onLine) { if (!automatica) setSituacao('offline'); return }
    emCurso.current = true
    ultimaRodada.current = Date.now()
    setSituacao('sincronizando')
    try {
      const resumo = await service.synchronize(account.id, currentDeviceId(account.id), syncKey)
      // "Dados atualizados" é uma afirmação, e ela só pode ser feita quando a
      // rodada terminou de verdade.
      setSituacao(syncConfirmed(resumo) ? 'pronto' : resumo.status === 'offline' ? 'offline' : 'incompleto')
      // Chegou coisa de outro aparelho: as telas abertas precisam saber, senão
      // o dado está no banco e a lista na frente do pastor continua a de antes.
      if (resumo.pulled > 0 || resumo.conflicts > 0) notificarDadosSincronizados()
    } catch {
      setSituacao(navigator.onLine ? 'erro' : 'offline')
    } finally {
      emCurso.current = false
      await conferirFila()
    }
  }, [account, conferirFila, service, syncKey])

  /**
   * A sincronização acontece sozinha, e o botão continua existindo.
   *
   * Antes era só manual, e o custo apareceu na prática: um distrito inteiro
   * importado num aparelho, o outro aberto e vazio, porque ninguém apertou um
   * botão. Agora ela é tentada ao abrir, ao voltar para a tela, quando a
   * internet volta, pouco depois de uma alteração e de tempos em tempos —
   * sempre pelas mesmas regras, que vivem em `autoSync` e têm teste.
   *
   * Falha de rodada automática não vira aviso vermelho: quem não pediu nada não
   * precisa ser alarmado por uma tentativa de fundo que não deu certo. O botão
   * manual continua dizendo tudo, porque ali houve um pedido.
   */
  useEffect(() => {
    if (!account || !syncKey || transport.name === 'disabled') return
    const tentar = (motivo: 'tick' | 'retorno') => {
      if (deveSincronizarAgora({
        online: navigator.onLine,
        emCurso: emCurso.current,
        pendentes,
        ultimaRodada: ultimaRodada.current,
        agora: Date.now(),
        motivo,
      })) void sincronizar({ automatica: true })
    }
    const aoRetornar = () => { tentar('retorno') }
    const aoRelogio = () => { tentar('tick') }

    aoRetornar()
    const relogio = window.setInterval(aoRelogio, 15_000)
    const aoTrocarVisibilidade = () => { if (!document.hidden) aoRetornar() }
    window.addEventListener('focus', aoRetornar)
    window.addEventListener('online', aoRetornar)
    document.addEventListener('visibilitychange', aoTrocarVisibilidade)
    return () => {
      window.clearInterval(relogio)
      window.removeEventListener('focus', aoRetornar)
      window.removeEventListener('online', aoRetornar)
      document.removeEventListener('visibilitychange', aoTrocarVisibilidade)
    }
  }, [account, pendentes, sincronizar, syncKey, transport.name])

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
