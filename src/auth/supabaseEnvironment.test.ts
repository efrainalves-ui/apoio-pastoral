import { afterEach, describe, expect, it, vi } from 'vitest'

async function carregarComAmbiente(appEnv: string | undefined) {
  vi.resetModules()
  if (appEnv === undefined) vi.stubEnv('VITE_APP_ENV', '')
  else vi.stubEnv('VITE_APP_ENV', appEnv)
  return import('./supabase')
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('trava de ambiente da conexão remota', () => {
  it('recusa a conexão quando o ambiente não é declarado', async () => {
    const { assertRemoteEnvironment, currentEnvironment } = await carregarComAmbiente(undefined)

    expect(() => { assertRemoteEnvironment() }).toThrowError(/ambiente declarado/u)
    expect(currentEnvironment()).toBe('local')
  })

  // Um valor parecido não vale: só os dois nomes exatos abrem conexão.
  it('recusa a conexão com um nome de ambiente diferente', async () => {
    const { assertRemoteEnvironment } = await carregarComAmbiente('production')

    expect(() => { assertRemoteEnvironment() }).toThrowError(/ambiente declarado/u)
  })

  it('permite a conexão em homologação e em produção declaradas', async () => {
    const homologacao = await carregarComAmbiente('homologacao')
    expect(() => { homologacao.assertRemoteEnvironment() }).not.toThrow()
    expect(homologacao.currentEnvironment()).toBe('homologacao')

    const producao = await carregarComAmbiente('producao')
    expect(() => { producao.assertRemoteEnvironment() }).not.toThrow()
    expect(producao.currentEnvironment()).toBe('producao')
  })

  it('não abre cliente remoto sem URL e chave, mesmo em homologação', async () => {
    const { getSupabaseClient } = await carregarComAmbiente('homologacao')

    expect(() => getSupabaseClient()).toThrowError(/ainda não foi configurado/u)
  })
})
