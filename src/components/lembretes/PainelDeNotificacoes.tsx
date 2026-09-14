import { Bell, BellOff, BellRing, Smartphone } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAuthVault } from '../../auth/AuthVaultContext'
import {
  ativarNotificacoes, definirMostrarTitulo, enviarNotificacaoDeTeste, estadoDasNotificacoes, mostrarTituloNaNotificacao,
  removerInscricaoDoAparelho, type EstadoDasNotificacoes,
} from '../../lembretes/push'
import { avisarAlteracaoDeLembretes } from '../../lembretes/useCentral'

const ROTULOS: Record<Exclude<EstadoDasNotificacoes, 'carregando'>, string> = {
  ativada: 'Notificações ativadas',
  desativada: 'Notificações desativadas',
  negada: 'Permissão negada',
  incompativel: 'Navegador incompatível',
  'instalar-iphone': 'Instale na Tela de Início para receber no iPhone',
  indisponivel: 'Notificações indisponíveis nesta instalação',
}

export function PainelDeNotificacoes() {
  const { account } = useAuthVault()
  const [estado, setEstado] = useState<EstadoDasNotificacoes>('carregando')
  const [mostrarTitulo, setMostrarTitulo] = useState(false)
  const [aviso, setAviso] = useState('')
  const [ocupado, setOcupado] = useState(false)

  useEffect(() => {
    if (!account) return
    let ativo = true
    void Promise.all([estadoDasNotificacoes(account.id), mostrarTituloNaNotificacao()])
      .then(([atual, titulo]) => { if (ativo) { setEstado(atual); setMostrarTitulo(titulo) } })
      .catch(() => { if (ativo) setEstado('incompativel') })
    return () => { ativo = false }
  }, [account])

  if (!account || estado === 'carregando') return null

  const agir = async (acao: () => Promise<void>) => {
    setOcupado(true)
    setAviso('')
    try { await acao() } catch (falha) { setAviso(falha instanceof Error ? falha.message : 'Não foi possível concluir.') } finally { setOcupado(false) }
  }

  const Icone = estado === 'ativada' ? BellRing : estado === 'instalar-iphone' ? Smartphone : estado === 'desativada' ? Bell : BellOff

  return (
    <section className="lembretes-secao" aria-labelledby="notificacoes-dos-lembretes">
      <header className="lembretes-secao__topo"><h2 id="notificacoes-dos-lembretes">Notificações</h2></header>
      <div className="lembretes-notificacoes">
        <p className={`lembretes-notificacoes__estado lembretes-notificacoes__estado--${estado}`} role="status">
          <Icone aria-hidden="true" />{ROTULOS[estado]}
        </p>
        {aviso && <p className="lembretes-notificacoes__aviso" role="alert">{aviso}</p>}
        {estado === 'desativada' && (
          <button type="button" className="button button--primary" disabled={ocupado} onClick={() => { void agir(async () => { setEstado(await ativarNotificacoes(account.id)); avisarAlteracaoDeLembretes() }) }}>
            <Bell aria-hidden="true" /><span>Ativar notificações</span>
          </button>
        )}
        {estado === 'ativada' && (
          <>
            <label className="confirmation-check">
              <input type="checkbox" checked={mostrarTitulo} onChange={(evento) => { const valor = evento.target.checked; void agir(async () => { await definirMostrarTitulo(valor); setMostrarTitulo(valor) }) }} />
              <span><strong>Mostrar o título do lembrete</strong></span>
            </label>
            <div className="lembretes-notificacoes__acoes">
              <button type="button" className="button button--secondary" disabled={ocupado} onClick={() => { void agir(async () => { await enviarNotificacaoDeTeste(account.id); setAviso('Notificação de teste enviada') }) }}>
                <BellRing aria-hidden="true" /><span>Enviar notificação de teste</span>
              </button>
              <button type="button" className="button button--quiet" disabled={ocupado} onClick={() => { void agir(async () => { await removerInscricaoDoAparelho(account.id); setEstado('desativada') }) }}>
                <BellOff aria-hidden="true" /><span>Desativar</span>
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  )
}
