import { currentDeviceId } from '../auth/device'
import { db, type ApoioDatabase } from '../db/database'
import { currentRemoteAccountId, getSupabaseClient, hasSupabaseConfiguration } from '../auth/supabase'
import { liberarNotificacoesDoAparelho } from './bloqueioPush'
import { ocorrenciasEntre } from './repeticao'
import { dataNoFuso, instanteNoFuso, somarDias } from './tempo'
import type { LembreteEntity } from './types'

/**
 * Notificações dos lembretes por Web Push.
 *
 * O servidor recebe só: conta, aparelho, horário, uma chave opaca por
 * ocorrência e o estado do envio. A chave é um HMAC calculado aqui, com uma
 * chave derivada da chave-mestra do cofre — igual em todos os aparelhos da
 * conta, então dois aparelhos agendam a mesma ocorrência numa linha só.
 */

const VAPID = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined
const MARCA = 'apoio-pastoral:push-ativo:'
const BANCO = 'apoio-pastoral-lembretes-push'
const JANELA_DIAS = 35

export type EstadoDasNotificacoes = 'carregando' | 'incompativel' | 'instalar-iphone' | 'indisponivel' | 'negada' | 'desativada' | 'ativada'

const ehIOS = () => /iPhone|iPad|iPod/u.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const instalado = () => window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true

function marcar(accountId: string, ativo: boolean): void {
  try { if (ativo) localStorage.setItem(MARCA + accountId, '1'); else localStorage.removeItem(MARCA + accountId) } catch { /* sem armazenamento: o painel volta a perguntar */ }
}

export function pushAtivoNesteAparelho(accountId: string): boolean {
  try { return localStorage.getItem(MARCA + accountId) === '1' } catch { return false }
}

/** O que impede de ativar, antes de perguntar qualquer coisa ao navegador. */
export function diagnosticar(): Exclude<EstadoDasNotificacoes, 'carregando' | 'ativada' | 'desativada'> | 'pronto' {
  if (ehIOS() && !instalado()) return 'instalar-iphone'
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || typeof Notification === 'undefined') return 'incompativel'
  if (!hasSupabaseConfiguration) return 'indisponivel'
  if (Notification.permission === 'denied') return 'negada'
  return 'pronto'
}

/**
 * Este banco tem as tabelas e funções das notificações?
 *
 * Uma build nova contra um banco sem as migrations de push oferecia "Ativar
 * notificações", pedia a permissão e só falhava na hora de gravar a inscrição
 * — sem dizer por quê. A ausência da própria função de conferência já é a
 * resposta: sem ela, o recurso não existe neste ambiente.
 *
 * A resposta é lembrada enquanto o aplicativo estiver aberto: o banco não
 * ganha migration no meio da sessão. Só a resposta **definitiva** é lembrada —
 * uma queda de rede na conferência não pode desligar as notificações pelo
 * resto do dia; ela apenas adia a resposta para a próxima vez.
 */
let bancoTemPush: boolean | null = null

export async function notificacoesDisponiveisNoBanco(): Promise<boolean> {
  if (!hasSupabaseConfiguration) return false
  if (bancoTemPush !== null) return bancoTemPush
  const { data, error } = await getSupabaseClient().rpc('lembretes_push_disponivel') as { data: unknown; error: { code?: string } | null }
  if (data === true && !error) { bancoTemPush = true; return true }
  // Função que não existe é resposta: este banco não tem as migrations de push.
  // Qualquer outro erro é "ainda não sei", e não fica gravado.
  const naoExiste = error?.code === 'PGRST202' || error?.code === '42883'
  if (naoExiste || (!error && data !== true)) bancoTemPush = false
  return false
}

/** Só para os testes: a próxima pergunta volta a bater no banco. */
export function esquecerCapacidadeDoBanco(): void { bancoTemPush = null }

async function registro(): Promise<ServiceWorkerRegistration | null> {
  return (await navigator.serviceWorker.getRegistration()) ?? null
}

let chaveDoServidor: string | null = null

/**
 * A chave pública VAPID deste ambiente.
 *
 * Vem da build quando declarada; senão, da própria função de envio, que a gera
 * e guarda no Vault do projeto. É pública por natureza — é com ela que o
 * navegador se inscreve — e cada projeto tem a sua.
 */
