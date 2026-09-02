import { fromBase64Url, fromUtf8, randomBytes, toBase64Url, utf8 } from './encoding'
import type { CipherEnvelope, PasswordKeyEnvelope, RecoveryKeyEnvelope, VaultPayload } from './types'

export const PASSWORD_KDF_ITERATIONS = 600_000
const KEY_LENGTH = 256
const AES_GCM_IV_LENGTH = 12
const MASTER_KEY_AAD = 'apoio-pastoral:key-envelope:v1'
const RECOVERY_INFO = 'apoio-pastoral:recovery-key:v1'

const SYNC_MAC_INFO = 'apoio-pastoral:sync-mac:v2'

/**
 * As duas chaves que o aplicativo mantém abertas enquanto o cofre está
 * destrancado. Nenhuma das duas é exportável: uma vez abertas, nem o próprio
 * código consegue tirar os bytes delas da memória do navegador, então uma falha
 * de script na página não tem como levar a chave embora.
 *
 * O material bruto só existe dentro das funções deste arquivo, pelo tempo de
 * criar ou abrir um envelope, e é zerado logo em seguida.
 */
export interface VaultKeys {
  /** Cifra e decifra o conteúdo dos registros. */
  master: CryptoKey
  /** Assina os metadados de cada operação de sincronização. */
  sync: CryptoKey
}

async function importAesKey(raw: BufferSource): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM', length: KEY_LENGTH }, false, ['encrypt', 'decrypt'])
}

/** Chave de autenticação dos metadados, derivada do mesmo segredo do cofre. */
async function deriveSyncKey(raw: BufferSource): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', raw, 'HKDF', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: utf8(MASTER_KEY_AAD), info: utf8(SYNC_MAC_INFO) },
    material,
    { name: 'HMAC', hash: 'SHA-256', length: 256 },
    false,
    ['sign', 'verify'],
  )
}

export async function importVaultKeys(raw: BufferSource): Promise<VaultKeys> {
  return { master: await importAesKey(raw), sync: await deriveSyncKey(raw) }
}

/** Segredo do cofre recém-criado. Quem chama zera o buffer depois de usar. */
export function generateMasterSecret(): Uint8Array<ArrayBuffer> {
  return randomBytes(KEY_LENGTH / 8)
}

/** Um cofre novo, com as duas chaves já abertas e o segredo descartado. */
export async function generateVaultKeys(): Promise<VaultKeys> {
  const secret = generateMasterSecret()
  const keys = await importVaultKeys(secret)
  secret.fill(0)
  return keys
}

/** Só a chave que cifra os registros. Atalho usado por teste e por serviço. */
export async function generateMasterKey(): Promise<CryptoKey> {
  return (await generateVaultKeys()).master
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

async function wrapMasterSecret(secret: BufferSource, wrappingKey: CryptoKey, aad: string): Promise<CipherEnvelope> {
  const iv = randomBytes(AES_GCM_IV_LENGTH)
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: utf8(aad), tagLength: 128 },
    wrappingKey,
    secret,
  )
  return {
    algorithm: 'AES-GCM-256',
    ciphertext: toBase64Url(ciphertext),
    iv: toBase64Url(iv),
    aad: toBase64Url(utf8(aad)),
    keyVersion: 1,
  }
}

async function unwrapSecret(envelope: CipherEnvelope, wrappingKey: CryptoKey): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: fromBase64Url(envelope.iv),
      additionalData: fromBase64Url(envelope.aad),
      tagLength: 128,
    },
    wrappingKey,
    fromBase64Url(envelope.ciphertext),
  ))
}

export async function createPasswordEnvelope(secret: BufferSource, password: string): Promise<PasswordKeyEnvelope> {
  const salt = randomBytes(16)
  const passwordKey = await derivePasswordKey(password, salt)
  return {
    ...(await wrapMasterSecret(secret, passwordKey, MASTER_KEY_AAD)),
    kind: 'password',
    kdf: 'PBKDF2-SHA-256',
    iterations: PASSWORD_KDF_ITERATIONS,
    salt: toBase64Url(salt),
  }
}

/**
 * Abre o cofre e devolve também o segredo bruto, que só serve para criar um
 * envelope novo (troca de senha). Quem chama zera o buffer logo em seguida.
 */
