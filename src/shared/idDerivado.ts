/**
 * Identificador estável, derivado de um texto.
 *
 * O mesmo texto dá sempre o mesmo identificador, no formato aceito pela
 * sincronização. Serve para o que precisa existir uma vez só mesmo sendo criado
 * em dois aparelhos, ou de novo depois de uma atualização: a lista inicial "Pessoal"
 * de uma conta, a marcação de uma tarefa de outra área.
 */
export async function idDerivado(texto: string): Promise<string> {
  const resumo = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto))).slice(0, 16)
  resumo[6] = (resumo[6]! & 0x0f) | 0x50
  resumo[8] = (resumo[8]! & 0x3f) | 0x80
  const hex = [...resumo].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