async function chavePublica(): Promise<string> {
  if (VAPID) return VAPID
  if (chaveDoServidor) return chaveDoServidor
  const { data, error } = await getSupabaseClient().functions.invoke('lembretes-push', { body: { acao: 'chave-publica' } }) as { data: { chave?: unknown } | null; error: unknown }
  if (error || typeof data?.chave !== 'string' || data.chave.length < 40) throw new Error('As notificações ainda não estão disponíveis neste ambiente.')
  chaveDoServidor = data.chave
  return chaveDoServidor
}

export async function estadoDasNotificacoes(accountId: string): Promise<EstadoDasNotificacoes> {
  const diagnostico = diagnosticar()
  if (diagnostico !== 'pronto') return diagnostico
  // Banco sem as migrations de push: o recurso não existe aqui, e prometer
  // que existe faria o pastor conceder a permissão para nada.
  if (!(await notificacoesDisponiveisNoBanco())) return 'indisponivel'
  // Buscada ao abrir o painel: no toque em "Ativar", a permissão é pedida sem esperar a rede.
  await chavePublica().catch(() => undefined)
  const inscricao = await (await registro())?.pushManager.getSubscription()
  return inscricao && Notification.permission === 'granted' && pushAtivoNesteAparelho(accountId) ? 'ativada' : 'desativada'
}

function chaveVapid(base64: string): Uint8Array<ArrayBuffer> {
  const base = base64.replace(/-/gu, '+').replace(/_/gu, '/')
  const binario = atob(base + '='.repeat((4 - (base.length % 4)) % 4))
  return Uint8Array.from(binario, (letra) => letra.charCodeAt(0))
}

/** Só depois do toque em "Ativar notificações": pede a permissão e inscreve este aparelho. */
export async function ativarNotificacoes(accountId: string): Promise<EstadoDasNotificacoes> {
  const diagnostico = diagnosticar()
  if (diagnostico !== 'pronto') return diagnostico
  if (!(await notificacoesDisponiveisNoBanco())) return 'indisponivel'
  const permissao = await Notification.requestPermission()
  if (permissao !== 'granted') return permissao === 'denied' ? 'negada' : 'desativada'
  const reg = await registro()
  if (!reg) return 'incompativel'
  const inscricao = await reg.pushManager.getSubscription() ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveVapid(await chavePublica()) })
  const json = inscricao.toJSON()
  const dono = await currentRemoteAccountId()
  if (!dono || !json.endpoint || !json.keys?.p256dh || !json.keys.auth) throw new Error('Entre com a conta conectada ao serviço para ativar as notificações.')
  const { error } = await getSupabaseClient().from('push_subscriptions').upsert(
    { owner_id: dono, device_id: currentDeviceId(accountId), endpoint: json.endpoint, p256dh: json.keys.p256dh, auth_secret: json.keys.auth },
    { onConflict: 'device_id' },
  )
  if (error) throw new Error('Não foi possível registrar este aparelho para notificações.')
  // Aparelho que voltou a ser autorizado deixa de estar calado.
  await liberarNotificacoesDoAparelho()
  marcar(accountId, true)
  return 'ativada'
}

/** Remove a inscrição deste aparelho — ao desativar e ao sair da conta. */
export async function removerInscricaoDoAparelho(accountId?: string): Promise<void> {
  try {
    if (!('serviceWorker' in navigator)) return
    const inscricao = await (await registro())?.pushManager.getSubscription()
    if (inscricao) {
      if (hasSupabaseConfiguration) await getSupabaseClient().from('push_subscriptions').delete().eq('endpoint', inscricao.endpoint)
      await inscricao.unsubscribe()
    }
  } finally {
    try {
      for (const chave of Object.keys(localStorage)) if (chave.startsWith(MARCA) && (!accountId || chave === MARCA + accountId)) localStorage.removeItem(chave)
    } catch { /* nada a limpar */ }
  }
}

export async function enviarNotificacaoDeTeste(accountId: string): Promise<void> {
  const resultado = await getSupabaseClient().functions.invoke('lembretes-push', { body: { acao: 'teste', deviceId: currentDeviceId(accountId) } }) as { error: unknown }
  if (resultado.error) throw new Error('Não foi possível enviar a notificação de teste.')
}

