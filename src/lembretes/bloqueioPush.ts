/**
 * O aparelho revogado para de receber notificação.
 *
 * A revogação derrubava a sessão e o recebimento das operações cifradas, mas
 * não tocava na inscrição de push: o aparelho que o pastor tirou da conta
 * continuava recebendo "Você tem um lembrete" — e, com o cofre ainda aberto na
 * memória do service worker, até o título. Um aparelho perdido seguia
 * avisando o que ele fazia naquele dia.
 *
 * São três travas, e cada uma sozinha basta: a inscrição é apagada no serviço
 * quando a revogação acontece (migration 0013), a função de envio só entrega a
 * aparelho ativo, e aqui o próprio aparelho se cala assim que descobre que foi
 * revogado — inclusive sem internet, porque a marca fica gravada nele.
 *
 * Mora fora de `push.ts` porque `push.ts` lê o identificador do aparelho em
 * `auth/device.ts`, e é `auth/device.ts` quem precisa chamar este bloqueio.
 */

const BANCO = 'apoio-pastoral-lembretes-push'
const MARCA = 'apoio-pastoral:push-ativo:'
export const CHAVE_REVOGADO = 'revogado'

function abrirBanco(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const pedido = indexedDB.open(BANCO, 1)
    pedido.onupgradeneeded = () => { pedido.result.createObjectStore('mapa'); pedido.result.createObjectStore('preferencias') }
    pedido.onsuccess = () => resolve(pedido.result)
    pedido.onerror = () => reject(pedido.error ?? new Error('armazenamento indisponível'))
  })
}

async function marcarNoBanco(revogado: boolean): Promise<void> {
  const banco = await abrirBanco()
  await new Promise<void>((resolve, reject) => {
    const transacao = banco.transaction('preferencias', 'readwrite')
    const deposito = transacao.objectStore('preferencias')
    if (revogado) deposito.put(true, CHAVE_REVOGADO); else deposito.delete(CHAVE_REVOGADO)
    transacao.oncomplete = () => resolve()
    transacao.onerror = () => reject(transacao.error ?? new Error('falha ao gravar'))
  })
  banco.close()
}

/**
 * Cala as notificações deste aparelho: marca a revogação onde o service worker
 * enxerga, cancela a inscrição no navegador e esquece a preferência da conta.
 *
 * Nunca levanta exceção: é chamada dentro do caminho de revogação, que não
 * pode falhar por causa de notificação.
 */
export async function bloquearNotificacoesDoAparelho(accountId?: string): Promise<void> {
  await marcarNoBanco(true).catch(() => undefined)
  try {
    const registro = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null
    const inscricao = await registro?.pushManager.getSubscription()
    await inscricao?.unsubscribe()
  } catch { /* sem service worker, ou já cancelada */ }
  try {
    for (const chave of Object.keys(localStorage)) {
      if (chave.startsWith(MARCA) && (!accountId || chave === MARCA + accountId)) localStorage.removeItem(chave)
    }
  } catch { /* nada a limpar */ }
}

/** Some com a marca quando o aparelho volta a ser autorizado e o pastor reativa. */
export async function liberarNotificacoesDoAparelho(): Promise<void> {
  await marcarNoBanco(false).catch(() => undefined)
}
