import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { PasswordKeyEnvelope, RecoveryKeyEnvelope } from '../crypto/types'
import { declaredEnvironment, isRemoteEnvironmentAllowed, isSyncDisabled } from '../sync/config'
import { falhaRemota } from './remoteErrors'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const hasSupabaseConfiguration = !isSyncDisabled && Boolean(supabaseUrl && supabaseAnonKey)

let cachedClient: SupabaseClient | null = null

// Trava de ambiente: mesmo com URL e chave preenchidas, a conexão remota só é
// aberta quando o ambiente está declarado como homologação ou produção. Falha
// alto e claro em vez de cair em silêncio para o transporte local.
export function assertRemoteEnvironment(): void {
  if (!isRemoteEnvironmentAllowed) {
    throw new Error('A conexão remota só é permitida com o ambiente declarado. Defina VITE_APP_ENV=homologacao ou VITE_APP_ENV=producao.')
  }
}

/** Ambiente declarado nesta build: `homologacao`, `producao` ou `local`. */
export function currentEnvironment(): string { return declaredEnvironment }

export function getSupabaseClient(): SupabaseClient {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('O ambiente Supabase ainda não foi configurado.')
  }
  assertRemoteEnvironment()
  cachedClient ??= createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  })
  return cachedClient
}

export interface RemoteRegistration {
  /** Identificador da conta no serviço. */
  userId: string
  /** Falso quando o serviço exige confirmar o e-mail antes de liberar a sessão. */
  ready: boolean
}

/**
 * Cria a conta no serviço. Quando a confirmação de e-mail está ligada, o
 * Supabase devolve o usuário sem sessão: nesse caso nada mais pode ser gravado
 * no serviço, e quem chamou precisa parar em um estado de espera em vez de
 * seguir gravando envelopes pela metade.
 */
export async function registerRemoteAccount(email: string, password: string): Promise<RemoteRegistration> {
  const { data, error } = await getSupabaseClient().auth.signUp({ email, password })
  if (error) {
    if (/already registered|already exists|User already/iu.test(error.message)) {
      throw new Error('Já existe uma conta com este e-mail. Entre com a senha dela.')
    }
    throw falhaRemota(error, 'Não foi possível criar a conta agora. Tente de novo em alguns minutos.')
  }
  if (!data.user) throw new Error('Não foi possível criar a conta.')
  return { userId: data.user.id, ready: Boolean(data.session) }
}

/** Reenvia o e-mail de confirmação de uma conta recém-criada. */
export async function resendConfirmationEmail(email: string): Promise<void> {
  const { error } = await getSupabaseClient().auth.resend({ type: 'signup', email })
  if (error) throw falhaRemota(error, 'Não foi possível reenviar a confirmação agora.')
}

/**
 * Dispara o e-mail oficial de redefinição de senha do serviço. Nunca envia a
 * chave de recuperação: ela não sai do aparelho do pastor, por e-mail nenhum.
 */
export async function requestPasswordReset(email: string, redirectTo: string): Promise<void> {
  const { error } = await getSupabaseClient().auth.resetPasswordForEmail(email, { redirectTo })
  if (error) throw falhaRemota(error, 'Não foi possível enviar o e-mail de redefinição agora.')
}

/** Conta autenticada agora no serviço, ou `null` quando não há sessão. */
export async function currentRemoteAccountId(): Promise<string | null> {
  if (!hasSupabaseConfiguration) return null
  const { data: { user } } = await getSupabaseClient().auth.getUser()
  return user?.id ?? null
}

export async function signInRemoteAccount(email: string, password: string): Promise<string> {
  const { data, error } = await getSupabaseClient().auth.signInWithPassword({ email, password })
  if (error) {
    if (/email not confirmed|not confirmed/iu.test(error.message)) {
      throw new Error('Confirme o e-mail desta conta pelo link que enviamos e entre de novo.')
    }
    throw new Error('E-mail ou senha inválidos.')
  }
  return data.user.id
}

export async function updateRemotePassword(password: string): Promise<void> {
  const { error } = await getSupabaseClient().auth.updateUser({ password })
  if (error) throw falhaRemota(error, 'Não foi possível trocar a senha no serviço.')
}

/**
 * Sair encerra a sessão em todo o serviço (`global`), não só a aba atual: é o
 * que o pastor espera de "Sair" e o que faz diferença num aparelho emprestado.
 * Bloquear o cofre é outra coisa e não passa por aqui.
 */