// ---------------------------------------------------------------- preferências e mapa local

function abrirBanco(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const pedido = indexedDB.open(BANCO, 1)
    pedido.onupgradeneeded = () => { pedido.result.createObjectStore('mapa'); pedido.result.createObjectStore('preferencias') }
    pedido.onsuccess = () => resolve(pedido.result)
    pedido.onerror = () => reject(pedido.error ?? new Error('armazenamento indisponível'))
  })
}

async function noBanco(deposito: 'mapa' | 'preferencias', acao: (store: IDBObjectStore) => void): Promise<void> {
  const banco = await abrirBanco()
  await new Promise<void>((resolve, reject) => {
    const transacao = banco.transaction(deposito, 'readwrite')
    acao(transacao.objectStore(deposito))
    transacao.oncomplete = () => resolve()
    transacao.onerror = () => reject(transacao.error ?? new Error('falha ao gravar'))
  })
  banco.close()
}

export async function mostrarTituloNaNotificacao(): Promise<boolean> {
  try {
    const banco = await abrirBanco()
    const valor = await new Promise<unknown>((resolve) => {
      const pedido = banco.transaction('preferencias', 'readonly').objectStore('preferencias').get('mostrarTitulo')
      pedido.onsuccess = () => resolve(pedido.result)
      pedido.onerror = () => resolve(false)
    })
    banco.close()
    return valor === true
  } catch { return false }
}

export async function definirMostrarTitulo(mostrar: boolean): Promise<void> {
  await noBanco('preferencias', (store) => { store.put(mostrar, 'mostrarTitulo') })
}

// ---------------------------------------------------------------- agendamento

const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
const utf8 = (texto: string) => new TextEncoder().encode(texto)

/**
 * A chave do HMAC, derivada da chave-mestra.
 *
 * AES-GCM com vetor fixo sobre um texto fixo dá o mesmo resultado em todos os
 * aparelhos da conta. Esse vetor é usado só para este texto, e o resultado
 * nunca sai do aparelho: serve apenas de chave para as chaves opacas.
 */
export async function chaveDeAgendamento(masterKey: CryptoKey): Promise<CryptoKey> {
  const bruto = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: new Uint8Array(12), additionalData: utf8('apoio-pastoral:push-key:v1') }, masterKey, utf8('apoio-pastoral:chave-de-notificacao:v1'))
  return crypto.subtle.importKey('raw', bruto, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
}

export interface OcorrenciaParaAvisar { lembreteId: string; ocorrencia: string | null; instante: Date }

/** As ocorrências com aviso nos próximos dias, calculadas do cofre. Série: cada ocorrência aberta, não só a primeira. */
export function ocorrenciasParaAvisar(lembretes: readonly LembreteEntity[], agora: Date, fuso: string): OcorrenciaParaAvisar[] {
  const hoje = dataNoFuso(agora, fuso)
  const fim = somarDias(hoje, JANELA_DIAS)
  const resultado: OcorrenciaParaAvisar[] = []
  for (const lembrete of lembretes) {
    if (!lembrete.notificar || !lembrete.data || !lembrete.hora) continue
    if (!lembrete.repeticao) {
      if (lembrete.estado === 'concluido') continue
      const instante = instanteNoFuso(lembrete.data, lembrete.hora, lembrete.fuso)
      if (instante > agora && lembrete.data <= fim) resultado.push({ lembreteId: lembrete.id, ocorrencia: null, instante })
      continue
    }
    for (const data of ocorrenciasEntre(lembrete.repeticao, lembrete.data, somarDias(hoje, -2), fim, 60)) {
      const registro = lembrete.ocorrencias[data]
      if (registro?.estado) continue
      const instante = instanteNoFuso(registro?.alteracao?.data ?? data, registro?.alteracao?.hora ?? lembrete.hora, lembrete.fuso)
      if (instante > agora) resultado.push({ lembreteId: lembrete.id, ocorrencia: data, instante })
    }
  }
  return resultado
}

export async function chaveDaOcorrencia(chave: CryptoKey, ocorrencia: OcorrenciaParaAvisar): Promise<string> {
  return hex(await crypto.subtle.sign('HMAC', chave, utf8(`${ocorrencia.lembreteId}|${ocorrencia.ocorrencia ?? ''}|${ocorrencia.instante.toISOString()}`)))
}

