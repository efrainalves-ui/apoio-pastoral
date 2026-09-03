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

  it('recusa a conexão quando a instalação não declara projeto nenhum', async () => {
    // Antes, a declaração ausente simplesmente pulava a conferência: bastava
    // esquecer a variável para uma build falar com qualquer projeto.
    const { remoteProjectProblem } = await import('../sync/config')

    expect(remoteProjectProblem({ url: 'https://homolog-fake.supabase.co', anonKey: undefined, declaredRef: undefined }))
      .toMatch(/não declara com qual projeto/u)
    expect(remoteProjectProblem({ url: 'https://homolog-fake.supabase.co', anonKey: undefined, declaredRef: '   ' }))
      .toMatch(/não declara com qual projeto/u)
  })
})

describe('o serviço precisa declarar o próprio ambiente', () => {
  async function carregarServico(appEnv: string, ambienteDoBanco: string | null) {
    vi.resetModules()
    vi.stubEnv('VITE_APP_ENV', appEnv)
    vi.stubEnv('VITE_SUPABASE_URL', 'https://homolog-fake.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'chave-publica-ficticia')
    vi.stubEnv('VITE_SUPABASE_PROJECT_REF', 'homolog-fake')
    const rpc = vi.fn((nome: string) => Promise.resolve({
      data: nome === 'app_schema_version' ? 5 : ambienteDoBanco,
      error: null,
    }))
    vi.doMock('@supabase/supabase-js', () => ({ createClient: () => ({ rpc, auth: {} }) }))
    return { rpc, supabase: await import('./supabase') }
  }

  afterEach(() => { vi.doUnmock('@supabase/supabase-js') })

  it('sincroniza quando aplicativo e banco declaram o mesmo ambiente', async () => {
    const { supabase } = await carregarServico('homologacao', 'homologacao')

    await expect(supabase.assertServiceSchema()).resolves.toBeUndefined()
  })

  it('recusa a build de produção apontada para o banco de homologação', async () => {
    const { supabase } = await carregarServico('producao', 'homologacao')

    await expect(supabase.assertServiceSchema()).rejects.toThrow(/ambientes diferentes/u)
  })

  it('recusa um banco que não declara ambiente nenhum', async () => {
    const { supabase } = await carregarServico('homologacao', null)

    await expect(supabase.assertServiceSchema()).rejects.toThrow(/não declara/u)
  })

  it('confere a identidade do serviço antes de mandar e-mail e senha', async () => {
    // O buraco: a conferência acontecia depois de autenticar. Uma build
    // apontada para o projeto errado entregava a credencial do titular a um
    // serviço que não era o dele e só então reclamava.
    const ordem: string[] = []
    vi.resetModules()
    vi.stubEnv('VITE_APP_ENV', 'producao')
    vi.stubEnv('VITE_SUPABASE_URL', 'https://homolog-fake.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'chave-publica-ficticia')
    vi.stubEnv('VITE_SUPABASE_PROJECT_REF', 'homolog-fake')
    vi.doMock('@supabase/supabase-js', () => ({
      createClient: () => ({
        rpc: (nome: string) => { ordem.push(`rpc:${nome}`); return Promise.resolve({ data: nome === 'app_schema_version' ? 5 : 'homologacao', error: null }) },
        auth: {
          signInWithPassword: () => { ordem.push('senha-enviada'); return Promise.resolve({ data: { user: { id: 'x' } }, error: null }) },
          signUp: () => { ordem.push('senha-enviada'); return Promise.resolve({ data: { user: { id: 'x' }, session: {} }, error: null }) },
        },
      }),
    }))
    const supabase = await import('./supabase')

    await expect(supabase.signInRemoteAccount('conta.ficticia@example.invalid', 'senha-ficticia-2026'))
      .rejects.toThrow(/ambientes diferentes/u)
    await expect(supabase.registerRemoteAccount('conta.ficticia@example.invalid', 'senha-ficticia-2026'))
      .rejects.toThrow(/ambientes diferentes/u)

    expect(ordem).not.toContain('senha-enviada')
    expect(ordem[0]).toBe('rpc:app_schema_version')
  })
})
