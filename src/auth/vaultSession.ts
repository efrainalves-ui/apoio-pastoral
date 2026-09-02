import {
  createPasswordEnvelope,
  createRecoveryEnvelope,
  generateMasterSecret,
  importVaultKeys,
  openPasswordEnvelope,
  openPasswordVault,
  openRecoveryVault,
  type VaultKeys,
} from '../crypto/vault'
import { db, type ApoioDatabase } from '../db/database'
import { keyEnvelopeId, type AccountRecord, type KeyEnvelopeRecord } from '../db/types'
import { authorizeCurrentDevice } from './device'
import {
  hasSupabaseConfiguration,
  currentRemoteAccountId,
  fetchRemotePasswordEnvelope,
  hasRemotePasswordEnvelope,
  fetchRemoteRecoveryEnvelope,
  registerRemoteAccount,
  signInRemoteAccount,
  storeRemotePasswordEnvelope,
  storeRemoteRecoveryEnvelope,
  updateRemotePassword,
} from './supabase'

export interface RegistrationResult {
  account: AccountRecord
  keys: VaultKeys
  recoveryCode: string
  /** Falso quando o serviço ainda espera a confirmação do e-mail. */
  ready: boolean
}

/**
 * Uma senha curta é o elo fraco de um cofre que ninguém mais consegue abrir:
 * não há administrador para redefinir o conteúdo. Doze caracteres é o mínimo,
 * e a orientação na tela é usar uma frase.
 */
export function passwordProblem(password: string): string | null {
  if (password.length < 12) return 'Use uma senha com pelo menos 12 caracteres — uma frase que só você saiba funciona bem.'
  if (/^\d+$/u.test(password)) return 'Uma senha só de números é fácil de adivinhar. Misture palavras.'
  if (/^(.)\1+$/u.test(password)) return 'Essa senha repete o mesmo caractere. Escolha outra.'
  const comuns = ['senha', 'password', '123456789012', 'apoiopastoral', 'igreja', 'jesuscristo']
  const simples = password.toLowerCase().replace(/[^a-z0-9]/gu, '')
  const semNumerosNoFim = simples.replace(/\d+$/u, '')
  if (comuns.some((termo) => simples === termo || semNumerosNoFim === termo)) {
    return 'Essa senha é fácil de adivinhar. Escolha uma frase diferente.'
  }
  return null
}

function validateCredentials(email: string, password: string): void {
  if (!/^\S+@\S+\.\S+$/u.test(email)) throw new Error('Informe um e-mail válido.')
  const problema = passwordProblem(password)
  if (problema) throw new Error(problema)
}

/**
 * Confere que a sessão aberta no serviço é a desta conta antes de gravar
 * qualquer coisa em nome dela. Sem isso, com duas contas no mesmo navegador, o
 * envelope de uma poderia ser escrito na linha da outra.
 */
async function assertRemoteSessionMatches(account: AccountRecord): Promise<void> {
  if (account.authMode !== 'supabase' || !hasSupabaseConfiguration) return
  const remoto = await currentRemoteAccountId()
  if (!remoto) throw new Error('Sua sessão no serviço expirou. Entre novamente com e-mail e senha.')
  if (remoto !== account.id) throw new Error('A sessão aberta no serviço é de outra conta. Saia e entre de novo com esta conta.')
}

export async function registerAccount(
  email: string,
  password: string,
  database: ApoioDatabase = db,
): Promise<RegistrationResult> {
  validateCredentials(email, password)
  const normalizedEmail = email.trim().toLowerCase()
  // Mais de uma conta pode viver no mesmo aparelho; cada uma tem cofre, dados,
  // dispositivos e sincronização próprios. O que não pode é repetir o e-mail.
  if (await database.accounts.where('email').equals(normalizedEmail).first()) {
    throw new Error('Esta conta já existe neste aparelho. Entre com a senha dela.')
  }

  const remoto = hasSupabaseConfiguration ? await registerRemoteAccount(normalizedEmail, password) : null
  const id = remoto?.userId ?? crypto.randomUUID()
  const secret = generateMasterSecret()
  const passwordEnvelope = await createPasswordEnvelope(secret, password)
  const recovery = await createRecoveryEnvelope(secret)
  const keys = await importVaultKeys(secret)
  secret.fill(0)
  const now = new Date().toISOString()
  const account: AccountRecord = {
    id,
    email: normalizedEmail,
    createdAt: now,
    authMode: hasSupabaseConfiguration ? 'supabase' : 'local-development',
  }

  const envelopes: KeyEnvelopeRecord[] = [
    { id: keyEnvelopeId(id, 'password'), kind: 'password', accountId: id, envelope: passwordEnvelope, updatedAt: now },
    { id: keyEnvelopeId(id, 'recovery'), kind: 'recovery', accountId: id, envelope: recovery.envelope, updatedAt: now },
  ]

  await database.transaction('rw', database.accounts, database.keyEnvelopes, database.syncState, async () => {
    await database.accounts.add(account)
    await database.keyEnvelopes.bulkPut(envelopes)
    await database.syncState.put({ accountId: id, cursor: null, lastSyncedAt: null })
  })
  // Com a confirmação de e-mail ligada, o serviço cria o usuário sem sessão:
  // não dá para gravar envelope nem registrar aparelho ainda. A conta fica
  // pronta neste aparelho e o resto acontece na primeira entrada, depois da
  // confirmação — em vez de gravar metade e deixar a conta emperrada.
  if (remoto && !remoto.ready) return { account, keys, recoveryCode: recovery.recoveryCode, ready: false }

  await authorizeCurrentDevice(id, database)
  await storeRemotePasswordEnvelope(passwordEnvelope)
  await storeRemoteRecoveryEnvelope(recovery.envelope)
  return { account, keys, recoveryCode: recovery.recoveryCode, ready: true }
}

