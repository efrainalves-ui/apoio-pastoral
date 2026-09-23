import { afterEach, describe, expect, it, vi } from 'vitest'

/*
  Aplicativo novo contra banco que ainda não recebeu a migration 0013.

  A build nova oferecia "Ativar notificações", pedia a permissão ao navegador e
  só falhava na hora de gravar a inscrição — sem dizer por quê. Agora ela
  pergunta antes, e a ausência da própria função de conferência é a resposta.

  A distinção que importa: **função que não existe** é uma resposta e fica
  lembrada; **rede caída** não é resposta nenhuma e não pode desligar as
  notificações pelo resto do dia.
*/

interface Resposta { data?: unknown; error?: { code?: string; message?: string } | null }

async function carregarCom(respostas: Resposta[]) {
  const chamadas: string[] = []
  vi.resetModules()
  vi.doMock('../auth/supabase', () => ({
    hasSupabaseConfiguration: true,
    currentRemoteAccountId: vi.fn().mockResolvedValue('dono-ficticio'),
    getSupabaseClient: () => ({
      rpc: (nome: string) => {
        chamadas.push(nome)
        return Promise.resolve(respostas[chamadas.length - 1] ?? respostas[respostas.length - 1] ?? { data: null, error: null })
      },
    }),
  }))
  vi.doMock('../auth/device', () => ({ currentDeviceId: () => 'aparelho-ficticio' }))
  const modulo = await import('./push')
  modulo.esquecerCapacidadeDoBanco()
  return { modulo, chamadas }
}

afterEach(() => {
  vi.doUnmock('../auth/supabase')
  vi.doUnmock('../auth/device')
  vi.restoreAllMocks()
})

describe('o aplicativo novo pergunta ao banco antes de oferecer notificações', () => {
  it('banco com a 0013: o recurso existe', async () => {
    const { modulo, chamadas } = await carregarCom([{ data: true, error: null }])

    expect(await modulo.notificacoesDisponiveisNoBanco()).toBe(true)
    expect(chamadas).toEqual(['lembretes_push_disponivel'])
  })

  it('banco sem a 0013: a função não existe, e isso é resposta — não pergunta de novo', async () => {
    const { modulo, chamadas } = await carregarCom([{ data: null, error: { code: 'PGRST202', message: 'function not found' } }])

    expect(await modulo.notificacoesDisponiveisNoBanco()).toBe(false)
    expect(await modulo.notificacoesDisponiveisNoBanco()).toBe(false)
    expect(chamadas).toHaveLength(1)
  })

  it('rede caída não é resposta: pergunta de novo na próxima vez', async () => {
    const { modulo, chamadas } = await carregarCom([
      { data: null, error: { message: 'Failed to fetch' } },
      { data: true, error: null },
    ])

    expect(await modulo.notificacoesDisponiveisNoBanco()).toBe(false)
    expect(await modulo.notificacoesDisponiveisNoBanco()).toBe(true)
    expect(chamadas).toHaveLength(2)
  })

  it('banco sem a 0013: o painel diz indisponível em vez de pedir a permissão', async () => {
    const { modulo } = await carregarCom([{ data: null, error: { code: 'PGRST202' } }])
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { getRegistration: vi.fn() } })
    Object.defineProperty(window, 'PushManager', { configurable: true, value: function PushManager() {} })
    const pedirPermissao = vi.fn()
    Object.defineProperty(window, 'Notification', { configurable: true, value: { permission: 'default', requestPermission: pedirPermissao } })
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: false }) })
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (X11; Linux x86_64) Chrome/126')

    expect(await modulo.estadoDasNotificacoes('conta-ficticia')).toBe('indisponivel')
    expect(await modulo.ativarNotificacoes('conta-ficticia')).toBe('indisponivel')
    expect(pedirPermissao).not.toHaveBeenCalled()
  })

  it('banco sem a 0013: o agendamento não tenta gravar horário nenhum', async () => {
    const { modulo, chamadas } = await carregarCom([{ data: null, error: { code: 'PGRST202' } }])
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
    localStorage.setItem('apoio-pastoral:push-ativo:conta-ficticia', '1')

    const resultado = await modulo.sincronizarAgendamentos('conta-ficticia', await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt']), [])

    expect(resultado).toEqual({ criados: 0, removidos: 0, falha: null, tentarDeNovo: false })
    expect(chamadas).toEqual(['lembretes_push_disponivel'])
    localStorage.removeItem('apoio-pastoral:push-ativo:conta-ficticia')
  })
})
