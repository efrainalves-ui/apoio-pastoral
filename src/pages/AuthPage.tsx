import { KeyRound, Leaf } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useAuthVault } from '../auth/AuthVaultContext'
import { openedFromPasswordReset } from '../auth/passwordReset'
import { hasSupabaseConfiguration, onPasswordRecovery } from '../auth/supabase'
import { Button } from '../components/ui/Button'
import { Field } from '../components/ui/Field'

type Mode = 'register' | 'unlock' | 'recover' | 'reset'

export function AuthPage() {
  const { account, accounts, register, unlock, recover, completeReset, recoveryCode, clearRecoveryCode, awaitingConfirmation, resendConfirmation, sendPasswordReset, sessionLostMessage } = useAuthVault()
  const [mode, setMode] = useState<Mode>(openedFromPasswordReset ? 'reset' : account ? 'unlock' : 'register')
  const [email, setEmail] = useState(account?.email ?? '')
  const [password, setPassword] = useState('')
  const [recovery, setRecovery] = useState('')
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [busy, setBusy] = useState(false)
  const unlockTab = useRef<HTMLButtonElement>(null)
  const registerTab = useRef<HTMLButtonElement>(null)

  // O endereço já pode ter sido limpo pelo cliente do serviço antes desta tela
  // montar; o aviso do próprio serviço chega de qualquer forma.
  useEffect(() => onPasswordRecovery(() => setMode('reset')), [])

  function selectMode(nextMode: Extract<Mode, 'register' | 'unlock'>) {
    setMode(nextMode)
    setError('')
    setAviso('')
  }

  /**
   * Redefinir a senha usa o e-mail oficial do serviço. A chave de recuperação
   * não é enviada por e-mail nenhum: ela é o último recurso, guardada pelo
   * pastor, e continua sendo necessária para reabrir o cofre num aparelho que
   * ainda não conhece a conta.
   */
  async function redefinirSenha() {
    setError('')
    setAviso('')
    if (!/^\S+@\S+\.\S+$/u.test(email)) { setError('Informe o e-mail da conta para receber o link.'); return }
    setBusy(true)
    try {
      await sendPasswordReset(email)
      setAviso('Enviamos um link de redefinição para o seu e-mail. Abra o link neste aparelho: lá você define a senha nova e informa a sua chave de recuperação para reabrir o cofre.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível enviar o link agora.')
    } finally {
      setBusy(false)
    }
  }

  async function reenviarConfirmacao() {
    setError('')
    setAviso('')
    setBusy(true)
    try {
      await resendConfirmation(email)
      setAviso('Confirmação reenviada. Confira sua caixa de entrada e o lixo eletrônico.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível reenviar agora.')
    } finally {
      setBusy(false)
    }
  }

  function moveBetweenTabs(event: KeyboardEvent<HTMLButtonElement>) {
    let nextMode: Extract<Mode, 'register' | 'unlock'> | null = null
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') nextMode = mode === 'unlock' ? 'register' : 'unlock'
    if (event.key === 'Home') nextMode = 'unlock'
    if (event.key === 'End') nextMode = 'register'
    if (!nextMode) return
    event.preventDefault()
    selectMode(nextMode)
    const nextTab = nextMode === 'unlock' ? unlockTab : registerTab
    nextTab.current?.focus()
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      if (mode === 'register') await register(email, password)
      else if (mode === 'unlock') await unlock(email, password)
      else if (mode === 'reset') await completeReset(email, recovery, password)
      else await recover(email, recovery, password)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível concluir a operação.')
    } finally {
      setBusy(false)
    }
  }

  if (recoveryCode) {
    return (
      <main id="conteudo" className="recovery-screen">
        <section className="recovery-card" aria-labelledby="recovery-title">
          <div className="auth-logo"><KeyRound aria-hidden="true" /></div>
          <p className="eyebrow">Etapa única e obrigatória</p>
          <h1 id="recovery-title">Guarde sua chave de recuperação</h1>
          <p>Ela permite recuperar sua conta em outro dispositivo. Guarde-a em um local seguro e de acesso pessoal. Nunca enviamos esta chave por e-mail.</p>
          {awaitingConfirmation && <p className="alert alert--success" role="status">Confirme o e-mail desta conta pelo link que acabamos de enviar. Depois disso, entre com o e-mail e a senha que você escolheu.</p>}
          <code className="recovery-code" data-testid="recovery-code">{recoveryCode}</code>
          <Button onClick={() => void navigator.clipboard?.writeText(recoveryCode)} variant="secondary" full>Copiar chave</Button>
          <Button onClick={clearRecoveryCode} full>Já guardei em local seguro</Button>
        </section>
      </main>
    )
  }

  return (
    <main id="conteudo" className="auth-page">
      <section className="auth-story" aria-label="Sobre o Apoio Pastoral">
        <div className="auth-story__content">
          <div className="auth-brand"><span><Leaf /></span>Apoio Pastoral</div>
          <h1>Seu ministério organizado.<br />Seus dados, só seus.</h1>
          <p className="auth-story__lead">Agenda, visitas, pessoas e metas em um só lugar.</p>
        </div>
      </section>
      <section className="auth-panel">
        <div className="auth-form-wrap">
          <h2>{mode === 'register' ? 'Crie sua conta' : mode === 'recover' ? 'Recupere o acesso' : mode === 'reset' ? 'Defina sua senha nova' : 'Entre na sua conta'}</h2>
          {mode === 'reset' && <p className="field__hint">Este link define a senha nova da sua conta. Como o cofre era aberto pela senha anterior, informe também a sua chave de recuperação: nem o serviço nem este aplicativo conseguem abrir o conteúdo sem ela.</p>}
          {mode !== 'recover' && mode !== 'reset' && accounts.length > 0 && <div className="account-switcher">
            <p className="field__hint">Contas neste aparelho</p>
            <ul>{accounts.map((conta) => <li key={conta.id}><button type="button" className={`account-switcher__option${email.trim().toLowerCase() === conta.email ? ' account-switcher__option--on' : ''}`} onClick={() => { setMode('unlock'); setEmail(conta.email); setPassword(''); setError('') }}>{conta.email}</button></li>)}</ul>
            <p className="field__hint">Cada conta tem os próprios dados neste aparelho. Escolha uma e informe a senha dela.</p>
          </div>}
          {mode !== 'recover' && mode !== 'reset' && <div className="auth-tabs" role="tablist" aria-label="Acesso">
            <button ref={unlockTab} id="auth-tab-unlock" type="button" role="tab" aria-controls="auth-panel-unlock" aria-selected={mode === 'unlock'} tabIndex={mode === 'unlock' ? 0 : -1} onClick={() => selectMode('unlock')} onKeyDown={moveBetweenTabs}>Entrar</button>
            <button ref={registerTab} id="auth-tab-register" type="button" role="tab" aria-controls="auth-panel-register" aria-selected={mode === 'register'} tabIndex={mode === 'register' ? 0 : -1} onClick={() => selectMode('register')} onKeyDown={moveBetweenTabs}>Criar conta</button>
          </div>}
          {(() => { const semAba = mode === 'recover' || mode === 'reset'; return <div id={semAba ? undefined : `auth-panel-${mode}`} role={semAba ? undefined : 'tabpanel'} aria-labelledby={semAba ? undefined : `auth-tab-${mode}`}>
            <form onSubmit={(event) => void submit(event)} noValidate>
              <Field label="E-mail" name="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
              {mode === 'recover' && <><p className="field__hint">Use este caminho só quando perdeu a senha e todos os aparelhos. Redefina a senha pelo e-mail primeiro e informe abaixo a senha nova junto da sua chave.</p><Field label="Chave de recuperação" name="recovery" autoComplete="off" required value={recovery} onChange={(event) => setRecovery(event.target.value)} /></>}
              {mode === 'reset' && <Field label="Chave de recuperação" name="recovery" autoComplete="off" required value={recovery} onChange={(event) => setRecovery(event.target.value)} />}
              <Field
                label={mode === 'recover' ? 'Senha da conta' : mode === 'reset' ? 'Senha nova' : 'Senha'}
                name="password"
                type="password"
                autoComplete={mode === 'register' || mode === 'reset' ? 'new-password' : 'current-password'}
                required
                minLength={12}
                hint="Mínimo de 12 caracteres"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              {sessionLostMessage && <div className="alert alert--error" role="alert">{sessionLostMessage}</div>}
              {error && <div className="alert alert--error" role="alert">{error}</div>}
              {aviso && <div className="alert alert--success" role="status">{aviso}</div>}
              <Button type="submit" full disabled={busy}>{busy ? 'Processando…' : mode === 'register' ? 'Criar conta' : mode === 'recover' ? 'Recuperar acesso' : mode === 'reset' ? 'Definir senha nova' : 'Entrar'}</Button>
              {mode === 'register' && <p className="auth-privacy">Sua conta cuida só do seu distrito. <a href="/privacidade">Como cuidamos dos dados</a></p>}
            </form>
          </div> })()}
          {hasSupabaseConfiguration && mode === 'unlock' && <button className="text-button" type="button" onClick={() => void redefinirSenha()} disabled={busy}>Esqueci minha senha</button>}
          {hasSupabaseConfiguration && mode === 'unlock' && <button className="text-button" type="button" onClick={() => void reenviarConfirmacao()} disabled={busy}>Reenviar confirmação de e-mail</button>}
          {(account || hasSupabaseConfiguration) && mode !== 'recover' && mode !== 'reset' && <button className="text-button" onClick={() => setMode('recover')}>Usar chave de recuperação</button>}
          {(mode === 'recover' || mode === 'reset') && <button className="text-button" onClick={() => selectMode('unlock')}>Voltar para o acesso</button>}
        </div>
      </section>
    </main>
  )
}
