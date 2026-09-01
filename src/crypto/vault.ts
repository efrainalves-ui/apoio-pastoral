import { fromBase64Url, fromUtf8, randomBytes, toBase64Url, utf8 } from './encoding'
import type { CipherEnvelope, PasswordKeyEnvelope, RecoveryKeyEnvelope, VaultPayload } from './types'

export const PASSWORD_KDF_ITERATIONS = 600_000
const KEY_LENGTH = 256
const AES_GCM_IV_LENGTH = 12
const MASTER_KEY_AAD = 'apoio-pastoral:key-envelope:v1'
const RECOVERY_INFO = 'apoio-pastoral:recovery-key:v1'

async function importAesKey(raw: BufferSource, extractable = false): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM', length: KEY_LENGTH }, extractable, ['encrypt', 'decrypt'])
}

async function exportKey(key: CryptoKey): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await crypto.subtle.exportKey('raw', key))
}

export async function generateMasterKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: KEY_LENGTH }, true, ['encrypt', 'decrypt'])
}

async function derivePasswordKey(password: string, salt: BufferSource, iterations = PASSWORD_KDF_ITERATIONS): Promise<CryptoKey> {
  const passwordMaterial = await crypto.subtle.importKey('raw', utf8(password), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    passwordMaterial,
    { name: 'AES-GCM', length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt'],
  )
}

async function deriveRecoveryKey(recoverySecret: BufferSource, salt: BufferSource): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', recoverySecret, 'HKDF', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt, info: utf8(RECOVERY_INFO) },
    material,
    { name: 'AES-GCM', length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt'],
  )
}

async function wrapMasterKey(masterKey: CryptoKey, wrappingKey: CryptoKey, aad: string): Promise<CipherEnvelope> {
  const iv = randomBytes(AES_GCM_IV_LENGTH)
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: utf8(aad), tagLength: 128 },
    wrappingKey,
    await exportKey(masterKey),
  )
  return {
    algorithm: 'AES-GCM-256',
    ciphertext: toBase64Url(ciphertext),
    iv: toBase64Url(iv),
    aad: toBase64Url(utf8(aad)),
    keyVersion: 1,
  }
}

async function unwrapMasterKey(envelope: CipherEnvelope, wrappingKey: CryptoKey): Promise<CryptoKey> {
  const raw = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: fromBase64Url(envelope.iv),
      additionalData: fromBase64Url(envelope.aad),
      tagLength: 128,
    },
    wrappingKey,
    fromBase64Url(envelope.ciphertext),
  )
  return importAesKey(raw, true)
}

export async function createPasswordEnvelope(masterKey: CryptoKey, password: string): Promise<PasswordKeyEnvelope> {
  const salt = randomBytes(16)
  const passwordKey = await derivePasswordKey(password, salt)
  return {
    ...(await wrapMasterKey(masterKey, passwordKey, MASTER_KEY_AAD)),
    kind: 'password',
    kdf: 'PBKDF2-SHA-256',
    iterations: PASSWORD_KDF_ITERATIONS,
    salt: toBase64Url(salt),
  }
}

export async function openPasswordEnvelope(envelope: PasswordKeyEnvelope, password: string): Promise<CryptoKey> {
  try {
    const passwordKey = await derivePasswordKey(password, fromBase64Url(envelope.salt), envelope.iterations)
    return await unwrapMasterKey(envelope, passwordKey)
  } catch {
    throw new Error('Senha incorreta. Verifique e tente novamente.')
  }
}

export async function createRecoveryEnvelope(masterKey: CryptoKey): Promise<{ envelope: RecoveryKeyEnvelope; recoveryCode: string }> {
  const secret = randomBytes(32)
  const salt = randomBytes(16)
  const recoveryKey = await deriveRecoveryKey(secret, salt)
  return {
    envelope: {
      ...(await wrapMasterKey(masterKey, recoveryKey, `${MASTER_KEY_AAD}:recovery`)),
      kind: 'recovery',
      kdf: 'HKDF-SHA-256',
      salt: toBase64Url(salt),
    },
    recoveryCode: `APOIO-1-${toBase64Url(secret)}`,
  }
}

export async function openRecoveryEnvelope(envelope: RecoveryKeyEnvelope, recoveryCode: string): Promise<CryptoKey> {
  try {
    const encodedSecret = recoveryCode.trim().replace(/^APOIO-1-/u, '')
    const recoveryKey = await deriveRecoveryKey(fromBase64Url(encodedSecret), fromBase64Url(envelope.salt))
    return await unwrapMasterKey(envelope, recoveryKey)
  } catch {
    throw new Error('Chave de recuperação inválida.')
  }
}

export async function encryptPayload(masterKey: CryptoKey, payload: VaultPayload, recordId: string): Promise<CipherEnvelope> {
  const iv = randomBytes(AES_GCM_IV_LENGTH)
  const aad = `apoio-pastoral:record:${recordId}:schema:${payload.schemaVersion}`
  const plaintext = utf8(JSON.stringify(payload))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: utf8(aad), tagLength: 128 },
    masterKey,
    plaintext,
  )
  plaintext.fill(0)
  return {
    algorithm: 'AES-GCM-256',
    ciphertext: toBase64Url(ciphertext),
    iv: toBase64Url(iv),
    aad: toBase64Url(utf8(aad)),
    keyVersion: 1,
  }
}

export async function decryptPayload(masterKey: CryptoKey, envelope: CipherEnvelope): Promise<VaultPayload> {
  try {
    const plaintext = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: fromBase64Url(envelope.iv),
        additionalData: fromBase64Url(envelope.aad),
        tagLength: 128,
      },
      masterKey,
      fromBase64Url(envelope.ciphertext),
    )
    return JSON.parse(fromUtf8(plaintext)) as VaultPayload
  } catch {
    throw new Error('Não foi possível abrir esta informação neste dispositivo.')
  }
}