/**
 * Completa o que ficou pendente quando a conta foi criada sem sessão. É
 * idempotente: pode rodar em toda entrada sem gravar duas vezes.
 */
async function ensureRemoteProvisioning(account: AccountRecord, database: ApoioDatabase): Promise<void> {
  if (account.authMode !== 'supabase' || !hasSupabaseConfiguration) return
  await assertRemoteSessionMatches(account)
  const senha = await database.keyEnvelopes.get(keyEnvelopeId(account.id, 'password'))
  if (senha?.envelope.kind === 'password' && !await hasRemotePasswordEnvelope()) {
    await storeRemotePasswordEnvelope(senha.envelope)
  }
  const recuperacao = await database.keyEnvelopes.get(keyEnvelopeId(account.id, 'recovery'))
  if (recuperacao?.envelope.kind === 'recovery') await storeRemoteRecoveryEnvelope(recuperacao.envelope)
}

export async function unlockAccount(
  email: string,
  password: string,
  database: ApoioDatabase = db,
): Promise<{ account: AccountRecord; keys: VaultKeys }> {
  const normalizedEmail = email.trim().toLowerCase()
  let account = await database.accounts.where('email').equals(normalizedEmail).first()
  let remoteAccountId: string | null = null
  if (!account) {
    if (hasSupabaseConfiguration) {
      const accountId = await signInRemoteAccount(normalizedEmail, password)
      remoteAccountId = accountId
      const envelope = await fetchRemotePasswordEnvelope()
      account = { id: accountId, email: normalizedEmail, createdAt: new Date().toISOString(), authMode: 'supabase' }
      await database.transaction('rw', database.accounts, database.keyEnvelopes, database.syncState, async () => {
        await database.accounts.put(account!)
        await database.keyEnvelopes.put({ id: keyEnvelopeId(accountId, 'password'), kind: 'password', accountId, envelope, updatedAt: new Date().toISOString() })
        await database.syncState.put({ accountId, cursor: null, lastSyncedAt: null })
      })
    } else {
      throw new Error('E-mail ou senha inválidos.')
    }
  }
  if (account.authMode === 'supabase') {
    const remoteId = remoteAccountId ?? await signInRemoteAccount(normalizedEmail, password)
    if (remoteId !== account.id) throw new Error('Esta conta não corresponde à conta deste dispositivo.')
  }
  const envelopeRecord = await database.keyEnvelopes.get(keyEnvelopeId(account.id, 'password'))
  if (!envelopeRecord || envelopeRecord.accountId !== account.id || envelopeRecord.envelope.kind !== 'password') {
    throw new Error('Este dispositivo precisa ser autorizado com a chave de recuperação.')
  }
  const keys = await openPasswordEnvelope(envelopeRecord.envelope, password)
  // Conta criada antes do envelope de senha remoto, ou criada com confirmação
  // de e-mail pendente: este aparelho acabou de provar a senha, então completa
  // o que falta. Sem isso, entrar em um navegador novo exigiria a chave de
  // recuperação para sempre.
  try {
    await ensureRemoteProvisioning(account, database)
  } catch { /* sem rede, segue: a próxima entrada tenta de novo */ }
  // Entrar com e-mail e senha vale como autorização do aparelho; quem decide a
  // situação é o serviço.
  await authorizeCurrentDevice(account.id, database)
  return { account, keys }
}

/**
 * Recuperação com a chave: para quem perdeu a senha e todos os aparelhos.
 *
 * A senha do serviço precisa ter sido redefinida antes, pelo e-mail oficial —
 * é `currentPassword` quem prova isso. A chave de recuperação nunca sai deste
 * aparelho e nunca é enviada por e-mail: ela só abre o cofre local.
 */