export async function signOutRemoteAccount(): Promise<void> {
  if (!hasSupabaseConfiguration) return
  const { error } = await getSupabaseClient().auth.signOut({ scope: 'global' })
  if (error) throw falhaRemota(error, 'Não foi possível encerrar a sessão no serviço.')
}

/**
 * Registra o aparelho no serviço e amarra a sessão atual a ele.
 *
 * Quem decide a situação é o servidor, não este código: o primeiro aparelho de
 * uma conta nasce ativo e qualquer outro nasce aguardando confirmação. Era esse
 * o buraco de antes — bastava um identificador novo para voltar a sincronizar
 * depois de uma revogação.
 */
export async function ensureRemoteDevice(deviceId: string, label: string): Promise<RemoteDeviceStatus | null> {
  if (!hasSupabaseConfiguration) return null
  const client = getSupabaseClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) return null
  const resposta = await client.rpc('claim_device', { p_device_id: deviceId, p_label: label })
  if (resposta.error) throw falhaRemota(resposta.error, 'Não foi possível autorizar este aparelho no serviço.')
  return (resposta.data as RemoteDeviceStatus | null) ?? null
}

/** Libera, a partir deste aparelho já ativo, uma instalação que aguardava. */
export async function approveRemoteDevice(deviceId: string): Promise<void> {
  if (!hasSupabaseConfiguration) return
  const { error } = await getSupabaseClient().rpc('approve_device', { p_device_id: deviceId })
  if (error) throw falhaRemota(error, 'Não foi possível confirmar o aparelho no serviço.')
}

/** Versão do esquema que o serviço está usando, para conferir o ambiente. */
export async function remoteSchemaVersion(): Promise<number | null> {
  if (!hasSupabaseConfiguration) return null
  const resposta = await getSupabaseClient().rpc('app_schema_version')
  if (resposta.error) throw falhaRemota(resposta.error, 'Não foi possível conferir a versão do serviço.')
  return typeof resposta.data === 'number' ? resposta.data : null
}

export async function storeRemoteRecoveryEnvelope(envelope: RecoveryKeyEnvelope): Promise<void> {
  if (!hasSupabaseConfiguration) return
  const client = getSupabaseClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) return
  const { error } = await client.from('recovery_key_envelopes').upsert({
    owner_id: user.id,
    ciphertext: envelope.ciphertext,
    iv: envelope.iv,
    aad: envelope.aad,
    salt: envelope.salt,
    kdf: envelope.kdf,
    key_version: envelope.keyVersion,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'owner_id' })
  if (error) throw falhaRemota(error, 'Não foi possível guardar o envelope de recuperação cifrado.')
}

export async function storeRemotePasswordEnvelope(envelope: PasswordKeyEnvelope): Promise<void> {
  if (!hasSupabaseConfiguration) return
  const client = getSupabaseClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) throw new Error('Não foi possível confirmar a conta no serviço.')
  const { error } = await client.from('password_key_envelopes').upsert({
    owner_id: user.id,
    ciphertext: envelope.ciphertext,
    iv: envelope.iv,
    aad: envelope.aad,
    salt: envelope.salt,
    kdf: envelope.kdf,
    iterations: envelope.iterations,
    key_version: envelope.keyVersion,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'owner_id' })
  if (error) throw falhaRemota(error, 'Não foi possível guardar o acesso protegido da conta.')
}

interface RecoveryEnvelopeRow {
  ciphertext: string
  iv: string
  aad: string
  salt: string
  kdf: 'HKDF-SHA-256'
  key_version: number
}

interface PasswordEnvelopeRow {
  ciphertext: string
  iv: string
  aad: string
  salt: string
  kdf: 'PBKDF2-SHA-256'
  iterations: number
  key_version: number
}

/**
 * Contas criadas antes do envelope de senha remoto não têm essa linha. Um
 * aparelho que ainda abre o cofre pode preenchê-la sozinho, e a partir daí a
 * conta entra em qualquer navegador com e-mail e senha.
 */
export async function hasRemotePasswordEnvelope(): Promise<boolean> {
  if (!hasSupabaseConfiguration) return true
  const { data, error } = await getSupabaseClient()
    .from('password_key_envelopes')
    .select('owner_id')
    .maybeSingle()
  if (error) throw falhaRemota(error, 'Não foi possível conferir o acesso desta conta.')
  return Boolean(data)
}

