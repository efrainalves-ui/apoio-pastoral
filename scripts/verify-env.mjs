// Confere a configuração de ambiente antes de publicar.
//
// A auditoria encontrou uma falha silenciosa: uma build que declarava
// homologação e esquecia `VITE_SUPABASE_URL` não parava — caía no transporte
// local e abria normalmente. O pastor cadastraria o distrito inteiro achando
// que estava sincronizando, e descobriria no dia em que trocasse de aparelho.
//
// O aplicativo passou a falhar fechado em tempo de execução. Esta verificação
// é a mesma regra aplicada antes, no processo de publicação, para o erro
// aparecer no CI e não na tela de quem for usar.
//
// Não imprime valor nenhum: só o nome da variável que está faltando ou
// discordando. Endereço, chave e projeto não entram em log.
//
//   node scripts/verify-env.mjs
//
// Lê VITE_APP_ENV, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY,
// VITE_SUPABASE_PROJECT_REF e VITE_DISABLE_SYNC do ambiente de quem executa.

function projetoDaUrl(url) {
  if (!url) return null
  const encontrado = /^https:\/\/([a-z0-9-]+)\.supabase\.(co|in)$/iu.exec(url.trim().replace(/\/$/u, ''))
  return encontrado?.[1]?.toLowerCase() ?? null
}

function projetoDaChave(anonKey) {
  if (!anonKey) return null
  const partes = anonKey.split('.')
  if (partes.length !== 3 || !partes[1]) return null
  try {
    const normalizado = partes[1].replace(/-/gu, '+').replace(/_/gu, '/')
    const conteudo = JSON.parse(Buffer.from(normalizado, 'base64').toString('utf8'))
    return typeof conteudo.ref === 'string' ? conteudo.ref.toLowerCase() : null
  } catch {
    return null
  }
}

const declarado = (process.env.VITE_APP_ENV ?? '').trim().toLowerCase()
const url = process.env.VITE_SUPABASE_URL
const chave = process.env.VITE_SUPABASE_ANON_KEY
const projeto = (process.env.VITE_SUPABASE_PROJECT_REF ?? '').trim().toLowerCase()
const semSync = process.env.VITE_DISABLE_SYNC

const problemas = []

if (declarado === 'homologacao' || declarado === 'producao') {
  if (semSync === 'true') problemas.push(`VITE_APP_ENV=${declarado} com VITE_DISABLE_SYNC=true: escolha um dos dois.`)
  if (!url?.trim()) problemas.push('VITE_SUPABASE_URL ausente.')
  if (!chave?.trim()) problemas.push('VITE_SUPABASE_ANON_KEY ausente.')
  if (!projeto) problemas.push('VITE_SUPABASE_PROJECT_REF ausente: declarar o projeto é obrigatório para abrir conexão remota.')

  const daUrl = projetoDaUrl(url)
  if (url?.trim() && !daUrl) problemas.push('VITE_SUPABASE_URL não tem o formato esperado de um endereço Supabase.')
  if (daUrl && projeto && daUrl !== projeto) problemas.push('VITE_SUPABASE_PROJECT_REF aponta para um projeto diferente de VITE_SUPABASE_URL.')
  const daChave = projetoDaChave(chave)
  if (daChave && daUrl && daChave !== daUrl) problemas.push('VITE_SUPABASE_ANON_KEY foi gerada em um projeto diferente de VITE_SUPABASE_URL.')
} else if (declarado !== 'desenvolvimento') {
  problemas.push('VITE_APP_ENV não declarado. Use homologacao, producao ou desenvolvimento; modo local só existe quando declarado como desenvolvimento.')
}

if (problemas.length) {
  console.error('FALHOU: a configuração de ambiente desta build não permite publicar.')
  for (const problema of problemas) console.error(`  - ${problema}`)
  process.exit(1)
}

console.log(`Configuração de ambiente conferida: VITE_APP_ENV=${declarado}${declarado === 'desenvolvimento' ? ' (modo local declarado)' : ' com URL, chave e projeto coerentes'}.`)
