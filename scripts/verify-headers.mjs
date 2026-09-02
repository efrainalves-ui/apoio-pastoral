// Confere que os cabeçalhos de segurança continuam versionados e completos.
//
// Sem esta checagem, uma edição distraída em public/_headers publicaria o
// aplicativo sem CSP e ninguém perceberia até alguém procurar.

import { readFileSync } from 'node:fs'

const arquivo = readFileSync(new URL('../public/_headers', import.meta.url), 'utf8')

const exigidos = [
  ['Content-Security-Policy', /content-security-policy:/i],
  ["CSP sem default-src 'self'", /default-src 'self'/],
  ['CSP sem frame-ancestors none', /frame-ancestors 'none'/],
  ["CSP sem object-src none", /object-src 'none'/],
  ["CSP com script inline liberado", /script-src 'self';/],
  ['X-Content-Type-Options', /x-content-type-options: nosniff/i],
  ['Referrer-Policy', /referrer-policy: no-referrer/i],
  ['Permissions-Policy', /permissions-policy:/i],
  ['Strict-Transport-Security', /strict-transport-security: max-age=\d+/i],
  ['X-Frame-Options', /x-frame-options: DENY/i],
  ['service worker sem cache', /\/sw\.js[\s\S]*no-store/],
]

const faltando = exigidos.filter(([, padrao]) => !padrao.test(arquivo)).map(([nome]) => nome)

// Endereço de projeto não entra no repositório, nem dentro de um cabeçalho.
const vazamentos = [/https:\/\/[a-z0-9-]{15,}\.supabase\.co/i, /supabase\.co\/[a-z0-9]/i]
  .filter((padrao) => padrao.test(arquivo))

if (faltando.length || vazamentos.length) {
  if (faltando.length) console.error(`FALHOU: cabeçalhos ausentes ou enfraquecidos: ${faltando.join(', ')}`)
  if (vazamentos.length) console.error('FALHOU: o arquivo de cabeçalhos contém um endereço de projeto.')
  process.exit(1)
}

console.log('Cabeçalhos de segurança versionados e completos.')
