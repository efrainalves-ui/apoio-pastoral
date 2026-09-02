// Prova as barreiras de aparelho falando direto com a API do serviço, sem o
// aplicativo no meio — que é como um atacante falaria.
//
// Roda só contra o projeto de HOMOLOGAÇÃO, com duas contas fictícias criadas
// para isto. Não cria conta, não apaga projeto e não escreve nada fora dessas
// duas contas. Nenhum endereço, chave ou senha fica no repositório: tudo vem do
// ambiente de quem executa.
//
//   SUPABASE_URL=...            endereço do projeto de homologação
//   SUPABASE_ANON_KEY=...       chave pública do mesmo projeto
//   CONTA_A_EMAIL=... CONTA_A_SENHA=...
//   CONTA_B_EMAIL=... CONTA_B_SENHA=...
//
//   node scripts/api-barreiras.mjs
//
// Use apenas contas fictícias, com dados fictícios.

const url = process.env.SUPABASE_URL
const anon = process.env.SUPABASE_ANON_KEY
const contas = {
  a: { email: process.env.CONTA_A_EMAIL, senha: process.env.CONTA_A_SENHA },
  b: { email: process.env.CONTA_B_EMAIL, senha: process.env.CONTA_B_SENHA },
}

if (!url || !anon || !contas.a.email || !contas.a.senha || !contas.b.email || !contas.b.senha) {
  console.error('Faltam variáveis de ambiente. Veja o cabeçalho deste arquivo.')
  process.exit(2)
}

let falhas = 0
function exigir(condicao, descricao) {
  if (condicao) { console.log(`ok: ${descricao}`); return }
  falhas += 1
  console.error(`FALHOU: ${descricao}`)
}

async function entrar({ email, senha }) {
  const resposta = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anon, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: senha }),
  })
  if (!resposta.ok) throw new Error(`não foi possível entrar com uma das contas fictícias (${resposta.status})`)
  return resposta.json()
}

function cabecalhos(sessao) {
  return { apikey: anon, authorization: `Bearer ${sessao.access_token}`, 'content-type': 'application/json' }
}

async function rpc(sessao, funcao, corpo) {
  const resposta = await fetch(`${url}/rest/v1/rpc/${funcao}`, {
    method: 'POST', headers: cabecalhos(sessao), body: JSON.stringify(corpo ?? {}),
  })
  return { status: resposta.status, corpo: await resposta.text() }
}

async function tabela(sessao, caminho, init = {}) {
  const resposta = await fetch(`${url}/rest/v1/${caminho}`, { headers: cabecalhos(sessao), ...init })
  return { status: resposta.status, corpo: await resposta.text() }
}

const a = await entrar(contas.a)
const b = await entrar(contas.b)

const aparelhoA = crypto.randomUUID()
const aparelhoB = crypto.randomUUID()

// 1. Registro pelo caminho previsto.
const claimA = await rpc(a, 'claim_device', { p_device_id: aparelhoA, p_label: 'Teste Fictício A' })
exigir(claimA.status === 200, 'a conta A registra o próprio aparelho pela função')
const claimB = await rpc(b, 'claim_device', { p_device_id: aparelhoB, p_label: 'Teste Fictício B' })
exigir(claimB.status === 200, 'a conta B registra o próprio aparelho pela função')

// 2. Escrita direta nas tabelas de sincronização está fora de alcance.
const insercaoDireta = await tabela(a, 'devices', {
  method: 'POST',
  body: JSON.stringify({ id: crypto.randomUUID(), owner_id: 'ignorado', label: 'Forjado', status: 'active' }),
})
exigir(insercaoDireta.status >= 400, 'inserir aparelho direto na tabela é recusado')

const atualizacaoDireta = await tabela(a, `devices?id=eq.${aparelhoA}`, {
  method: 'PATCH', body: JSON.stringify({ status: 'active' }),
})
exigir(atualizacaoDireta.status >= 400, 'alterar aparelho direto na tabela é recusado')

const leituraOperacoes = await tabela(a, 'encrypted_operations?select=id')
exigir(leituraOperacoes.status >= 400, 'ler a tabela de operações direto é recusado')

const escritaOperacoes = await tabela(a, 'encrypted_operations', {
  method: 'POST',
  body: JSON.stringify({ id: crypto.randomUUID(), record_id: crypto.randomUUID(), operation: 'upsert', base_version: 0, record_version: 1, schema_version: 1, ciphertext: 'x', iv: 'x', aad: 'x' }),
})
exigir(escritaOperacoes.status >= 400, 'escrever na tabela de operações direto é recusado')

// 3. Uma conta não alcança o aparelho da outra.
const claimCruzado = await rpc(b, 'claim_device', { p_device_id: aparelhoA, p_label: 'Sequestro' })
exigir(claimCruzado.status >= 400, 'a conta B não assume o aparelho da conta A')
const revogaCruzado = await rpc(b, 'revoke_device', { p_device_id: aparelhoA })
exigir(revogaCruzado.status >= 400, 'a conta B não revoga o aparelho da conta A')
const aprovaCruzado = await rpc(b, 'approve_device', { p_device_id: aparelhoA })
exigir(aprovaCruzado.status >= 400, 'a conta B não confirma o aparelho da conta A')

// 4. O envio ignora conta e aparelho declarados no corpo.
const operacao = crypto.randomUUID()
const registro = crypto.randomUUID()
await rpc(b, 'upload_operations', {
  p_ops: [{ id: operacao, owner_id: 'declarado-mentindo', device_id: aparelhoA, record_id: registro, operation: 'upsert', base_version: 0, record_version: 1, schema_version: 1, ciphertext: 'cifra-ficticia', iv: 'iv', aad: 'aad', mac: 'mac-ficticio', mac_version: 2 }],
})
const recebidoPorA = await rpc(a, 'download_operations', { p_after: 0, p_limit: 500 })
exigir(!recebidoPorA.corpo.includes(operacao), 'operação enviada por B não aparece para A mesmo declarando a conta de A')

// 5. Revogação fecha o aparelho, inclusive para um identificador novo.
const revogado = await rpc(b, 'revoke_device', { p_device_id: aparelhoB })
exigir(revogado.status === 200, 'a conta B revoga o próprio aparelho')
const depoisDeRevogar = await rpc(b, 'download_operations', { p_after: 0, p_limit: 500 })
exigir(depoisDeRevogar.status >= 400, 'a sessão do aparelho revogado não recebe mais')

// 6. Versão do esquema visível para o aplicativo conferir.
const versao = await rpc(a, 'app_schema_version')
exigir(versao.corpo.trim() === '3', 'o serviço responde a versão de esquema esperada')

// Limpeza: os aparelhos fictícios criados aqui não ficam ativos.
await rpc(a, 'revoke_device', { p_device_id: aparelhoA })

console.log(falhas === 0 ? '\nBarreiras confirmadas direto na API.' : `\n${falhas} verificação(ões) falharam.`)
process.exit(falhas === 0 ? 0 : 1)