/**
 * A ocorrência de uma chave opaca, recalculada do cofre.
 *
 * A notificação traz só a chave. Quem tem a chave-mestra refaz os HMACs das
 * ocorrências recentes e acha qual é; quem não tem, não acha nada.
 */
export async function localizarOcorrencia(masterKey: CryptoKey, lembretes: readonly LembreteEntity[], chaveOpaca: string, agora = new Date(), fuso = Intl.DateTimeFormat().resolvedOptions().timeZone): Promise<OcorrenciaParaAvisar | null> {
  if (!/^[0-9a-f]{64}$/u.test(chaveOpaca)) return null
  const chave = await chaveDeAgendamento(masterKey)
  for (const ocorrencia of ocorrenciasParaAvisar(lembretes, new Date(agora.getTime() - 48 * 3_600_000), fuso)) {
    if (await chaveDaOcorrencia(chave, ocorrencia) === chaveOpaca) return ocorrencia
  }
  return null
}

/** O que a rodada fez, e o que ficou faltando. A tela precisa poder dizer isso. */
export interface ResultadoDoAgendamento {
  criados: number
  removidos: number
  /** Em que passo parou, ou `null` quando terminou inteiro. */
  falha: 'leitura' | 'remocao' | 'gravacao' | null
  /** Falha passageira: a próxima carga tenta de novo e costuma resolver. */
  tentarDeNovo: boolean
}

const TENTATIVAS = 2
const ESPERA_MS = 400

/**
 * O último resultado, para a tela poder mostrar a falha.
 *
 * O agendamento roda junto com a contagem do menu, longe do painel. Sem este
 * aviso, uma falha só aparecia no silêncio de não receber nada no horário.
 */
let ultimo: ResultadoDoAgendamento | null = null
const ouvintes = new Set<(resultado: ResultadoDoAgendamento) => void>()

export function ultimoAgendamento(): ResultadoDoAgendamento | null { return ultimo }

export function observarAgendamento(ouvinte: (resultado: ResultadoDoAgendamento) => void): () => void {
  ouvintes.add(ouvinte)
  return () => { ouvintes.delete(ouvinte) }
}

function publicar(resultado: ResultadoDoAgendamento): ResultadoDoAgendamento {
  ultimo = resultado
  for (const ouvinte of ouvintes) ouvinte(resultado)
  return resultado
}

/** O que a tela diz quando o agendamento não terminou. */
export const AVISO_DO_AGENDAMENTO: Record<Exclude<ResultadoDoAgendamento['falha'], null>, string> = {
  leitura: 'Não foi possível conferir os horários de aviso no serviço.',
  remocao: 'Não foi possível retirar um horário de aviso que não vale mais.',
  gravacao: 'Não foi possível marcar os horários de aviso no serviço.',
}

/**
 * Falha passageira é a que some sozinha: rede caída, serviço fora do ar,
 * tempo esgotado. Permissão negada e violação de restrição não são — repetir
 * só gasta bateria e esconde um defeito que precisa aparecer.
 */
function passageira(erro: unknown): boolean {
  const { message, code, status } = (erro ?? {}) as { message?: string; code?: string; status?: number }
  if (typeof status === 'number') return status === 408 || status === 429 || status >= 500
  if (typeof code === 'string' && code) return code === '40001' || code === '40P01' || code === '57014'
  return /fetch|network|timeout|abort|rede/iu.test(message ?? '')
}

const pausa = (ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms) })

/** Repete o passo enquanto a falha for passageira, e desiste quando não for. */
async function comNovaTentativa<T>(passo: () => PromiseLike<{ error: unknown } & T>, esperar: (ms: number) => Promise<void>): Promise<{ error: unknown } & T> {
  let ultimo = await passo()
  for (let tentativa = 1; tentativa < TENTATIVAS && ultimo.error && passageira(ultimo.error); tentativa += 1) {
    await esperar(ESPERA_MS * tentativa)
    ultimo = await passo()
  }
  return ultimo
}

export interface OpcoesDoAgendamento {
  database?: ApoioDatabase
  esperar?: (ms: number) => Promise<void>
}

interface LinhaPendente { occurrence_key: string; updated_at: string }

