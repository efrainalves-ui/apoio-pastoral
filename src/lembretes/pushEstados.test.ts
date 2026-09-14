import { afterEach, describe, expect, it, vi } from 'vitest'

/*
  Os estados do painel de notificações antes de qualquer pedido ao navegador:
  iPhone fora da Tela de Início, navegador sem push, instalação sem chave e
  permissão negada. Cada caso carrega o módulo de novo, com o ambiente dele.
*/

type Ambiente = { userAgent?: string; standalone?: boolean; push?: boolean; permissao?: NotificationPermission; vapid?: string }

async function diagnosticoCom({ userAgent = 'Mozilla/5.0 (X11; Linux x86_64) Chrome/126', standalone = false, push = true, permissao = 'default', vapid = 'BFicticiaChavePublicaDeTeste' }: Ambiente) {
  vi.resetModules()
  vi.stubEnv('VITE_VAPID_PUBLIC_KEY', vapid)
  vi.doMock('../auth/supabase', () => ({ hasSupabaseConfiguration: true, currentRemoteAccountId: vi.fn(), getSupabaseClient: vi.fn() }))
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent)
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: push ? { getRegistration: vi.fn() } : undefined })
  if (!push) Reflect.deleteProperty(navigator, 'serviceWorker')
  if (push) Object.defineProperty(window, 'PushManager', { configurable: true, value: function PushManager() {} })
  else Reflect.deleteProperty(window, 'PushManager')
  Object.defineProperty(window, 'Notification', { configurable: true, value: { permission: permissao, requestPermission: vi.fn() } })
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: standalone }) })
  const { diagnosticar } = await import('./push')
  return diagnosticar()
}

describe('estados das notificações', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); vi.doUnmock('../auth/supabase') })

  it('iPhone pelo Safari, fora da Tela de Início: pede para instalar', async () => {
    expect(await diagnosticoCom({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1' })).toBe('instalar-iphone')
  })

  it('iPhone aberto pela Tela de Início segue para a permissão', async () => {
    expect(await diagnosticoCom({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1', standalone: true })).toBe('pronto')
  })

  it('navegador sem push: incompatível', async () => {
    expect(await diagnosticoCom({ push: false })).toBe('incompativel')
  })

  it('permissão negada antes: não pergunta de novo', async () => {
    expect(await diagnosticoCom({ permissao: 'denied' })).toBe('negada')
  })

  it('instalação sem chave pública: indisponível, sem pedir permissão', async () => {
    expect(await diagnosticoCom({ vapid: '' })).toBe('indisponivel')
  })
})
