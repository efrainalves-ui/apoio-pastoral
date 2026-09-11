import { currentRemoteAccountId, hasSupabaseConfiguration } from './supabase'

/**
 * A aba que mostra a conta A não pode agir depois que a conta B entrou.
 *
 * O cliente do Supabase guarda a sessão no armazenamento do navegador, que é
 * compartilhado entre abas da mesma origem. Entrar com outra conta em uma aba
 * troca a sessão de todas: a aba antiga continua desenhando o nome, os
 * aparelhos e os registros da conta A, mas cada chamada remota que ela faz sai
 * autenticada como B. Listar aparelhos mostrava os de B; revogar revogava os de
 * B; encerrar distrito encerrava o de B; apagar uma pessoa mandava a lápide
 * para a conta errada.
 *
 * Nada disso é conserto de tela. É uma conferência antes de cada operação
 * remota: `user.id` da sessão precisa ser o `accountId` desta aba. Quando não
 * é, a aba fica bloqueada — e continua bloqueada sem rede, sem nova tentativa
 * silenciosa — até um novo acesso com e-mail e senha.
 */
export class SessaoDeOutraContaError extends Error {
  /** Conta que esta aba está mostrando. */
  readonly accountId: string
  constructor(accountId: string, message: string) {
    super(message)
    this.name = 'SessaoDeOutraContaError'
    this.accountId = accountId
  }
}

export const AVISO_SESSAO_TROCADA = 'Outra conta entrou neste navegador. Esta aba foi bloqueada; entre de novo com e-mail e senha para continuar.'
export const AVISO_SESSAO_INDISPONIVEL = 'Não foi possível confirmar a sessão agora. Esta ação não foi feita; tente de novo quando houver conexão.'

/**
 * A sessão não pôde ser conferida agora.
 *
 * Diferente de `SessaoDeOutraContaError` no que importa: ali a conta está
 * **confirmadamente** errada e a aba precisa morrer; aqui não se sabe, e a
 * resposta certa é não fazer a operação.
 *
 * A distinção não é sutil. Enquanto as duas situações eram a mesma, uma falha
 * de rede ao conferir a sessão derrubava o cofre do pastor e o mandava de volta
 * ao acesso dizendo que outra conta tinha entrado — o que não tinha acontecido.
 * Num aplicativo feito para funcionar no meio do distrito, isso significava
 * perder a sessão toda vez que o sinal oscilasse.
 */
export class SessaoIndisponivelError extends Error {
  readonly accountId: string
  constructor(accountId: string, message: string) {
    super(message)
    this.name = 'SessaoIndisponivelError'
    this.accountId = accountId
  }
}

let contaBloqueada: string | null = null
const ouvintes = new Set<(accountId: string) => void>()

/** Conta cuja aba está bloqueada nesta página, ou `null`. */
export function lockedAccountId(): string | null { return contaBloqueada }

/** Avisa a interface para trancar o cofre e pedir um novo acesso. */
export function onAccountSessionLost(ouvinte: (accountId: string) => void): () => void {
  ouvintes.add(ouvinte)
  return () => { ouvintes.delete(ouvinte) }
}

/** Só o novo acesso limpa o bloqueio. */
export function clearAccountSessionLock(): void { contaBloqueada = null }

function bloquear(accountId: string, mensagem: string): never {
  contaBloqueada = accountId
  for (const ouvinte of [...ouvintes]) {
    try { ouvinte(accountId) } catch { /* uma tela que falha não pode desfazer o bloqueio */ }
  }
  throw new SessaoDeOutraContaError(accountId, mensagem)
}

export type AccountSessionGuard = (accountId: string) => Promise<void>

export interface AccountGuardConfig {
  /** Falso no transporte local de desenvolvimento: não existe sessão remota. */
  remoteEnabled: boolean
  readRemoteAccountId: () => Promise<string | null>
}

/**
 * Falha fechada, e só bloqueia o que precisa ser bloqueado.
 *
 * Nenhuma operação segue sem confirmação — essa parte não muda, e é ela que
 * impede uma lápide de ir para a conta errada.
 *
 * O que muda é o preço de não conseguir confirmar. Só a conta **confirmadamente
 * diferente** mata a aba, porque só ela é risco: agir como outra conta não tem
 * volta. Sessão ausente ou erro de rede não são risco nenhum — sem sessão a
 * chamada remota nem sairia — e para elas a resposta honesta é recusar a
 * operação e deixar o pastor continuar trabalhando offline.
 */
export function createAccountSessionGuard({ remoteEnabled, readRemoteAccountId }: AccountGuardConfig): AccountSessionGuard {
  return async (accountId: string) => {
    if (!remoteEnabled) return
    if (contaBloqueada !== null) {
      throw new SessaoDeOutraContaError(contaBloqueada, AVISO_SESSAO_TROCADA)
    }
    let daSessao: string | null
    try {
      daSessao = await readRemoteAccountId()
    } catch (motivo) {
      throw new SessaoIndisponivelError(accountId, `${AVISO_SESSAO_INDISPONIVEL} (${motivo instanceof Error ? motivo.message : 'falha ao conferir a sessão'})`)
    }
    if (!daSessao) throw new SessaoIndisponivelError(accountId, AVISO_SESSAO_INDISPONIVEL)
    if (daSessao !== accountId) bloquear(accountId, AVISO_SESSAO_TROCADA)
  }
}

/** A guarda que o aplicativo usa de verdade. */
export const remoteAccountGuard: AccountSessionGuard = (accountId) => createAccountSessionGuard({
  remoteEnabled: hasSupabaseConfiguration,
  readRemoteAccountId: currentRemoteAccountId,
})(accountId)
