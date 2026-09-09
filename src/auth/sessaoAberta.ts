import type { VaultKeys } from '../crypto/vault'

/**
 * Manter o cofre aberto entre recarregamentos da mesma aba.
 *
 * Recarregar a página derrubava o pastor para a tela de acesso, porque a chave
 * vive só na memória. É a decisão certa contra um computador perdido, e a
 * decisão errada contra o dia a dia: recarregar é acidente comum, e pedir a
 * senha por causa dele ensina a escolher senha curta.
 *
 * O guardado aqui é o **objeto** da chave, não o segredo dela. As chaves do
 * cofre são criadas como não exportáveis, o que impede exportar seus bytes.
 * Código executado nesta mesma origem ainda poderia pedir que a chave cifrasse
 * ou decifrasse dados; por isso a sessão tem prazo absoluto e continua sendo
 * apagada ao bloquear, sair ou abrir outra aba.
 *
 * O que decide se a chave volta é uma marca em `sessionStorage`, que existe
 * enquanto a aba existe. Recarregar mantém a marca; fechar a aba a leva embora,
 * e na abertura seguinte a chave guardada é apagada antes de qualquer coisa.
 * Assim o comportamento é o pedido: recarregar não desloga, fechar sim.
 */
const BANCO = 'apoio-pastoral-sessao'
const DEPOSITO = 'chaves'
const MARCA = 'apoio-pastoral:sessao-aberta'
const REGISTRO = 'atual'
export const SESSION_MAX_MS = 8 * 60 * 60 * 1000

interface SessaoGuardada { accountId: string; master: CryptoKey; sync: CryptoKey; expiresAt: number }

function abrir(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const pedido = indexedDB.open(BANCO, 1)
      pedido.onupgradeneeded = () => { pedido.result.createObjectStore(DEPOSITO) }
      pedido.onsuccess = () => { resolve(pedido.result) }
      pedido.onerror = () => { resolve(null) }
    } catch {
      // Navegador com armazenamento bloqueado: sem sessão guardada, e o acesso
      // normal continua funcionando.
      resolve(null)
    }
  })
}

async function comDeposito<T>(modo: IDBTransactionMode, acao: (deposito: IDBObjectStore) => IDBRequest): Promise<T | null> {
  const banco = await abrir()
  if (!banco) return null
  return new Promise<T | null>((resolve) => {
    try {
      const transacao = banco.transaction(DEPOSITO, modo)
      const pedido = acao(transacao.objectStore(DEPOSITO))
      pedido.onsuccess = () => { resolve((pedido.result ?? null) as T | null) }
      pedido.onerror = () => { resolve(null) }
      transacao.oncomplete = () => { banco.close() }
    } catch {
      banco.close()
      resolve(null)
    }
  })
}

function marcarAbaAberta(): void {
  try { sessionStorage.setItem(MARCA, '1') } catch { /* sem armazenamento: a sessão simplesmente não persiste */ }
}

function abaAindaAberta(): boolean {
  try { return sessionStorage.getItem(MARCA) === '1' } catch { return false }
}

/** Guarda as chaves para sobreviverem a um recarregamento desta aba. */
export async function manterSessaoAberta(accountId: string, keys: VaultKeys): Promise<void> {
  marcarAbaAberta()
  await comDeposito('readwrite', (deposito) => deposito.put({ accountId, master: keys.master, sync: keys.sync, expiresAt: Date.now() + SESSION_MAX_MS } satisfies SessaoGuardada, REGISTRO))
}

/** Apaga o que estiver guardado. Chamado ao bloquear, sair e trocar de conta. */
export async function esquecerSessaoAberta(): Promise<void> {
  try { sessionStorage.removeItem(MARCA) } catch { /* nada a fazer */ }
  await comDeposito('readwrite', (deposito) => deposito.delete(REGISTRO))
}

/**
 * As chaves de volta, se e somente se esta aba é a mesma que as guardou.
 *
 * Sem a marca da aba, o que está guardado é resto de uma sessão anterior — e é
 * apagado aqui, antes de qualquer uso. Falhar fechado é o certo: na dúvida,
 * pede-se a senha.
 */
export async function retomarSessaoAberta(accountId: string): Promise<VaultKeys | null> {
  if (!abaAindaAberta()) {
    await comDeposito('readwrite', (deposito) => deposito.delete(REGISTRO))
    return null
  }
  const guardada = await comDeposito<SessaoGuardada>('readonly', (deposito) => deposito.get(REGISTRO))
  if (!guardada || guardada.accountId !== accountId) return null
  if (!Number.isFinite(guardada.expiresAt) || guardada.expiresAt <= Date.now()) {
    await esquecerSessaoAberta()
    return null
  }
  if (!(guardada.master instanceof CryptoKey) || !(guardada.sync instanceof CryptoKey)) return null
  return { master: guardada.master, sync: guardada.sync }
}
