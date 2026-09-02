export const isSyncDisabled = import.meta.env.MODE !== 'test' && import.meta.env.VITE_DISABLE_SYNC === 'true'

/**
 * O ambiente é declarado de propósito, e só dois valores abrem conexão remota:
 * `homologacao`, com dados fictícios, e `producao`, com o distrito real. Sem a
 * marca — ou com qualquer outro valor — o aplicativo se recusa a falar com um
 * serviço remoto, para ninguém apontar produção por engano nem o contrário.
 */
const ambienteDeclarado = import.meta.env.VITE_APP_ENV as string | undefined
export const isHomologationEnvironment = ambienteDeclarado === 'homologacao'
export const isProductionEnvironment = ambienteDeclarado === 'producao'
export const isRemoteEnvironmentAllowed = isHomologationEnvironment || isProductionEnvironment
export const declaredEnvironment = isHomologationEnvironment ? 'homologacao' : isProductionEnvironment ? 'producao' : 'local'

/**
 * Só os testes automatizados internos veem atalhos de dados fictícios. Nem o
 * desenvolvimento nem a versão de uso real mostram esse caminho.
 */
export const isAutomatedTest = import.meta.env.VITE_E2E === 'true'

/**
 * Identificação do projeto remoto, para homologação e produção nunca se
 * misturarem.
 *
 * A build declara em qual projeto ela fala. Se a URL apontar para um projeto e
 * a declaração para outro — ou se a chave pública tiver sido gerada em um
 * terceiro — a conexão não abre. É a diferença entre um teste com dados
 * fictícios e um distrito real.
 */
export function projectRefFromUrl(url: string | undefined): string | null {
  if (!url) return null
  const encontrado = /^https:\/\/([a-z0-9-]+)\.supabase\.(co|in)$/iu.exec(url.trim().replace(/\/$/u, ''))
  return encontrado?.[1]?.toLowerCase() ?? null
}

/** Projeto declarado na chave pública do Supabase, quando ela é um JWT. */
export function projectRefFromKey(anonKey: string | undefined): string | null {
  if (!anonKey) return null
  const partes = anonKey.split('.')
  if (partes.length !== 3 || !partes[1]) return null
  try {
    const normalizado = partes[1].replace(/-/gu, '+').replace(/_/gu, '/')
    const conteudo = JSON.parse(atob(normalizado.padEnd(Math.ceil(normalizado.length / 4) * 4, '='))) as { ref?: unknown }
    return typeof conteudo.ref === 'string' ? conteudo.ref.toLowerCase() : null
  } catch {
    return null
  }
}

export interface RemoteProjectCheck {
  url: string | undefined
  anonKey: string | undefined
  declaredRef: string | undefined
}

/** Devolve a explicação do problema, ou `null` quando tudo combina. */
export function remoteProjectProblem({ url, anonKey, declaredRef }: RemoteProjectCheck): string | null {
  const daUrl = projectRefFromUrl(url)
  if (!daUrl) return 'O endereço do serviço não tem o formato esperado. Confira a configuração desta instalação.'
  const declarado = declaredRef?.trim().toLowerCase()
  if (declarado && declarado !== daUrl) {
    return 'Esta instalação está apontada para um serviço diferente do declarado. Nenhuma conexão foi aberta.'
  }
  const daChave = projectRefFromKey(anonKey)
  if (daChave && daChave !== daUrl) {
    return 'A chave pública desta instalação pertence a outro serviço. Nenhuma conexão foi aberta.'
  }
  return null
}

export const declaredProjectRef = import.meta.env.VITE_SUPABASE_PROJECT_REF as string | undefined

/** Versão do esquema do serviço que esta versão do aplicativo espera. */
export const EXPECTED_SCHEMA_VERSION = 3
