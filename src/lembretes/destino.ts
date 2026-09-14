/**
 * Para onde voltar depois de entrar.
 *
 * Uma notificação abre `/app/lembretes/aviso/<chave>`. Com o cofre fechado, a
 * tela de acesso aparece primeiro; sem guardar o caminho, o pastor entraria e
 * cairia no início, longe do lembrete. Guarda-se só o caminho — a chave opaca
 * que o servidor já conhece, nunca título ou dado do lembrete — na sessão da
 * aba, por pouco tempo, e só se for um caminho dos Lembretes.
 */

const CHAVE = 'apoio-pastoral:destino-apos-entrar'
const VALIDADE_MS = 15 * 60_000
const PERMITIDO = /^\/app\/lembretes(?:\/[A-Za-z0-9_-]{1,128}){0,3}$/u

export function destinoPermitido(caminho: string): boolean {
  return PERMITIDO.test(caminho)
}

export function guardarDestino(caminho: string, agora = Date.now()): void {
  if (!destinoPermitido(caminho)) return
  try { sessionStorage.setItem(CHAVE, JSON.stringify({ caminho, ate: agora + VALIDADE_MS })) } catch { /* sem armazenamento: entra no início */ }
}

/** Lê e apaga: o destino vale para uma entrada só. */
export function consumirDestino(agora = Date.now()): string | null {
  try {
    const bruto = sessionStorage.getItem(CHAVE)
    sessionStorage.removeItem(CHAVE)
    if (!bruto) return null
    const { caminho, ate } = JSON.parse(bruto) as { caminho?: unknown; ate?: unknown }
    return typeof caminho === 'string' && typeof ate === 'number' && ate >= agora && destinoPermitido(caminho) ? caminho : null
  } catch {
    return null
  }
}

export function esquecerDestino(): void {
  try { sessionStorage.removeItem(CHAVE) } catch { /* nada guardado */ }
}
