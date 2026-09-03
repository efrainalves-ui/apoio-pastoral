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
/**
 * O único valor que autoriza o modo local.
 *
 * Antes, modo local era o que sobrava: qualquer declaração ausente, vazia ou
 * escrita errado caía nele em silêncio. Uma build de homologação com a variável
 * do endereço esquecida subia, abria, deixava cadastrar e guardava tudo só no
 * aparelho, sem nada na tela dizendo que não havia serviço nenhum do outro
 * lado. Esquecer uma variável não pode ser o mesmo que escolher trabalhar
 * offline: agora essa escolha é escrita.
 */
export const isDevelopmentEnvironment = ambienteDeclarado === 'desenvolvimento'
export const isRemoteEnvironmentAllowed = isHomologationEnvironment || isProductionEnvironment
export const declaredEnvironment = isHomologationEnvironment
  ? 'homologacao'
  : isProductionEnvironment
    ? 'producao'
    : isDevelopmentEnvironment ? 'desenvolvimento' : 'indefinido'

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
  // Antes, a declaração ausente simplesmente pulava a conferência: bastava
  // esquecer a variável para uma build falar com qualquer projeto. Declarar o
  // projeto passou a ser obrigatório para abrir conexão remota.
  if (!declarado) {
    return 'Esta instalação não declara com qual projeto ela fala. Defina VITE_SUPABASE_PROJECT_REF antes de conectar.'
  }
  if (declarado !== daUrl) {
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
export const EXPECTED_SCHEMA_VERSION = 9

export interface EnvironmentConfigurationCheck {
  /** Valor de `VITE_APP_ENV`. */
  declared: string | undefined
  url: string | undefined
  anonKey: string | undefined
  declaredRef: string | undefined
  /** Valor de `VITE_DISABLE_SYNC`. */
  disableSync: string | undefined
}

/**
 * A configuração desta build está coerente? Devolve a explicação do problema,
 * ou `null` quando não há nenhum.
 *
 * Homologação e produção falham fechado: sem endereço, sem chave pública, sem
 * projeto declarado, com os três discordando, ou com a sincronização desligada,
 * a build não abre. Nenhuma dessas situações pode virar "funciona local", que
 * é a falha silenciosa que este aplicativo não pode ter — o pastor cadastraria
 * o distrito inteiro achando que está sincronizando.
 *
 * Fora desses dois ambientes, só `desenvolvimento` abre, e abre local. Qualquer
 * outro valor, ou nenhum, é uma build sem ambiente declarado, e ela também não
 * abre.
 */
export function environmentConfigurationProblem(check: EnvironmentConfigurationCheck): string | null {
  const declarado = check.declared?.trim().toLowerCase()

  if (declarado === 'homologacao' || declarado === 'producao') {
    if (check.disableSync === 'true') {
      return `Esta build declara o ambiente ${declarado} e ao mesmo tempo desliga a sincronização. Escolha um dos dois: remova VITE_DISABLE_SYNC ou declare VITE_APP_ENV=desenvolvimento.`
    }
    if (!check.url?.trim()) {
      return `Esta build declara o ambiente ${declarado} e não informa o endereço do serviço. Defina VITE_SUPABASE_URL.`
    }
    if (!check.anonKey?.trim()) {
      return `Esta build declara o ambiente ${declarado} e não informa a chave pública do serviço. Defina VITE_SUPABASE_ANON_KEY.`
    }
    return remoteProjectProblem({ url: check.url, anonKey: check.anonKey, declaredRef: check.declaredRef })
  }

  if (declarado === 'desenvolvimento') return null

  return 'Esta build não declara em que ambiente ela roda. Defina VITE_APP_ENV como homologacao, producao ou desenvolvimento; modo local só existe quando declarado como desenvolvimento.'
}

/**
 * A conferência aplicada a esta build. Os testes automatizados internos ficam
 * de fora: eles rodam sem ambiente declarado de propósito, com transporte de
 * memória e dados fictícios.
 */
export function currentEnvironmentProblem(): string | null {
  if (import.meta.env.MODE === 'test') return null
  return environmentConfigurationProblem({
    declared: ambienteDeclarado,
    url: import.meta.env.VITE_SUPABASE_URL as string | undefined,
    anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined,
    declaredRef: declaredProjectRef,
    disableSync: import.meta.env.VITE_DISABLE_SYNC as string | undefined,
  })
}
