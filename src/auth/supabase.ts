import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { RecoveryKeyEnvelope } from '../crypto/types'
import { isSyncDisabled } from '../sync/config'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const hasSupabaseConfiguration = !isSyncDisabled && Boolean(supabaseUrl && supabaseAnonKey)

let cachedClient: SupabaseClient | null = null

export function getSupabaseClient(): SupabaseClient {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('O ambiente Supabase ainda não foi configurado.')
  }
  cachedClient ??= createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  })
  return cachedClient
}

export async function registerRemoteAccount(email: string, password: string): Promise<string> {
  const { data, error } = await getSupabaseClient().auth.signUp({ email, password })
  if (error) throw new Error(error.message)
  if (!data.user) throw new Error('Não foi possível criar a conta.')
  return data.user.id
}

export async function signInRemoteAccount(email: string, password: string): Promise<string> {
  const { data, error } = await getSupabaseClient().auth.signInWithPassword({ email, password })
  if (error) throw new Error('E-mail ou senha inválidos.')
  return data.user.id
}

export async function updateRemotePassword(password: string): Promise<void> {
  const { error } = await getSupabaseClient().auth.updateUser({ password })
  if (error) throw new Error(error.message)
}

export async function signOutRemoteAccount(): Promise<void> {
  if (!hasSupabaseConfiguration) return
  const { error } = await getSupabaseClient().auth.signOut()
  if (error) throw new Error(error.message)
}

export async function ensureRemoteDevice(deviceId: string, label: string): Promise<void> {
  if (!hasSupabaseConfiguration) return
  const client = getSupabaseClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) return
  const { error } = await client.from('devices').upsert({
    id: deviceId,
    owner_id: user.id,
    label,
    status: 'active',
    last_seen_at: new Date().toISOString(),
  }, { onConflict: 'id' })
  if (error) throw new Error('Não foi possível autorizar o dispositivo no serviço.')
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
  if (error) throw new Error('Não foi possível guardar o envelope de recuperação cifrado.')
}

interface RecoveryEnvelopeRow {
  ciphertext: string
  iv: string
  aad: string
  salt: string
  kdf: 'HKDF-SHA-256'
  key_version: number
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

export async function revokeRemoteDevice(deviceId: string): Promise<void> {
  if (!hasSupabaseConfiguration) return
  const { error } = await getSupabaseClient().from('devices').update({
    status: 'revoked',
    revoked_at: new Date().toISOString(),
  }).eq('id', deviceId)
  if (error) throw new Error('Não foi possível revogar o dispositivo no serviço.')
}
