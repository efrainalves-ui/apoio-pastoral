// Envio das notificações dos lembretes.
//
// Duas entradas:
//   * agendador (pg_cron + pg_net, a cada minuto), com o segredo do agendamento
//     no cabeçalho Authorization: envia o que venceu;
//   * aparelho autenticado, com { acao: 'teste', deviceId }: envia um aviso de
//     teste só para aquele aparelho da conta.
//
// O aviso é sempre genérico. Este código não recebe nem lê conteúdo de
// lembrete — o banco não tem esse conteúdo.
//
// Configuração no Vault do projeto (migration 0011), lida pelo papel do
// servidor: par VAPID, assunto VAPID e segredo do agendamento. O par VAPID é
// gerado aqui na primeira execução autorizada e nunca sai do servidor.
// SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são fornecidas pela própria
// plataforma e nunca chegam ao navegador.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.45.4'
import webpush from 'npm:web-push@3.6.7'

const AVISO = { title: 'Apoio Pastoral', body: 'Você tem um lembrete' }
const VALIDADE_S = 12 * 60 * 60
const MAX_TENTATIVAS = 5

interface Inscricao { id: string; endpoint: string; p256dh: string; auth_secret: string }
interface Configuracao { lembretes_vapid_public?: string; lembretes_vapid_private?: string; lembretes_vapid_subject?: string; lembretes_cron_secret?: string }

function env(nome: string): string {
  const valor = Deno.env.get(nome)
  if (!valor) throw new Error(`variável ${nome} ausente`)
  return valor
}

const resposta = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), {
  status, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type, apikey, x-client-info' },
})

/** Comparação em tempo constante: o tempo da resposta não revela quanto do segredo acertou. */
function iguais(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a)
  const y = new TextEncoder().encode(b)
  let diferenca = x.length ^ y.length
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) diferenca |= (x[i] ?? 0) ^ (y[i] ?? 0)
  return diferenca === 0
}

async function lerConfiguracao(admin: SupabaseClient): Promise<Configuracao> {
  const { data, error } = await admin.rpc('lembretes_push_config')
  if (error) throw error
  return (data ?? {}) as Configuracao
}

/** O par VAPID deste projeto; gerado e guardado no Vault se ainda não existe. */
async function prepararVapid(admin: SupabaseClient, configuracao: Configuracao): Promise<string> {
  let atual = configuracao
  if (!atual.lembretes_vapid_public || !atual.lembretes_vapid_private) {
    const par = webpush.generateVAPIDKeys()
    const { error } = await admin.rpc('lembretes_push_guardar_vapid', { chave_publica: par.publicKey, chave_privada: par.privateKey })
    if (error) throw error
    // Relê: se outra execução gravou primeiro, vale a dela.
    atual = await lerConfiguracao(admin)
  }
  if (!atual.lembretes_vapid_public || !atual.lembretes_vapid_private || !atual.lembretes_vapid_subject) throw new Error('configuração VAPID incompleta')
  webpush.setVapidDetails(atual.lembretes_vapid_subject, atual.lembretes_vapid_public, atual.lembretes_vapid_private)
  return atual.lembretes_vapid_public
}

async function enviar(admin: SupabaseClient, inscricoes: Inscricao[], dados: Record<string, string>): Promise<{ entregues: number; transitorias: number }> {
  let entregues = 0
  let transitorias = 0
  for (const inscricao of inscricoes) {
    try {
      await webpush.sendNotification(
        { endpoint: inscricao.endpoint, keys: { p256dh: inscricao.p256dh, auth: inscricao.auth_secret } },
        JSON.stringify({ ...AVISO, ...dados }),
        { TTL: VALIDADE_S, urgency: 'high' },
      )
      entregues += 1
    } catch (falha) {
      const status = (falha as { statusCode?: number }).statusCode
      // Inscrição que o serviço de push não reconhece mais: some daqui.
      if (status === 404 || status === 410) await admin.from('push_subscriptions').delete().eq('id', inscricao.id)
      else transitorias += 1
    }
  }
  return { entregues, transitorias }
}