export async function fetchRemotePasswordEnvelope(): Promise<PasswordKeyEnvelope> {
  const { data, error } = await getSupabaseClient()
    .from('password_key_envelopes')
    .select('ciphertext,iv,aad,salt,kdf,iterations,key_version')
    .single()
  if (error || !data) throw new Error('Esta conta ainda não está preparada para entrar em um aparelho novo. Abra o aplicativo em um aparelho onde você já entra e faça o acesso uma vez; depois volte aqui. Se não tiver mais nenhum aparelho, use a chave de recuperação.')
  const row: PasswordEnvelopeRow = data
  return {
    kind: 'password',
    algorithm: 'AES-GCM-256',
    ciphertext: row.ciphertext,
    iv: row.iv,
    aad: row.aad,
    salt: row.salt,
    kdf: row.kdf,
    iterations: row.iterations,
    keyVersion: row.key_version,
  }
}

export async function fetchRemoteRecoveryEnvelope(): Promise<RecoveryKeyEnvelope> {
  const { data, error } = await getSupabaseClient()
    .from('recovery_key_envelopes')
    .select('ciphertext,iv,aad,salt,kdf,key_version')
    .single()
  if (error || !data) throw new Error('Envelope de recuperação indisponível.')
  const row: RecoveryEnvelopeRow = data
  return {
    kind: 'recovery',
    algorithm: 'AES-GCM-256',
    ciphertext: row.ciphertext,
    iv: row.iv,
    aad: row.aad,
    salt: row.salt,
    kdf: row.kdf,
    keyVersion: row.key_version,
  }
}

export type RemoteDeviceStatus = 'pending' | 'active' | 'revoked'

/**
 * Quem revoga um aparelho é outro aparelho, e essa notícia nunca chega pelo
 * conteúdo sincronizado: o registro em `devices` é a única autoridade sobre a
 * revogação. Devolve `null` quando não há serviço remoto configurado, para que
 * o transporte local de desenvolvimento continue funcionando sem rede.
 *
 * Falha fechada de propósito: linha ausente ou escondida pela RLS conta como
 * revogada, e erro técnico interrompe a sincronização em vez de liberá-la.
 */
export async function fetchRemoteDeviceStatus(deviceId: string): Promise<RemoteDeviceStatus | null> {
  if (!hasSupabaseConfiguration) return null
  const { data, error } = await getSupabaseClient()
    .from('devices')
    .select('status')
    .eq('id', deviceId)
    .maybeSingle()
  if (error) throw falhaRemota(error, 'Não foi possível confirmar a autorização deste aparelho.')
  return (data?.status as RemoteDeviceStatus | undefined) ?? 'revoked'
}

export interface RemoteDevice {
  id: string
  label: string
  status: RemoteDeviceStatus
  lastSeenAt: string | null
}

/**
 * A lista de dispositivos da conta vive no serviço: cada aparelho só conhece a
 * si mesmo localmente. Sem esta consulta, a tela de Segurança nunca mostraria os
 * outros aparelhos e a revogação seria inalcançável. Devolve `null` quando não
 * há serviço remoto, para a tela seguir com o que tem localmente.
 */
export async function fetchRemoteDevices(): Promise<RemoteDevice[] | null> {
  if (!hasSupabaseConfiguration) return null
  const { data, error } = await getSupabaseClient()
    .from('devices')
    .select('id,label,status,last_seen_at')
    .order('created_at', { ascending: true })
  if (error) throw falhaRemota(error, 'Não foi possível consultar os aparelhos da conta.')
  return (data ?? []).map((row) => ({
    id: row.id as string,
    label: row.label as string,
    status: row.status as RemoteDeviceStatus,
    lastSeenAt: (row.last_seen_at as string | null) ?? null,
  }))
}

/**
 * Revoga pelo servidor: além de marcar a linha, a função apaga o envelope de
 * chave daquele aparelho e derruba as sessões dele. O que já foi baixado
 * continua no aparelho — isso nenhuma revogação alcança, e está dito assim na
 * tela e na documentação.
 */
export async function revokeRemoteDevice(deviceId: string): Promise<void> {
  if (!hasSupabaseConfiguration) return
  const { error } = await getSupabaseClient().rpc('revoke_device', { p_device_id: deviceId })
  if (error) throw falhaRemota(error, 'Não foi possível revogar o aparelho no serviço.')
}
