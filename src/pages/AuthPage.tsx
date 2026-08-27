import { KeyRound, Leaf } from 'lucide-react'
import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useAuthVault } from '../auth/AuthVaultContext'
import { Button } from '../components/ui/Button'
import { Field } from '../components/ui/Field'

type Mode = 'register' | 'unlock' | 'recover'

export function AuthPage() {
  const { account, register, unlock, recover, recoveryCode, clearRecoveryCode } = useAuthVault()
  const [mode, setMode] = useState<Mode>(account ? 'unlock' : 'register')
  const [email, setEmail] = useState(account?.email ?? '')
  const [password, setPassword] = useState('')
  const [recovery, setRecovery] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const unlockTab = useRef<HTMLButtonElement>(null)
  const registerTab = useRef<HTMLButtonElement>(null)

  function selectMode(nextMode: Extract<Mode, 'register' | 'unlock'>) {
    setMode(nextMode)
    setError('')
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
          <p>Ela permite recuperar sua conta em outro dispositivo. Guarde-a em um local seguro e de acesso pessoal.</p>
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
          <h2>{mode === 'register' ? 'Crie sua conta' : mode === 'recover' ? 'Recupere o acesso' : 'Entre na sua conta'}</h2>
          {mode !== 'recover' && <div className="auth-tabs" role="tablist" aria-label="Acesso">
            <button ref={unlockTab} id="auth-tab-unlock" type="button" role="tab" aria-controls="auth-panel-unlock" aria-selected={mode === 'unlock'} tabIndex={mode === 'unlock' ? 0 : -1} onClick={() => selectMode('unlock')} onKeyDown={moveBetweenTabs}>Entrar</button>
            <button ref={registerTab} id="auth-tab-register" type="button" role="tab" aria-controls="auth-panel-register" aria-selected={mode === 'register'} tabIndex={mode === 'register' ? 0 : -1} onClick={() => selectMode('register')} onKeyDown={moveBetweenTabs}>Criar conta</button>
          </div>}
          <div id={mode === 'recover' ? undefined : `auth-panel-${mode}`} role={mode === 'recover' ? undefined : 'tabpanel'} aria-labelledby={mode === 'recover' ? undefined : `auth-tab-${mode}`}>
            <form onSubmit={(event) => void submit(event)} noValidate>
              <Field label="E-mail" name="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
              {mode === 'recover' && <Field label="Chave de recuperação" name="recovery" autoComplete="off" required value={recovery} onChange={(event) => setRecovery(event.target.value)} />}
              <Field
                label={mode === 'recover' ? 'Senha da conta' : 'Senha'}
                name="password"
                type="password"
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                required
                minLength={12}
                hint="Mínimo de 12 caracteres"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              {error && <div className="alert alert--error" role="alert">{error}</div>}
              <Button type="submit" full disabled={busy}>{busy ? 'Processando…' : mode === 'register' ? 'Criar conta' : mode === 'recover' ? 'Recuperar acesso' : 'Entrar'}</Button>
            </form>
          </div>
          {account && mode !== 'recover' && <button className="text-button" onClick={() => setMode('recover')}>Usar chave de recuperação</button>}
          {mode === 'recover' && <button className="text-button" onClick={() => selectMode('unlock')}>Voltar para o acesso</button>}
        </div>
      </section>
    </main>
  )
}
