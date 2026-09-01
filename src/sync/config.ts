export const isSyncDisabled = import.meta.env.MODE !== 'test' && import.meta.env.VITE_DISABLE_SYNC === 'true'

// A conexão remota existe apenas para a rodada de homologação com dados
// fictícios. Sem esta marca explícita o aplicativo se recusa a falar com
// qualquer serviço remoto, para que ninguém aponte por engano para produção.
export const isHomologationEnvironment = import.meta.env.VITE_APP_ENV === 'homologacao'
