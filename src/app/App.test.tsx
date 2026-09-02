import { cleanup, render, renderHook, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App, useDistrictPresence } from './App'

const auth = vi.hoisted(() => ({
  account: null as { id: string; email: string } | null,

  accounts: [],
  masterKey: null as CryptoKey | null,
  syncKey: null as CryptoKey | null,
  initialized: true,
  recoveryCode: null,
  register: vi.fn(),
  unlock: vi.fn(),
  recover: vi.fn(),
  clearRecoveryCode: vi.fn(),
}))

const nuvem = vi.hoisted(() => ({
  distritoLocal: null as { id: string } | null,
  distritoNaNuvem: null as { id: string } | null,
  transporte: 'disabled',
  sincronizacoes: 0,
  falhaAoSincronizar: false,
  primeiraSincronizacaoPendente: false,
}))

vi.mock('../auth/AuthVaultContext', () => ({ useAuthVault: () => auth }))

vi.mock('../auth/device', () => ({ currentDeviceId: () => 'dispositivo-ficticio' }))

vi.mock('../district/service', () => ({
  DistrictService: class {
    getDistrict() { return Promise.resolve(nuvem.distritoLocal) }
  },
}))

vi.mock('../sync/transport', () => ({
  createSyncTransport: () => ({ name: nuvem.transporte }),
}))

vi.mock('../sync/service', () => ({
  firstSyncPending: () => Promise.resolve(nuvem.primeiraSincronizacaoPendente),
  SyncService: class {
    synchronize() {
      nuvem.sincronizacoes += 1
      if (nuvem.falhaAoSincronizar) return Promise.reject(new Error('sem rede'))
      // Receber do serviço é o que preenche o cofre local do aparelho novo.
      nuvem.distritoLocal = nuvem.distritoNaNuvem
      return Promise.resolve({ status: 'synced', pushed: 0, pulled: 1, conflicts: 0 })
    }
  },
}))

afterEach(cleanup)

beforeEach(() => {
  auth.account = null
  auth.masterKey = null
  auth.syncKey = null
  nuvem.distritoLocal = null
  nuvem.falhaAoSincronizar = false
  nuvem.primeiraSincronizacaoPendente = false
  nuvem.distritoNaNuvem = null
  nuvem.transporte = 'disabled'
  nuvem.sincronizacoes = 0
})

describe('shell do aplicativo', () => {
  it('mostra a entrada segura quando não existe sessão desbloqueada', async () => {
    render(<MemoryRouter initialEntries={['/acesso']}><App /></MemoryRouter>)
    expect(await screen.findByRole('heading', { name: /crie sua conta/i })).toBeInTheDocument()
    expect(screen.getByText(/seus dados, só seus/i)).toBeInTheDocument()
  })

  it('protege uma rota interna enquanto não existe sessão desbloqueada', async () => {
    render(<MemoryRouter initialEntries={['/app/distrito']}><App /></MemoryRouter>)
    expect(await screen.findByRole('heading', { name: /crie sua conta/i })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /visão do distrito/i })).not.toBeInTheDocument()
  })

  it('recebe o distrito da conta antes de mandar um aparelho novo criar outro', async () => {
    auth.account = { id: 'conta-ficticia', email: 'conta.ficticia@example.invalid' }
    auth.masterKey = {} as CryptoKey
    auth.syncKey = {} as CryptoKey
    nuvem.transporte = 'supabase'
    nuvem.distritoNaNuvem = { id: 'distrito-ficticio' }

    const { result } = renderHook(() => useDistrictPresence())

    // Sem esta primeira sincronização o aparelho cairia na configuração
    // inicial e criaria um distrito duplicado na mesma conta.
    await waitFor(() => expect(result.current).toBe(true))
    expect(nuvem.sincronizacoes).toBe(1)
  })

  it('mantém a configuração inicial quando a conta realmente não tem distrito', async () => {
    auth.account = { id: 'conta-ficticia', email: 'conta.ficticia@example.invalid' }
    auth.masterKey = {} as CryptoKey
    auth.syncKey = {} as CryptoKey
    nuvem.transporte = 'supabase'
    nuvem.distritoNaNuvem = null

    const { result } = renderHook(() => useDistrictPresence())

    await waitFor(() => expect(result.current).toBe(false))
    expect(nuvem.sincronizacoes).toBe(1)
  })

  it('não manda criar distrito quando a primeira sincronização falhou', async () => {
    // Falha de rede em um aparelho que nunca recebeu nada não é conta vazia.
    // Tratar como vazia levaria o pastor a criar um segundo distrito.
    auth.account = { id: 'conta-ficticia', email: 'conta.ficticia@example.invalid' }
    auth.masterKey = {} as CryptoKey
    auth.syncKey = {} as CryptoKey
    nuvem.transporte = 'supabase'
    nuvem.falhaAoSincronizar = true
    nuvem.primeiraSincronizacaoPendente = true

    const { result } = renderHook(() => useDistrictPresence())

    await waitFor(() => expect(result.current).toBe('indisponivel'))
  })

  it('segue para a configuração inicial quando a conta já sincronizou antes e está vazia', async () => {
    auth.account = { id: 'conta-ficticia', email: 'conta.ficticia@example.invalid' }
    auth.masterKey = {} as CryptoKey
    auth.syncKey = {} as CryptoKey
    nuvem.transporte = 'supabase'
    nuvem.falhaAoSincronizar = true
    nuvem.primeiraSincronizacaoPendente = false

    const { result } = renderHook(() => useDistrictPresence())

    await waitFor(() => expect(result.current).toBe(false))
  })

  it('não procura o serviço quando a sincronização está desativada', async () => {
    auth.account = { id: 'conta-ficticia', email: 'conta.ficticia@example.invalid' }
    auth.masterKey = {} as CryptoKey
    nuvem.transporte = 'disabled'

    const { result } = renderHook(() => useDistrictPresence())

    await waitFor(() => expect(result.current).toBe(false))
    expect(nuvem.sincronizacoes).toBe(0)
  })
})
