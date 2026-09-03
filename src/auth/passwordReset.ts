/**
 * Reconhece a abertura vinda do link de redefinição de senha do serviço.
 *
 * O link do e-mail traz o token no fragmento do endereço, com `type=recovery`.
 * O cliente do serviço consome esse fragmento e limpa o endereço assim que é
 * criado, então a leitura acontece uma única vez, na importação deste módulo,
 * antes de qualquer conexão ser aberta.
 */

/** Verdadeiro quando este endereço é o retorno de uma redefinição de senha. */
export function isPasswordRecoveryUrl(url: string): boolean {
  let endereco: URL
  try {
    endereco = new URL(url)
  } catch {
    return false
  }
  const fragmento = new URLSearchParams(endereco.hash.replace(/^#/u, ''))
  if (fragmento.get('type') === 'recovery') return true
  return endereco.searchParams.get('type') === 'recovery'
}

/**
 * Endereço em que o aplicativo foi aberto, lido antes de o cliente do serviço
 * apagar o fragmento. Sem esta captura no momento da importação, a tela de
 * acesso já encontraria um endereço limpo e nunca ofereceria definir a senha.
 */
export const openedFromPasswordReset =
  typeof window === 'undefined' ? false : isPasswordRecoveryUrl(window.location.href)
