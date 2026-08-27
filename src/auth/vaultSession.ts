import {
  createPasswordEnvelope,
  createRecoveryEnvelope,
  generateMasterKey,
  openPasswordEnvelope,
  openRecoveryEnvelope,
} from '../crypto/vault'
import { db, type ApoioDatabase } from '../db/database'
import type { AccountRecord, KeyEnvelopeRecord } from '../db/types'
import { authorizeCurrentDevice } from './device'
import {
  hasSupabaseConfiguration,
  fetchRemoteRecoveryEnvelope,
  registerRemoteAccount,
  signInRemoteAccount,
  storeRemoteRecoveryEnvelope,
  updateRemotePassword,
} from './supabase'

export interface RegistrationResult {
  account: AccountRecord
  masterKey: CryptoKey
  recoveryCode: string
}

function validateCredentials(email: string, password: string): void {
  if (!/^\S+@\S+\.\S+$/u.test(email)) throw new Error('Informe um e-mail válido.')
  if (password.length < 12) throw new Error('Use uma senha com pelo menos 12 caracteres.')
}

export async function registerAccount(
  email: string,
  password: string,
  database: ApoioDatabase = db,
): Promise<RegistrationResult> {
  validateCredentials(email, password)
  const normalizedEmail = email.trim().toLowerCase()
  if (await database.accounts.count() > 0) {
    throw new Error('Já existe uma conta neste dispositivo.')
  }

  const id = hasSupabaseConfiguration ? await registerRemoteAccount(normalizedEmail, password) : crypto.randomUUID()
  const masterKey = await generateMasterKey()
  const passwordEnvelope = await createPasswordEnvelope(masterKey, password)
  const recovery = await createRecoveryEnvelope(masterKey)
  const now = new Date().toISOString()
  const account: AccountRecord = {
    id,
    email: normalizedEmail,
    createdAt: now,
    authMode: hasSupabaseConfiguration ? 'supabase' : 'local-development',
  }

  const envelopes: KeyEnvelopeRecord[] = [
    { id: 'password', accountId: id, envelope: passwordEnvelope, updatedAt: now },
    { id: 'recovery', accountId: id, envelope: recovery.envelope, updatedAt: now },
  ]

  await database.transaction('rw', database.accounts, database.keyEnvelopes, database.syncState, async () => {
    await database.accounts.add(account)
    await database.keyEnvelopes.bulkPut(envelopes)
    await database.syncState.put({ accountId: id, cursor: null, lastSyncedAt: null })
  })
  await authorizeCurrentDevice(id, database)
  await storeRemoteRecoveryEnvelope(recovery.envelope)
  return { account, masterKey, recoveryCode: recovery.recoveryCode }
}

export async function unlockAccount(
  email: string,
  password: string,
  database: ApoioDatabase = db,
): Promise<{ account: AccountRecord; masterKey: CryptoKey }> {
  const normalizedEmail = email.trim().toLowerCase()
  const account = await database.accounts.where('email').equals(normalizedEmail).first()
  if (!account) {
    if (hasSupabaseConfiguration) {
      await signInRemoteAccount(normalizedEmail, password)
      throw new Error('Este dispositivo precisa ser autorizado com a chave de recuperação.')
    }
    throw new Error('E-mail ou senha inválidos.')
  }
  if (account.authMode === 'supabase') {
    const remoteId = await signInRemoteAccount(normalizedEmail, password)
    if (remoteId !== account.id) throw new Error('A conta autenticada não corresponde a este cofre.')
  }
  const envelopeRecord = await database.keyEnvelopes.get('password')
  if (!envelopeRecord || envelopeRecord.accountId !== account.id || envelopeRecord.envelope.kind !== 'password') {
    throw new Error('Este dispositivo precisa ser autorizado com a chave de recuperação.')
  }
  const masterKey = await openPasswordEnvelope(envelopeRecord.envelope, password)
  await authorizeCurrentDevice(account.id, database)
  return { account, masterKey }
}

export async function recoverAccount(
  email: string,
  recoveryCode: string,
  newPassword: string,
  database: ApoioDatabase = db,
): Promise<{ account: AccountRecord; masterKey: CryptoKey }> {
  if (newPassword.length < 12) throw new Error('Use uma senha com pelo menos 12 caracteres.')
  const normalizedEmail = email.trim().toLowerCase()
  let account = await database.accounts.where('email').equals(normalizedEmail).first()
  let recoveryEnvelope
  if (!account && hasSupabaseConfiguration) {
    const accountId = await signInRemoteAccount(normalizedEmail, newPassword)
    recoveryEnvelope = await fetchRemoteRecoveryEnvelope()
    account = { id: accountId, email: normalizedEmail, createdAt: new Date().toISOString(), authMode: 'supabase' }
    await database.accounts.put(account)
    await database.keyEnvelopes.put({ id: 'recovery', accountId, envelope: recoveryEnvelope, updatedAt: new Date().toISOString() })
    await database.syncState.put({ accountId, cursor: null, lastSyncedAt: null })
  } else {
    const recoveryRecord = await database.keyEnvelopes.get('recovery')
    if (!recoveryRecord || recoveryRecord.accountId !== account?.id || recoveryRecord.envelope.kind !== 'recovery') throw new Error('Envelope de recuperação indisponível.')
    recoveryEnvelope = recoveryRecord.envelope
  }
  if (!account) throw new Error('Conta não encontrada neste dispositivo.')
  const masterKey = await openRecoveryEnvelope(recoveryEnvelope, recoveryCode)
  const passwordEnvelope = await createPasswordEnvelope(masterKey, newPassword)
  await database.keyEnvelopes.put({ id: 'password', accountId: account.id, envelope: passwordEnvelope, updatedAt: new Date().toISOString() })
  await authorizeCurrentDevice(account.id, database)
  return { account, masterKey }
}

export async function changeVaultPassword(
  account: AccountRecord,
  currentPassword: string,
  newPassword: string,
  database: ApoioDatabase = db,
): Promise<CryptoKey> {
  if (newPassword.length < 12) throw new Error('Use uma senha com pelo menos 12 caracteres.')
  const passwordRecord = await database.keyEnvelopes.get('password')
  if (!passwordRecord || passwordRecord.accountId !== account.id || passwordRecord.envelope.kind !== 'password') throw new Error('Envelope de senha indisponível.')
  const masterKey = await openPasswordEnvelope(passwordRecord.envelope, currentPassword)
  const replacement = await createPasswordEnvelope(masterKey, newPassword)
  if (account.authMode === 'supabase') await updateRemotePassword(newPassword)
  await database.keyEnvelopes.put({ ...passwordRecord, envelope: replacement, updatedAt: new Date().toISOString() })
  return masterKey
}

export async function findLocalAccount(database: ApoioDatabase = db): Promise<AccountRecord | undefined> {
  return database.accounts.toCollection().first()
}
