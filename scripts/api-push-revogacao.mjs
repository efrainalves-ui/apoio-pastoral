// Prova, falando direto com a API, que revogar um aparelho cala as
// notificações dele — que é como um atacante com o token do aparelho revogado
// falaria.
//
// Roda só contra o projeto de HOMOLOGAÇÃO, com duas contas fictícias criadas
// para isto. Não cria conta, não apaga projeto e não escreve nada fora dessas
// duas contas. Nenhum endereço, chave ou senha fica no repositório: tudo vem
// do ambiente de quem executa.
//
//   SUPABASE_URL=...            endereço do projeto de homologação
//   SUPABASE_ANON_KEY=...       chave pública do mesmo projeto
//   CONTA_A_EMAIL=... CONTA_A_SENHA=...
//   CONTA_B_EMAIL=... CONTA_B_SENHA=...
//
//   node scripts/api-push-revogacao.mjs
//
// Use apenas contas fictícias, com endereços de entrega fictícios.

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

const cabecalhos = (sessao) => ({ apikey: anon, authorization: `Bearer ${sessao.access_token}`, 'content-type': 'application/json' })

const rpc = (sessao, funcao, corpo = {}) =>
  fetch(`${url}/rest/v1/rpc/${funcao}`, { method: 'POST', headers: cabecalhos(sessao), body: JSON.stringify(corpo) })

const inscrever = (sessao, dono, aparelho, marca) =>
  fetch(`${url}/rest/v1/push_subscriptions`, {
    method: 'POST',
    headers: { ...cabecalhos(sessao), prefer: 'return=representation' },
    body: JSON.stringify({
      owner_id: dono, device_id: aparelho,
      endpoint: `https://push.example.invalid/ficticio-${marca}`,
      p256dh: marca.repeat(87).slice(0, 87), auth_secret: marca.repeat(22).slice(0, 22),
    }),
  })

async function inscricoes(sessao) {
  const resposta = await fetch(`${url}/rest/v1/push_subscriptions?select=device_id`, { headers: cabecalhos(sessao) })
  return resposta.ok ? resposta.json() : []
}

async function main() {
  // Dois aparelhos da conta A, cada um com a própria sessão, e um da conta B.
  const a1 = await entrar(contas.a)
  const a2 = await entrar(contas.a)
  const b1 = await entrar(contas.b)
  const donoA = a1.user.id
  const donoB = b1.user.id
  const d1 = crypto.randomUUID()
  const d2 = crypto.randomUUID()
  const dB = crypto.randomUUID()

  for (const [sessao, aparelho, nome] of [[a1, d1, 'A1'], [a2, d2, 'A2'], [b1, dB, 'B1']]) {
    const resposta = await rpc(sessao, 'claim_device', { p_device_id: aparelho, p_label: `Aparelho Fictício ${nome}` })
    exigir(resposta.ok, `${nome}: o aparelho fictício é registrado`)
  }

  exigir((await inscrever(a1, donoA, d1, '1')).ok, 'A1 inscreve o próprio aparelho para notificações')
  exigir((await inscrever(a2, donoA, d2, '2')).ok, 'A2 inscreve o próprio aparelho para notificações')
  exigir((await inscrever(b1, donoB, dB, '3')).ok, 'B1 inscreve o próprio aparelho para notificações')

  exigir((await inscricoes(a1)).length === 2, 'a conta A enxerga as duas inscrições dela, e só as dela')
  exigir((await inscricoes(b1)).length === 1, 'a conta B enxerga só a inscrição dela')

  // Uma conta não inscreve o aparelho da outra, nem em nome dela.
  exigir(!(await inscrever(b1, donoA, d1, '4')).ok, 'B não inscreve um aparelho em nome de A')

  // O coração desta prova.
  const revogou = await rpc(a1, 'revoke_device', { p_device_id: d2 })
  exigir(revogou.ok, 'A1 revoga o segundo aparelho da conta')

  const depois = await inscricoes(a1)
  exigir(!depois.some(({ device_id }) => device_id === d2), 'a inscrição do aparelho revogado sumiu')
  exigir(depois.some(({ device_id }) => device_id === d1), 'a inscrição do aparelho que continua ativo ficou')

  // O aparelho revogado ainda tem o token na mão: ele não volta pela porta.
  exigir(!(await inscrever(a2, donoA, d2, '5')).ok, 'o aparelho revogado não se inscreve de novo')
  exigir((await inscricoes(a2)).length === 0, 'o aparelho revogado não enxerga mais inscrição nenhuma')

  // Encerrar a conta não deixa inscrição de pé.
  exigir((await rpc(a1, 'revoke_all_devices')).ok, 'A revoga todos os aparelhos de uma vez')
  const aNovo = await entrar(contas.a)
  const d3 = crypto.randomUUID()
  exigir((await rpc(aNovo, 'claim_device', { p_device_id: d3, p_label: 'Aparelho Fictício A3' })).ok, 'a conta volta com autorização nova')
  exigir((await inscricoes(aNovo)).length === 0, 'revogar todos não deixou inscrição nenhuma para trás')

  // Compatibilidade: é isto que o aplicativo pergunta antes de oferecer o recurso.
  const disponivel = await rpc(aNovo, 'lembretes_push_disponivel')
  exigir(disponivel.ok && (await disponivel.json()) === true, 'o banco declara que tem as notificações')

  // O navegador não alcança a porta do servidor.
  const porta = await rpc(aNovo, 'lembretes_push_inscricoes_ativas', { p_owner_id: donoA })
  exigir(!porta.ok, 'o navegador não lê as inscrições pela porta do servidor')

  // Limpeza do que esta prova criou nas contas fictícias.
  for (const sessao of [aNovo, b1]) {
    await fetch(`${url}/rest/v1/push_subscriptions?owner_id=eq.${sessao.user.id}`, { method: 'DELETE', headers: cabecalhos(sessao) })
  }

  if (falhas) {
    console.error(`\n${falhas} barreira(s) das notificações não se sustentaram.`)
    process.exit(1)
  }
  console.log('\nRevogação das notificações confirmada direto na API.')
}

main().catch((motivo) => { console.error(motivo); process.exit(1) })