async function enviarVencidos(admin: SupabaseClient) {
  const agora = new Date()
  const agoraIso = agora.toISOString()
  // Envio interrompido por queda volta à fila depois de dez minutos.
  await admin.from('notification_schedule').update({ state: 'pending', updated_at: agoraIso })
    .eq('state', 'sending').lt('updated_at', new Date(agora.getTime() - 10 * 60_000).toISOString())
  // Reservar e ler numa instrução só: duas execuções não pegam a mesma linha.
  const { data: devidos, error } = await admin.from('notification_schedule')
    .update({ state: 'sending', updated_at: agoraIso })
    .eq('state', 'pending').lte('fire_at', agoraIso)
    .select('id, owner_id, occurrence_key, fire_at, attempts')
  if (error) throw error

  let enviados = 0
  for (const linha of devidos ?? []) {
    // Muito atrasado (aparelho sem serviço, função parada): o aplicativo já mostra como atrasado.
    if (new Date(linha.fire_at).getTime() < agora.getTime() - VALIDADE_S * 1000) {
      await admin.from('notification_schedule').update({ state: 'failed', updated_at: agoraIso }).eq('id', linha.id)
      continue
    }
    const { data: inscricoes } = await admin.from('push_subscriptions').select('id, endpoint, p256dh, auth_secret').eq('owner_id', linha.owner_id)
    const { entregues, transitorias } = await enviar(admin, inscricoes ?? [], { tag: linha.occurrence_key, chave: linha.occurrence_key, url: `/app/lembretes/aviso/${linha.occurrence_key}` })
    if (entregues > 0 || !transitorias) {
      await admin.from('notification_schedule').update({ state: entregues > 0 ? 'sent' : 'failed', sent_at: entregues > 0 ? agoraIso : null, updated_at: agoraIso }).eq('id', linha.id)
      enviados += entregues > 0 ? 1 : 0
    } else {
      const tentativas = linha.attempts + 1
      await admin.from('notification_schedule').update({ state: tentativas >= MAX_TENTATIVAS ? 'failed' : 'pending', attempts: tentativas, updated_at: agoraIso }).eq('id', linha.id)
    }
  }
  // Histórico curto: o que já saiu some depois de trinta dias.
  await admin.from('notification_schedule').delete().in('state', ['sent', 'failed']).lt('fire_at', new Date(agora.getTime() - 30 * 86_400_000).toISOString())
  return { reservados: devidos?.length ?? 0, enviados }
}

Deno.serve(async (pedido) => {
  if (pedido.method === 'OPTIONS') return resposta({})
  if (pedido.method !== 'POST') return resposta({ erro: 'método' }, 405)
  try {
    const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } })
    const configuracao = await lerConfiguracao(admin)
    const autorizacao = pedido.headers.get('authorization') ?? ''

    const segredo = configuracao.lembretes_cron_secret
    if (segredo && segredo.length >= 32 && iguais(autorizacao, `Bearer ${segredo}`)) {
      await prepararVapid(admin, configuracao)
      return resposta(await enviarVencidos(admin))
    }

    const token = autorizacao.replace(/^Bearer\s+/iu, '')
    if (!token) return resposta({ erro: 'não autenticado' }, 401)
    const { data: { user } } = await admin.auth.getUser(token)
    if (!user) return resposta({ erro: 'não autenticado' }, 401)
    const corpo = await pedido.json().catch(() => ({})) as { acao?: string; deviceId?: string }
    // A chave pública do ambiente, para o navegador se inscrever. Pública por natureza; só a privada fica no servidor.
    if (corpo.acao === 'chave-publica') return resposta({ chave: await prepararVapid(admin, configuracao) })
    if (corpo.acao !== 'teste' || !corpo.deviceId) return resposta({ erro: 'pedido inválido' }, 400)
    const { data: inscricoes } = await admin.from('push_subscriptions').select('id, endpoint, p256dh, auth_secret').eq('owner_id', user.id).eq('device_id', corpo.deviceId)
    if (!inscricoes?.length) return resposta({ erro: 'aparelho sem inscrição' }, 404)
    await prepararVapid(admin, configuracao)
    const { entregues } = await enviar(admin, inscricoes, { tag: 'apoio-pastoral-teste', url: '/app/lembretes' })
    return resposta({ entregues })
  } catch (falha) {
    // Só a mensagem técnica ou o código do erro do banco; nunca cabeçalhos, corpo ou configuração.
    const detalhe = falha instanceof Error ? falha.message : typeof falha === 'object' && falha !== null ? String((falha as { code?: unknown; message?: unknown }).code ?? (falha as { message?: unknown }).message ?? 'falha') : 'falha'
    console.error('lembretes-push', detalhe)
    return resposta({ erro: 'falha no envio' }, 500)
  }
})