export async function openPasswordVault(envelope: PasswordKeyEnvelope, password: string): Promise<{ keys: VaultKeys; secret: Uint8Array<ArrayBuffer> }> {
  let secret: Uint8Array<ArrayBuffer>
  try {
    const passwordKey = await derivePasswordKey(password, fromBase64Url(envelope.salt), envelope.iterations)
    secret = await unwrapSecret(envelope, passwordKey)
  } catch {
    throw new Error('Senha incorreta. Verifique e tente novamente.')
  }
  return { keys: await importVaultKeys(secret), secret }
}

export async function openPasswordEnvelope(envelope: PasswordKeyEnvelope, password: string): Promise<VaultKeys> {
  const { keys, secret } = await openPasswordVault(envelope, password)
  secret.fill(0)
  return keys
}

export async function createRecoveryEnvelope(vaultSecret: BufferSource): Promise<{ envelope: RecoveryKeyEnvelope; recoveryCode: string }> {
  const secret = randomBytes(32)
  const salt = randomBytes(16)
  const recoveryKey = await deriveRecoveryKey(secret, salt)
  return {
    envelope: {
      ...(await wrapMasterSecret(vaultSecret, recoveryKey, `${MASTER_KEY_AAD}:recovery`)),
      kind: 'recovery',
      kdf: 'HKDF-SHA-256',
      salt: toBase64Url(salt),
    },
    recoveryCode: `APOIO-1-${toBase64Url(secret)}`,
  }
}

export async function openRecoveryVault(envelope: RecoveryKeyEnvelope, recoveryCode: string): Promise<{ keys: VaultKeys; secret: Uint8Array<ArrayBuffer> }> {
  let secret: Uint8Array<ArrayBuffer>
  try {
    const encodedSecret = recoveryCode.trim().replace(/^APOIO-1-/u, '')
    const recoveryKey = await deriveRecoveryKey(fromBase64Url(encodedSecret), fromBase64Url(envelope.salt))
    secret = await unwrapSecret(envelope, recoveryKey)
  } catch {
    throw new Error('Chave de recuperação inválida.')
  }
  return { keys: await importVaultKeys(secret), secret }
}

export async function openRecoveryEnvelope(envelope: RecoveryKeyEnvelope, recoveryCode: string): Promise<VaultKeys> {
  const { keys, secret } = await openRecoveryVault(envelope, recoveryCode)
  secret.fill(0)
  return keys
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

/**
 * O AAD amarra o texto cifrado ao registro e à versão do formato. Quando o
 * envelope vem de um registro guardado, o vínculo é conferido antes de abrir:
 * assim, trocar o conteúdo de um registro pelo de outro — mesmo dentro da
 * própria conta, mesmo por quem controlar o serviço remoto — é recusado.
 */
function conferirVinculo(envelope: CipherEnvelope & { id?: string }) {
  if (!envelope.id) return
  const aad = fromUtf8(fromBase64Url(envelope.aad))
  if (!aad.startsWith(`apoio-pastoral:record:${envelope.id}:schema:`)) {
    throw new Error('Registro não confere com o conteúdo guardado.')
  }
}

export async function decryptPayload(masterKey: CryptoKey, envelope: CipherEnvelope & { id?: string }): Promise<VaultPayload> {
  conferirVinculo(envelope)
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

/**
 * Registros que não abriram neste aparelho, guardados de lado.
 *
 * Um único registro corrompido não pode derrubar a lista inteira: antes, uma
 * falha ao decifrar interrompia a leitura e a tela ficava vazia, o que para o
 * pastor é indistinguível de perda de todos os dados. Aqui o registro ruim é
 * pulado, contado e mostrado como aviso, e o resto continua acessível.
 */
const corrompidos = new Set<string>()

export function corruptedRecordIds(): string[] { return [...corrompidos] }
export function forgetCorruptedRecords(): void { corrompidos.clear() }

export async function decryptRecord(masterKey: CryptoKey, envelope: CipherEnvelope & { id?: string }): Promise<VaultPayload | null> {
  try {
    return await decryptPayload(masterKey, envelope)
  } catch {
    if (envelope.id) corrompidos.add(envelope.id)
    return null
  }
}