export async function recoverAccount(
  email: string,
  recoveryCode: string,
  newPassword: string,
  database: ApoioDatabase = db,
  currentPassword: string = newPassword,
): Promise<{ account: AccountRecord; keys: VaultKeys }> {
  const problema = passwordProblem(newPassword)
  if (problema) throw new Error(problema)
  const normalizedEmail = email.trim().toLowerCase()
  let account = await database.accounts.where('email').equals(normalizedEmail).first()
  let recoveryEnvelope
  if (!account && hasSupabaseConfiguration) {
    // Aparelho que não conhece a conta: entra no serviço com a senha atual
    // (a que o pastor acabou de definir pelo e-mail de redefinição) e busca o
    // envelope de recuperação. Antes tentava entrar com a senha nova, que o
    // serviço ainda não conhecia, e a recuperação nunca completava.
    const accountId = await signInRemoteAccount(normalizedEmail, currentPassword)
    recoveryEnvelope = await fetchRemoteRecoveryEnvelope()
    account = { id: accountId, email: normalizedEmail, createdAt: new Date().toISOString(), authMode: 'supabase' }
    await database.accounts.put(account)
    await database.keyEnvelopes.put({ id: keyEnvelopeId(accountId, 'recovery'), kind: 'recovery', accountId, envelope: recoveryEnvelope, updatedAt: new Date().toISOString() })
    await database.syncState.put({ accountId, cursor: null, lastSyncedAt: null, firstSyncAt: null })
  } else {
    const recoveryRecord = await database.keyEnvelopes.get(keyEnvelopeId(account?.id ?? '', 'recovery'))
    if (!recoveryRecord || recoveryRecord.accountId !== account?.id || recoveryRecord.envelope.kind !== 'recovery') throw new Error('Envelope de recuperação indisponível.')
    recoveryEnvelope = recoveryRecord.envelope
  }
  if (!account) throw new Error('Conta não encontrada neste dispositivo.')
  const { keys, secret } = await openRecoveryVault(recoveryEnvelope, recoveryCode)
  const passwordEnvelope = await createPasswordEnvelope(secret, newPassword)
  secret.fill(0)
  if (account.authMode === 'supabase' && hasSupabaseConfiguration) {
    await assertRemoteSessionMatches(account)
    // Ordem que aguenta interrupção: primeiro a senha do serviço, depois o
    // envelope que abre o cofre com ela. Se parar no meio, a próxima tentativa
    // repete os dois passos com o mesmo resultado. Quando a senha do serviço já
    // é a mesma, não se mexe nela: repetir a troca é recusado pelo serviço.
    if (newPassword !== currentPassword) await updateRemotePassword(newPassword)
    await storeRemotePasswordEnvelope(passwordEnvelope)
  }
  await database.keyEnvelopes.put({ id: keyEnvelopeId(account.id, 'password'), kind: 'password', accountId: account.id, envelope: passwordEnvelope, updatedAt: new Date().toISOString() })
  await authorizeCurrentDevice(account.id, database)
  return { account, keys }
}

/**
 * Troca de senha em três passos que aguentam interrupção.
 *
 * A senha do serviço e o envelope que abre o cofre precisam combinar. Se o
 * envelope novo ficasse gravado e a senha do serviço não mudasse, entrar em
 * outro aparelho pararia de funcionar; na ordem inversa, o cofre é que não
 * abriria. Por isso a senha muda primeiro, o envelope logo depois, e um erro no
 * meio devolve o envelope antigo ao lugar em que estava.
 */
export async function changeVaultPassword(
  account: AccountRecord,
  currentPassword: string,
  newPassword: string,
  database: ApoioDatabase = db,
): Promise<VaultKeys> {
  const problema = passwordProblem(newPassword)
  if (problema) throw new Error(problema)
  const passwordRecord = await database.keyEnvelopes.get(keyEnvelopeId(account.id, 'password'))
  if (!passwordRecord || passwordRecord.accountId !== account.id || passwordRecord.envelope.kind !== 'password') throw new Error('Envelope de senha indisponível.')
  const { keys, secret } = await openPasswordVault(passwordRecord.envelope, currentPassword)
  const replacement = await createPasswordEnvelope(secret, newPassword)
  secret.fill(0)
  const remoto = account.authMode === 'supabase' && hasSupabaseConfiguration
  if (remoto) {
    await assertRemoteSessionMatches(account)
    await updateRemotePassword(newPassword)
    try {
      await storeRemotePasswordEnvelope(replacement)
    } catch (falha) {
      // O serviço já está com a senha nova; sem o envelope novo lá, um aparelho
      // novo não abriria o cofre. Volta a senha do serviço para o estado antigo
      // e avisa, em vez de deixar a conta em dois estados diferentes.
      await updateRemotePassword(currentPassword).catch(() => undefined)
      throw new Error('Não foi possível concluir a troca de senha. Nada mudou; tente de novo.', { cause: falha })
    }
  }
  await database.keyEnvelopes.put({ ...passwordRecord, envelope: replacement, updatedAt: new Date().toISOString() })
  return keys
}

export async function findLocalAccount(database: ApoioDatabase = db): Promise<AccountRecord | undefined> {
  return database.accounts.toCollection().first()
}

/** Contas que já foram abertas neste aparelho, para a tela de troca. */
export async function listLocalAccounts(database: ApoioDatabase = db): Promise<AccountRecord[]> {
  return (await database.accounts.toArray()).sort((left, right) => left.email.localeCompare(right.email, 'pt-BR'))
}
