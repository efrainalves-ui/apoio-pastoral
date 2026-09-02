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

describe('separação entre homologação e produção', () => {
  it('recusa quando o endereço e o projeto declarado são diferentes', async () => {
    const { remoteProjectProblem } = await import('../sync/config')

    expect(remoteProjectProblem({
      url: 'https://homolog-fake.supabase.co',
      anonKey: undefined,
      declaredRef: 'producao-fake',
    })).toMatch(/serviço diferente do declarado/u)
  })

  it('recusa quando a chave pública é de outro projeto', async () => {
    const { remoteProjectProblem } = await import('../sync/config')
    // Chave fictícia: um JWT sem assinatura válida, só para ler o campo `ref`.
    const corpo = btoa(JSON.stringify({ ref: 'producao-fake', role: 'anon' })).replace(/=+$/u, '')

    expect(remoteProjectProblem({
      url: 'https://homolog-fake.supabase.co',
      anonKey: `cabecalho.${corpo}.assinatura`,
      declaredRef: 'homolog-fake',
    })).toMatch(/outro serviço/u)
  })

  it('aceita quando endereço, chave e declaração falam do mesmo projeto', async () => {
    const { remoteProjectProblem } = await import('../sync/config')
    const corpo = btoa(JSON.stringify({ ref: 'homolog-fake', role: 'anon' })).replace(/=+$/u, '')

    expect(remoteProjectProblem({
      url: 'https://homolog-fake.supabase.co',
      anonKey: `cabecalho.${corpo}.assinatura`,
      declaredRef: 'homolog-fake',
    })).toBeNull()
  })

  it('recusa um endereço que não é do serviço', async () => {
    const { remoteProjectProblem } = await import('../sync/config')

    expect(remoteProjectProblem({ url: 'https://exemplo.invalid', anonKey: undefined, declaredRef: undefined }))
      .toMatch(/formato esperado/u)
  })
})
