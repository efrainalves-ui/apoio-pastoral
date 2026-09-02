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
