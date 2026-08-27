export interface CipherEnvelope {
  algorithm: 'AES-GCM-256'
  ciphertext: string
  iv: string
  aad: string
  keyVersion: number
}

export interface PasswordKeyEnvelope extends CipherEnvelope {
  kind: 'password'
  kdf: 'PBKDF2-SHA-256'
  iterations: number
  salt: string
}

export interface RecoveryKeyEnvelope extends CipherEnvelope {
  kind: 'recovery'
  kdf: 'HKDF-SHA-256'
  salt: string
}

export interface VaultPayload {
  schemaVersion: number
  type: string
  data: unknown
}
