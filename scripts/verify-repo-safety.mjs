// Revisão final antes de enviar ao Git: procura, apenas nos arquivos que o Git
// realmente versiona, qualquer segredo, credencial, endereço real ou arquivo
// sensível que não pode sair da máquina do avaliador.
//
// Não faz rede, não lê .env e não imprime o conteúdo suspeito: mostra só o
// arquivo, a linha e o motivo, para que o próprio relatório continue seguro.

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const EXTENSOES_BINARIAS = /\.(png|jpe?g|gif|ico|webp|avif|woff2?|ttf|eot|zip|apb|pdf)$/iu
const ARQUIVOS_SEM_VARREDURA_DE_EMAIL = new Set(['pnpm-lock.yaml'])

const DOMINIOS_FICTICIOS_PERMITIDOS = [
  'example.invalid',
  // Reservado pela RFC 2606 como os demais: não é registrável, não resolve e
  // não entrega mensagem. Passou a ser a convenção da rodada em nuvem porque o
  // Auth do Supabase recusa o TLD .invalid.
  'example.test',
  'exemplo.test',
  'example.com',
  'apoio-pastoral.local',
]

const ARQUIVOS_PROIBIDOS = [
  { padrao: /^\.env(\..+)?$/u, excecao: /^\.env\.example$/u, motivo: 'arquivo de ambiente com valores reais' },
  { padrao: /\.apb$/iu, motivo: 'arquivo de backup do aplicativo' },
  { padrao: /\.(pdf|dump|sqlite|db)$/iu, motivo: 'arquivo de dados ou documento sensível' },
  { padrao: /\.(pem|key|p12|pfx|keystore|jks)$/iu, motivo: 'material criptográfico' },
  { padrao: /(^|\/)(playwright-report|test-results|coverage|dist|dev-dist)\//u, motivo: 'artefato gerado que pode conter dados de teste' },
]

const PADROES_DE_SEGREDO = [
  { padrao: /-----BEGIN [A-Z ]*PRIVATE KEY-----/u, motivo: 'chave privada embutida' },
  { padrao: /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\./u, motivo: 'token JWT embutido' },
  { padrao: /\bsb_secret_[A-Za-z0-9_-]{8,}/u, motivo: 'chave secreta do Supabase' },
  { padrao: /\bsbp_[A-Za-z0-9]{20,}/u, motivo: 'token de acesso do Supabase' },
  { padrao: /https:\/\/[a-z0-9-]{15,}\.supabase\.(co|in)\b/u, motivo: 'URL de projeto Supabase real' },
  // O primeiro caractere não pode ser "<": marcadores como <cole-aqui> na
  // documentação são instruções para o avaliador, não valores.
  { padrao: /\bVITE_SUPABASE_(URL|ANON_KEY)\s*[:=]\s*["']?[^\s"'#<][^\s"'#]*/u, motivo: 'variável do Supabase preenchida' },
  { padrao: /\bSUPABASE_SERVICE_ROLE_KEY\s*[:=]\s*["']?[^\s"'#<][^\s"'#]*/u, motivo: 'chave service_role preenchida' },
  { padrao: /\b(ghp|gho|ghu|ghs)_[A-Za-z0-9]{30,}/u, motivo: 'token do GitHub' },
]

const ENTRADAS_OBRIGATORIAS_NO_GITIGNORE = [
  'node_modules/', 'dist/', 'dev-dist/', 'coverage/',
  'playwright-report/', 'test-results/',
  '.env', '.env.*', '!.env.example',
  '*.apb', '*.pem', '*.key',
]

const problemas = []
function reprovar(arquivo, linha, motivo) {
  problemas.push(linha ? `${arquivo}:${linha} — ${motivo}` : `${arquivo} — ${motivo}`)
}

const versionados = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\u0000')
  .filter(Boolean)

// 1. Arquivos que nunca podem estar versionados.
for (const arquivo of versionados) {
  for (const { padrao, excecao, motivo } of ARQUIVOS_PROIBIDOS) {
    if (padrao.test(arquivo) && !excecao?.test(arquivo)) reprovar(arquivo, null, motivo)
  }
}

// 2. Conteúdo dos arquivos de texto.
for (const arquivo of versionados) {
  if (EXTENSOES_BINARIAS.test(arquivo)) continue

  let conteudo
  try {
    conteudo = readFileSync(arquivo, 'utf8')
  } catch {
    continue
  }
  if (conteudo.includes('\u0000')) continue

  const emailGlobal = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/gu

  conteudo.split('\n').forEach((texto, indice) => {
    const numero = indice + 1

    for (const { padrao, motivo } of PADROES_DE_SEGREDO) {
      if (padrao.test(texto)) reprovar(arquivo, numero, motivo)
    }

    if (ARQUIVOS_SEM_VARREDURA_DE_EMAIL.has(arquivo)) return
    for (const encontrado of texto.match(emailGlobal) ?? []) {
      const ficticio = DOMINIOS_FICTICIOS_PERMITIDOS.some((dominio) => encontrado.endsWith(`@${dominio}`) || encontrado.endsWith(`.${dominio}`))
      const daFerramenta = encontrado.endsWith('@anthropic.com')
      if (!ficticio && !daFerramenta) reprovar(arquivo, numero, 'endereço de e-mail fora dos domínios fictícios permitidos')
    }
  })
}

// 3. O .env.example só pode anunciar nomes, nunca valores.
readFileSync('.env.example', 'utf8').split('\n').forEach((texto, indice) => {
  const limpo = texto.trim()
  if (!limpo || limpo.startsWith('#')) return
  const [, valor = ''] = limpo.split(/=(.*)/su)
  if (valor.trim() !== '') reprovar('.env.example', indice + 1, 'variável com valor preenchido')
})

// 4. O .gitignore precisa cobrir tudo que não pode escapar.
const gitignore = readFileSync('.gitignore', 'utf8').split('\n').map((linha) => linha.trim())
for (const entrada of ENTRADAS_OBRIGATORIAS_NO_GITIGNORE) {
  if (!gitignore.includes(entrada)) reprovar('.gitignore', null, `falta a entrada obrigatória "${entrada}"`)
}

if (problemas.length > 0) {
  console.error('Revisão de segurança do repositório REPROVADA:\n')
  for (const problema of problemas) console.error(`  - ${problema}`)
  console.error(`\n${problemas.length} problema(s). Nada deve ser enviado ao Git assim.`)
  process.exit(1)
}

console.log(`Revisão de segurança aprovada: ${versionados.length} arquivos versionados, nenhum segredo, credencial, endereço real ou arquivo sensível.`)
