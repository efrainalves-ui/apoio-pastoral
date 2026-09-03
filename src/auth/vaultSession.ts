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

/**
 * Envelope da senha nova, guardado antes de o serviço saber dela.
 *
 * Existe para o intervalo entre trocar a senha no serviço e gravar o envelope
 * que a acompanha. Se o navegador fecha ou o aparelho reinicia bem aí, sem
 * este registro a conta ficava com a senha nova no serviço e o envelope antigo
 * em todo lugar — e nenhuma senha abria o cofre. Com ele, a entrada seguinte
 * reconhece a situação e conclui ou desfaz.
 */
function pendingPasswordId(accountId: string): string {
  return `${accountId}:password-pendente`
}
import { authorizeCurrentDevice } from './device'
import { pendingDistrictClosure } from '../district/closeDistrict'
import {
  hasSupabaseConfiguration,
  currentRemoteAccount,
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
  // `pendingRemote` é uma troca de senha que avançou aqui e no serviço, mas
  // cujo envelope não chegou a subir. Sem esta volta, um aparelho novo baixaria
  // o envelope antigo e não abriria o cofre com a senha que agora vale.
  if (senha?.envelope.kind === 'password' && (senha.pendingRemote || !await hasRemotePasswordEnvelope())) {
    await storeRemotePasswordEnvelope(senha.envelope)
    if (senha.pendingRemote) await database.keyEnvelopes.put({ ...senha, pendingRemote: false })
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
  const { record: envelopeRecord, precisaGravar } = await envelopeDeSenhaParaAbrir(account, database)
  const keys = await abrirEnvelopeDeSenha(account, envelopeRecord, password, database, precisaGravar)
  // Conta criada antes do envelope de senha remoto, ou criada com confirmação
  // de e-mail pendente: este aparelho acabou de provar a senha, então completa
  // o que falta. Sem isso, entrar em um navegador novo exigiria a chave de
  // recuperação para sempre.
  try {
    await ensureRemoteProvisioning(account, database)
  } catch { /* sem rede, segue: a próxima entrada tenta de novo */ }
  // A pendência de encerramento vem antes da autorização normal. Um
  // encerramento interrompido deixa este aparelho revogado, e `authorizeCurrentDevice`
  // recusaria com "aparelho removido" — a entrada falhava e o pastor nunca
  // chegava à tela que conclui o encerramento. Quem autoriza, ali, é a
  // retomada, com o identificador que já estava escolhido.
  if (await pendingDistrictClosure(account.id, database)) return { account, keys }
  // Entrar com e-mail e senha vale como autorização do aparelho; quem decide a
  // situação é o serviço.
  await authorizeCurrentDevice(account.id, database)
  return { account, keys }
}

/**
 * Qual envelope de senha usar para abrir o cofre neste aparelho.
 *
 * O caminho normal é o envelope definitivo. Falta um segundo caminho, e é o
 * que faltava depois de uma interrupção: a troca de senha e a recuperação
 * gravam o envelope novo como **pendente** antes de o serviço saber dele, e só
 * promovem o pendente a definitivo no fim. Fechar o navegador entre uma coisa e
 * outra — em um navegador que ainda não conhecia esta conta, o pior caso —
 * deixava a conta com o pendente gravado e nenhum definitivo. A entrada
 * seguinte nem tentava: dizia "este dispositivo precisa ser autorizado com a
 * chave de recuperação", com a senha nova certa na mão e o envelope que ela
 * abre ali ao lado, no mesmo banco.
 *
 * Agora o pendente é aceito. Ele só vale se abrir com a senha que o serviço
 * aceitou — quem prova é a senha, não a existência do registro — e, ao abrir,
 * vira o definitivo, marcado para subir ao serviço na primeira rede.
 */
async function envelopeDeSenhaParaAbrir(
  account: AccountRecord,
  database: ApoioDatabase,
): Promise<{ record: KeyEnvelopeRecord; precisaGravar: boolean }> {
  const definitivo = await database.keyEnvelopes.get(keyEnvelopeId(account.id, 'password'))
  if (definitivo && definitivo.accountId === account.id && definitivo.envelope.kind === 'password') {
    return { record: definitivo, precisaGravar: false }
  }

  const pendente = await database.keyEnvelopes.get(pendingPasswordId(account.id))
  if (pendente && pendente.accountId === account.id && pendente.envelope.kind === 'password') {
    return {
      record: {
        id: keyEnvelopeId(account.id, 'password'),
        kind: 'password',
        accountId: account.id,
        envelope: pendente.envelope,
        updatedAt: pendente.updatedAt,
        pendingRemote: true,
      },
      precisaGravar: true,
    }
  }

  throw new Error('Este dispositivo precisa ser autorizado com a chave de recuperação.')
}

/**
 * Abre o cofre com o envelope deste aparelho e, se ele não abrir, com o do
 * serviço.
 *
 * O caso é a senha trocada em outro aparelho: o serviço já aceitou a senha
 * nova — foi ela que abriu a sessão logo acima —, mas este aparelho ainda tem
 * o envelope cifrado pela antiga. Sem esta volta, o pastor via "Senha
 * incorreta" com a senha certa e o aparelho ficava inutilizável até apagar
 * tudo. O envelope que abrir fica guardado aqui.
 */
async function abrirEnvelopeDeSenha(
  account: AccountRecord,
  envelopeRecord: KeyEnvelopeRecord,
  password: string,
  database: ApoioDatabase,
  precisaGravar = false,
): Promise<VaultKeys> {
  if (envelopeRecord.envelope.kind !== 'password') throw new Error('Envelope de senha indisponível.')
  const pendente = await database.keyEnvelopes.get(pendingPasswordId(account.id))

  try {
    const keys = await openPasswordEnvelope(envelopeRecord.envelope, password)
    // Retomada pelo pendente: ele abriu com a senha que vale, então vira o
    // definitivo agora. A marca `pendingRemote` faz a próxima entrada com rede
    // concluir o que a interrupção deixou pela metade.
    if (precisaGravar) await database.keyEnvelopes.put(envelopeRecord)
    // A senha que o serviço acabou de aceitar é a antiga: a troca não chegou a
    // valer lá. O envelope guardado antes dela não serve mais para nada.
    if (pendente) await database.keyEnvelopes.delete(pendingPasswordId(account.id))
    return keys
  } catch (falha) {
    // Troca de senha interrompida no meio: o serviço aceitou esta senha e o
    // envelope que a acompanha é o que ficou guardado antes da troca. Concluir
    // agora é o que devolve a conta ao estado inteiro.
    if (pendente?.envelope.kind === 'password') {
      try {
        const keys = await openPasswordEnvelope(pendente.envelope, password)
        await database.keyEnvelopes.put({ ...envelopeRecord, envelope: pendente.envelope, updatedAt: new Date().toISOString(), pendingRemote: true })
        await database.keyEnvelopes.delete(pendingPasswordId(account.id))
        return keys
      } catch { /* não era esta; segue para o envelope do serviço */ }
    }
    if (account.authMode !== 'supabase' || !hasSupabaseConfiguration) throw falha
    let remoto
    try {
      remoto = await fetchRemotePasswordEnvelope()
    } catch { throw falha }
    const keys = await openPasswordEnvelope(remoto, password)
    await database.keyEnvelopes.put({ ...envelopeRecord, envelope: remoto, updatedAt: new Date().toISOString(), pendingRemote: false })
    await database.keyEnvelopes.delete(pendingPasswordId(account.id))
    return keys
  }
}

/**
 * Como a senha do serviço será acertada nesta recuperação.
 *
 * A ordem importa e é a razão de existir esta estrutura: a chave de
 * recuperação precisa conferir **antes** de qualquer alteração remota. Antes,
 * a conclusão pelo link do e-mail trocava a senha do serviço primeiro e só
 * depois pedia a chave; com a chave errada, o pastor ficava com a senha antiga
 * já inválida e um cofre que nenhuma senha abria.
 */
interface PlanoDeRecuperacao {
  /** Senha que o serviço aceita agora, quando ela é conhecida. */
  currentPassword?: string
  /** Trocar a senha do serviço, sempre depois de a chave conferir. */
  setRemotePassword: boolean
}

async function recuperarComChave(
  email: string,
  recoveryCode: string,
  newPassword: string,
  database: ApoioDatabase,
  plano: PlanoDeRecuperacao,
): Promise<{ account: AccountRecord; keys: VaultKeys }> {
  const problema = passwordProblem(newPassword)
  if (problema) throw new Error(problema)
  const normalizedEmail = email.trim().toLowerCase()
  const local = await database.accounts.where('email').equals(normalizedEmail).first()
  let account = local
  let recoveryEnvelope

  if (!account && hasSupabaseConfiguration) {
    // Aparelho que não conhece a conta. A sessão já aberta pelo link do e-mail
    // serve de prova; sem ela, entra com a senha que o serviço aceita hoje.
    const daSessao = await currentRemoteAccountId()
    const contaRemota = daSessao ?? await signInRemoteAccount(normalizedEmail, plano.currentPassword ?? newPassword)
    recoveryEnvelope = await fetchRemoteRecoveryEnvelope()
    account = { id: contaRemota, email: normalizedEmail, createdAt: new Date().toISOString(), authMode: 'supabase' }
  } else {
    const recoveryRecord = await database.keyEnvelopes.get(keyEnvelopeId(account?.id ?? '', 'recovery'))
    if (!recoveryRecord || recoveryRecord.accountId !== account?.id || recoveryRecord.envelope.kind !== 'recovery') throw new Error('Envelope de recuperação indisponível.')
    recoveryEnvelope = recoveryRecord.envelope
  }
  if (!account) throw new Error('Conta não encontrada neste dispositivo.')

  // A prova vem primeiro, e nada foi gravado até aqui. Uma chave errada para
  // neste ponto com a conta exatamente como estava — nem a senha do serviço,
  // nem o envelope, nem sequer um registro local desta conta neste aparelho.
  const { keys, secret } = await openRecoveryVault(recoveryEnvelope, recoveryCode)
  const passwordEnvelope = await createPasswordEnvelope(secret, newPassword)
  secret.fill(0)

  const agora = new Date().toISOString()
  if (!local) {
    await database.accounts.put(account)
    await database.keyEnvelopes.put({ id: keyEnvelopeId(account.id, 'recovery'), kind: 'recovery', accountId: account.id, envelope: recoveryEnvelope, updatedAt: agora })
    await database.syncState.put({ accountId: account.id, cursor: null, lastSyncedAt: null, firstSyncAt: null })
  }

  const remoto = account.authMode === 'supabase' && hasSupabaseConfiguration
  if (remoto) {
    await assertRemoteSessionMatches(account)
    // Mesmo protocolo durável da troca normal de senha: o envelope novo fica
    // gravado antes de o serviço saber dele. Fechar o navegador entre a troca
    // remota e a gravação deixaria a conta com a senha nova no serviço e o
    // envelope antigo em todo lugar, e nenhuma senha abriria o cofre.
    await database.keyEnvelopes.put({
      id: pendingPasswordId(account.id),
      kind: 'password',
      accountId: account.id,
      envelope: passwordEnvelope,
      updatedAt: agora,
      pendingRemote: true,
    })
    if (plano.setRemotePassword) await updateRemotePassword(newPassword)
    try {
      await storeRemotePasswordEnvelope(passwordEnvelope)
    } catch (falha) {
      if (plano.setRemotePassword && plano.currentPassword && await desfazerSenhaDoServico(plano.currentPassword)) {
        await database.keyEnvelopes.delete(pendingPasswordId(account.id))
        throw new Error('Não foi possível concluir a recuperação. Nada mudou; tente de novo.', { cause: falha })
      }
      // A senha do serviço já é a nova e não deu para voltar atrás. Este
      // aparelho avança junto e a pendência conclui na entrada seguinte.
      await database.keyEnvelopes.put({ id: keyEnvelopeId(account.id, 'password'), kind: 'password', accountId: account.id, envelope: passwordEnvelope, updatedAt: agora, pendingRemote: true })
      await database.keyEnvelopes.delete(pendingPasswordId(account.id))
      throw new Error('A senha nova já vale neste aparelho e no serviço, mas o acesso em aparelhos novos ainda não foi atualizado. Entre de novo com a senha nova, com internet, para concluir.', { cause: falha })
    }
  }

  await database.keyEnvelopes.put({ id: keyEnvelopeId(account.id, 'password'), kind: 'password', accountId: account.id, envelope: passwordEnvelope, updatedAt: agora, pendingRemote: false })
  await database.keyEnvelopes.delete(pendingPasswordId(account.id))
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
  return recuperarComChave(email, recoveryCode, newPassword, database, {
    currentPassword,
    setRemotePassword: newPassword !== currentPassword,
  })
}

/** Tenta devolver a senha do serviço ao valor anterior. */
async function desfazerSenhaDoServico(anterior: string): Promise<boolean> {
  try {
    await updateRemotePassword(anterior)
    return true
  } catch {
    return false
  }
}

/**
 * Troca de senha em passos que aguentam interrupção, e que nunca mentem sobre
 * o que ficou valendo.
 *
 * A senha do serviço e o envelope que abre o cofre precisam combinar: envelope
 * novo com senha antiga trava a entrada em outro aparelho; senha nova com
 * envelope antigo trava o cofre. A senha muda primeiro e o envelope logo
 * depois. Se o envelope falha, a senha do serviço volta atrás e nada mudou.
 *
 * O buraco estava no caso seguinte: quando nem a volta atrás dava certo, a
 * conta ficava com a senha nova no serviço e o envelope antigo em todo lugar —
 * e o pastor lia "nada mudou", que era falso. Agora este aparelho avança junto
 * com o serviço, marca a pendência do envelope e diz exatamente o que
 * aconteceu; a próxima entrada com rede conclui sozinha.
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
  const guardar = async (pendingRemote: boolean) => {
    await database.keyEnvelopes.put({ ...passwordRecord, envelope: replacement, updatedAt: new Date().toISOString(), pendingRemote })
    await database.keyEnvelopes.delete(pendingPasswordId(account.id))
  }

  if (account.authMode !== 'supabase' || !hasSupabaseConfiguration) {
    await guardar(false)
    return keys
  }

  await assertRemoteSessionMatches(account)

  // O envelope da senha nova é gravado ANTES de o serviço saber dela. Se o
  // navegador fechar entre a troca remota e a gravação do envelope, é este
  // registro que permite à entrada seguinte reconhecer o que aconteceu:
  // sem ele, a senha nova valeria no serviço e o envelope antigo em todo
  // lugar, e nenhuma senha abriria o cofre.
  await database.keyEnvelopes.put({
    id: pendingPasswordId(account.id),
    kind: 'password',
    accountId: account.id,
    envelope: replacement,
    updatedAt: new Date().toISOString(),
    pendingRemote: true,
  })

  await updateRemotePassword(newPassword)
  try {
    await storeRemotePasswordEnvelope(replacement)
  } catch (falha) {
    if (await desfazerSenhaDoServico(currentPassword)) {
      await database.keyEnvelopes.delete(pendingPasswordId(account.id))
      throw new Error('Não foi possível concluir a troca de senha. Nada mudou; tente de novo.', { cause: falha })
    }
    await guardar(true)
    throw new Error('A senha nova já vale neste aparelho e no serviço, mas o acesso em aparelhos novos ainda não foi atualizado. Entre de novo com a senha nova, com internet, para concluir.', { cause: falha })
  }
  await guardar(false)
  return keys
}

/**
 * Conclui a redefinição de senha aberta pelo link do e-mail.
 *
 * O link do serviço abre uma sessão e nada mais: sozinho, ele nunca chegava a
 * trocar senha nenhuma, e o aviso na tela mandava o pastor entrar com uma senha
 * nova que jamais fora definida. Aqui a senha do serviço é definida de fato.
 *
 * A chave de recuperação continua obrigatória neste caminho, e não por
 * burocracia: o cofre é aberto pela senha antiga, que se perdeu. Sem a chave,
 * nem este aplicativo nem o serviço têm como abrir o conteúdo — é o que
 * significa o servidor não poder ler nada.
 */
export async function completePasswordReset(
  email: string,
  recoveryCode: string,
  newPassword: string,
  database: ApoioDatabase = db,
): Promise<{ account: AccountRecord; keys: VaultKeys }> {
  const problema = passwordProblem(newPassword)
  if (problema) throw new Error(problema)
  if (!hasSupabaseConfiguration) throw new Error('A redefinição por e-mail só existe com o serviço configurado.')

  // 1. A sessão do link precisa existir e ser da conta deste e-mail. Conferir
  //    só o identificador não bastava: quem digita o e-mail é o titular, e é
  //    esse e-mail que precisa bater com o da sessão que o link abriu — do
  //    contrário a senha trocada seria a da conta errada, e o titular
  //    descobriria pelo bloqueio.
  const sessao = await currentRemoteAccount()
  if (!sessao) {
    throw new Error('Este link de redefinição não está mais valendo. Peça outro e abra-o neste mesmo aparelho.')
  }
  const normalizedEmail = email.trim().toLowerCase()
  if (sessao.email && sessao.email !== normalizedEmail) {
    throw new Error('Este link é de outra conta. Confira o e-mail que você digitou e abra o link mais recente.')
  }
  const local = await database.accounts.where('email').equals(normalizedEmail).first()
  if (local && local.id !== sessao.id) {
    throw new Error('Este link é de outra conta. Confira o e-mail que você digitou e abra o link mais recente.')
  }

  // 2. A senha do serviço só é trocada lá dentro, depois de a chave de
  //    recuperação conferir, e o envelope novo é gravado antes dela — o mesmo
  //    protocolo durável da troca normal de senha.
  return recuperarComChave(email, recoveryCode, newPassword, database, { setRemotePassword: true })
}

export async function findLocalAccount(database: ApoioDatabase = db): Promise<AccountRecord | undefined> {
  return database.accounts.toCollection().first()
}

/** Contas que já foram abertas neste aparelho, para a tela de troca. */
export async function listLocalAccounts(database: ApoioDatabase = db): Promise<AccountRecord[]> {
  return (await database.accounts.toArray()).sort((left, right) => left.email.localeCompare(right.email, 'pt-BR'))
}