/**
 * Deixa os horários do serviço iguais ao que o cofre pede.
 *
 * Só com notificações ativas neste aparelho e com internet. O que mudou de
 * horário ganha chave nova; o horário antigo, ainda pendente, é apagado. O que
 * já saiu não é tocado.
 *
 * **Apagar exige saber.** Dois aparelhos escrevem na mesma conta, e o cofre
 * deste aqui pode estar atrasado: um horário que nasceu depois da última
 * sincronização veio de um lembrete que este aparelho ainda não recebeu, e
 * apagá-lo deixaria o pastor sem o aviso que o outro acabou de marcar. Por
 * isso só sai da frente o que já existia antes do que este aparelho conhece —
 * e um aparelho que nunca sincronizou não apaga nada.
 *
 * Repetir é seguro: o que já está lá não é gravado de novo nem apagado.
 */
export async function sincronizarAgendamentos(
  accountId: string,
  masterKey: CryptoKey,
  lembretes: readonly LembreteEntity[],
  agora = new Date(),
  fuso = Intl.DateTimeFormat().resolvedOptions().timeZone,
  { database = db, esperar = pausa }: OpcoesDoAgendamento = {},
): Promise<ResultadoDoAgendamento> {
  const nada: ResultadoDoAgendamento = { criados: 0, removidos: 0, falha: null, tentarDeNovo: false }
  if (!hasSupabaseConfiguration || !pushAtivoNesteAparelho(accountId) || !navigator.onLine) return publicar(nada)
  if (!(await notificacoesDisponiveisNoBanco())) return publicar(nada)
  const dono = await currentRemoteAccountId()
  if (!dono) return publicar(nada)
  const chave = await chaveDeAgendamento(masterKey)
  const desejadas = new Map<string, OcorrenciaParaAvisar>()
  for (const ocorrencia of ocorrenciasParaAvisar(lembretes, agora, fuso)) desejadas.set(await chaveDaOcorrencia(chave, ocorrencia), ocorrencia)

  await noBanco('mapa', (store) => {
    store.clear()
    for (const [chaveOpaca, { lembreteId, ocorrencia }] of desejadas) store.put({ accountId, recordId: lembreteId, ocorrencia }, chaveOpaca)
  }).catch(() => undefined)

  const cliente = getSupabaseClient()
  const leitura = await comNovaTentativa<{ data: LinhaPendente[] | null }>(
    () => cliente.from('notification_schedule').select('occurrence_key, updated_at').eq('state', 'pending'),
    esperar,
  )
  if (leitura.error) return publicar({ ...nada, falha: 'leitura', tentarDeNovo: passageira(leitura.error) })

  const existentes = leitura.data ?? []
  const pendentes = new Set(existentes.map(({ occurrence_key }) => occurrence_key))
  const conhecidoAte = (await database.syncState.get(accountId))?.lastSyncedAt ?? null
  const sobrando = conhecidoAte
    ? existentes.filter(({ occurrence_key, updated_at }) => !desejadas.has(occurrence_key) && updated_at <= conhecidoAte).map(({ occurrence_key }) => occurrence_key)
    : []

  let removidos = 0
  if (sobrando.length) {
    const remocao = await comNovaTentativa(
      () => cliente.from('notification_schedule').delete().eq('state', 'pending').in('occurrence_key', sobrando),
      esperar,
    )
    if (remocao.error) return publicar({ ...nada, falha: 'remocao', tentarDeNovo: passageira(remocao.error) })
    removidos = sobrando.length
  }

  const novas = [...desejadas].filter(([chaveOpaca]) => !pendentes.has(chaveOpaca))
  if (novas.length) {
    const gravacao = await comNovaTentativa(
      () => cliente.from('notification_schedule').upsert(
        novas.map(([chaveOpaca, { instante }]) => ({ owner_id: dono, occurrence_key: chaveOpaca, fire_at: instante.toISOString() })),
        { onConflict: 'owner_id,occurrence_key', ignoreDuplicates: true },
      ),
      esperar,
    )
    if (gravacao.error) return publicar({ criados: 0, removidos, falha: 'gravacao', tentarDeNovo: passageira(gravacao.error) })
  }
  return publicar({ criados: novas.length, removidos, falha: null, tentarDeNovo: false })
}
