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
  it('recusa a conexão quando o ambiente não é de homologação', async () => {
    const { assertHomologationEnvironment } = await carregarComAmbiente(undefined)

    expect(() => { assertHomologationEnvironment() }).toThrowError(/homologação/u)
  })

  it('recusa a conexão quando o ambiente é produção', async () => {
    const { assertHomologationEnvironment } = await carregarComAmbiente('production')

    expect(() => { assertHomologationEnvironment() }).toThrowError(/homologação/u)
  })

  it('permite a conexão apenas no ambiente declarado de homologação', async () => {
    const { assertHomologationEnvironment } = await carregarComAmbiente('homologacao')

    expect(() => { assertHomologationEnvironment() }).not.toThrow()
  })

  it('não abre cliente remoto sem URL e chave, mesmo em homologação', async () => {
    const { getSupabaseClient } = await carregarComAmbiente('homologacao')

    expect(() => getSupabaseClient()).toThrowError(/ainda não foi configurado/u)
  })
})
