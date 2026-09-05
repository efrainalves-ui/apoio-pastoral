import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AccountRecord } from '../db/types'
import { AuthPage } from './AuthPage'

const authState = vi.hoisted(() => ({
  contas: [] as Array<{ id: string; email: string }>,
  account: null as AccountRecord | null,
  recoveryCode: null as string | null,
  register: vi.fn(),
  unlock: vi.fn(),
  recover: vi.fn(),
  clearRecoveryCode: vi.fn(),
}))

const ambiente = vi.hoisted(() => ({ temServicoRemoto: false, homologacao: false }))

vi.mock('../auth/supabase', () => ({
  get hasSupabaseConfiguration() { return ambiente.temServicoRemoto },
  onPasswordRecovery: () => () => undefined,
}))

vi.mock('../sync/config', () => ({
  get isHomologationEnvironment() { return ambiente.homologacao },
}))

vi.mock('../auth/AuthVaultContext', () => ({
  useAuthVault: () => ({ accounts: authState.contas,
    account: authState.account,
    recoveryCode: authState.recoveryCode,
    register: authState.register,
    unlock: authState.unlock,
    recover: authState.recover,
    clearRecoveryCode: authState.clearRecoveryCode,
  }),
}))

describe('tela de acesso', () => {
  afterEach(cleanup)

  beforeEach(() => {
    authState.contas = []
    authState.account = null
    authState.recoveryCode = null
    ambiente.temServicoRemoto = false
    ambiente.homologacao = false
    vi.clearAllMocks()
  })

  it('mostra a apresentação e envia o formulário de criação de conta', async () => {
    const user = userEvent.setup()
    render(<AuthPage />)

    expect(screen.getByRole('heading', { name: /seu ministério organizado\.\s*seus dados, só seus\./i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Crie sua conta' })).toBeInTheDocument()
    expect(screen.getByLabelText('E-mail')).toHaveAttribute('type', 'email')
    expect(screen.getByLabelText(/Senha/)).toHaveAttribute('type', 'password')
    expect(screen.getByText('Mínimo de 12 caracteres')).toBeInTheDocument()
    expect(screen.queryByText(/criptografia|cofre|chave mestra|AES|servidor|sincronização|IndexedDB|ambiente de desenvolvimento/i)).not.toBeInTheDocument()
    await user.type(screen.getByLabelText('E-mail'), 'conta-criacao@exemplo.test')
    await user.type(screen.getByLabelText(/Senha/), 'Senha-Ficticia-2026')
    await user.click(screen.getByRole('button', { name: 'Criar conta' }))

    expect(authState.register).toHaveBeenCalledWith('conta-criacao@exemplo.test', 'Senha-Ficticia-2026')
  })

  it('alterna por teclado entre as abas e envia o formulário de entrada', async () => {
    const user = userEvent.setup()
    authState.account = {
      id: 'conta-entrada-ficticia',
      email: 'conta-entrada@exemplo.test',
      createdAt: '2026-08-23T00:00:00.000Z',
      authMode: 'local-development',
    }
    render(<AuthPage />)

    const enterTab = screen.getByRole('tab', { name: 'Entrar' })
    enterTab.focus()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('heading', { name: 'Crie sua conta' })).toBeInTheDocument()
    await user.keyboard('{ArrowLeft}')

    expect(screen.getByRole('heading', { name: 'Entre na sua conta' })).toBeInTheDocument()
    expect(screen.getByLabelText('E-mail')).toHaveAttribute('type', 'email')
    expect(screen.getByLabelText(/Senha/)).toHaveAttribute('type', 'password')
    expect(screen.getByRole('tab', { name: 'Entrar' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Entrar' })).toHaveFocus()

    await user.type(screen.getByLabelText(/Senha/), 'Senha-Ficticia-2026')
    await user.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(authState.unlock).toHaveBeenCalledWith('conta-entrada@exemplo.test', 'Senha-Ficticia-2026')
  })

  it('oferece recuperação de acesso somente quando já existe uma conta', async () => {
    const user = userEvent.setup()
    authState.account = {
      id: 'conta-ficticia',
      email: 'conta-ficticia@exemplo.test',
      createdAt: '2026-08-23T00:00:00.000Z',
      authMode: 'local-development',
    }
    render(<AuthPage />)

    expect(screen.getByRole('button', { name: 'Usar chave de recuperação' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Usar chave de recuperação' }))

    expect(screen.getByRole('heading', { name: 'Recupere o acesso' })).toBeInTheDocument()
    expect(screen.getByLabelText('Chave de recuperação')).toBeRequired()
    expect(screen.getByLabelText(/Senha da conta/)).toHaveAttribute('type', 'password')
    expect(screen.getByRole('button', { name: 'Recuperar acesso' })).toBeInTheDocument()
    expect(screen.queryByRole('tablist', { name: 'Acesso' })).not.toBeInTheDocument()
  })

  it('não oferece recuperação sem conta local e sem serviço remoto', () => {
    render(<AuthPage />)
    expect(screen.queryByRole('button', { name: 'Usar chave de recuperação' })).not.toBeInTheDocument()
  })

  // Num aparelho recém-autorizado não existe conta local: é justamente esse o
  // caso em que a entrada de recuperação precisa aparecer, porque a senha
  // sozinha não abre o cofre e a chave de recuperação é o único caminho.
  it('oferece recuperação num dispositivo novo quando há serviço remoto', async () => {
    const user = userEvent.setup()
    ambiente.temServicoRemoto = true
    render(<AuthPage />)

    const entrada = screen.getByRole('button', { name: 'Usar chave de recuperação' })
    expect(entrada).toBeInTheDocument()
    await user.click(entrada)

    expect(screen.getByRole('heading', { name: 'Recupere o acesso' })).toBeInTheDocument()
    expect(screen.getByLabelText('Chave de recuperação')).toBeRequired()
  })

  it('a instalação de homologação se declara antes do login, não depois', async () => {
    // Descobrir que a base é de teste só depois de entrar é tarde: a essa
    // altura já dá para ter digitado um nome real numa base descartável.
    ambiente.homologacao = true
    render(<AuthPage />)

    const aviso = await screen.findByText(/Homologação — instalação de teste/i)
    expect(aviso).toBeInTheDocument()
    expect(aviso.textContent).toMatch(/dados fictícios/i)
  })

  it('a instalação de produção não mostra aviso de teste nenhum', () => {
    render(<AuthPage />)

    expect(screen.queryByText(/Homologação/i)).not.toBeInTheDocument()
  })

  it('não oferece trocar de conta quando só existe uma neste aparelho', () => {
    // Com uma conta só, a lista era de um item e ocupava a metade de cima da
    // tela para oferecer uma escolha que não existe — o e-mail já vem
    // preenchido no campo abaixo.
    authState.contas = [{ id: 'conta-1', email: 'conta.unica@exemplo.test' }]
    render(<AuthPage />)

    expect(screen.queryByText('Contas neste aparelho')).not.toBeInTheDocument()
  })

  it('oferece trocar de conta quando há mais de uma', () => {
    authState.contas = [
      { id: 'conta-1', email: 'primeira@exemplo.test' },
      { id: 'conta-2', email: 'segunda@exemplo.test' },
    ]
    render(<AuthPage />)

    expect(screen.getByText('Contas neste aparelho')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'segunda@exemplo.test' })).toBeInTheDocument()
  })
})
