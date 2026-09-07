import { useCallback, useEffect } from 'react'
import { useAuthVault } from '../auth/AuthVaultContext'
import { CareService } from '../care/service'
import { lembretesVencidos, textoDoAviso } from './lembretes'
import { useReloadOnSync } from '../sync/useReloadOnSync'

const care = new CareService()
const CHAVE = 'apoio-pastoral:tarefas-avisadas'
const INTERVALO_MS = 30_000

/**
 * Quais avisos este aparelho já deu.
 *
 * Fica no armazenamento local, e não no cofre: guardado no cofre, cada celular
 * repetiria na próxima sincronização o aviso que o outro já tinha dado.
 */
function avisados(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(CHAVE) ?? '[]') as string[]) } catch { return new Set() }
}

function guardarAvisado(ids: readonly string[]): void {
  try {
    const todos = avisados()
    for (const id of ids) todos.add(id)
    localStorage.setItem(CHAVE, JSON.stringify([...todos].slice(-500)))
  } catch { /* sem armazenamento, o aviso repete: é melhor do que não avisar */ }
}

export function avisosPermitidos(): boolean {
  return typeof Notification !== 'undefined' && Notification.permission === 'granted'
}

export async function pedirPermissaoDeAviso(): Promise<NotificationPermission> {
  if (typeof Notification === 'undefined') return 'denied'
  if (Notification.permission !== 'default') return Notification.permission
  return Notification.requestPermission()
}

/**
 * Avisa das tarefas cuja hora chegou.
 *
 * O aviso sai enquanto o aplicativo estiver aberto — inclusive em segundo
 * plano. Com ele fechado por completo não há como avisar sem um servidor de
 * push, que este aplicativo não tem: nada sai do aparelho sem estar cifrado, e
 * um push precisaria de um servidor sabendo a quem enviar.
 */
export function useAvisosDeTarefa(): void {
  const { account, masterKey } = useAuthVault()

  const conferir = useCallback(async () => {
    if (!account || !masterKey || !avisosPermitidos()) return
    try {
      const tarefas = await care.listTasks(account.id, masterKey)
      const vencidos = lembretesVencidos(tarefas, new Date(), avisados())
      if (!vencidos.length) return
      const { titulo, corpo } = textoDoAviso(vencidos)
      const registro = await navigator.serviceWorker?.getRegistration()
      if (registro) await registro.showNotification(titulo, { body: corpo, tag: 'apoio-pastoral-tarefas' })
      else new Notification(titulo, { body: corpo })
      guardarAvisado(vencidos.map(({ id }) => id))
    } catch { /* um aviso que falha não pode derrubar a tela */ }
  }, [account, masterKey])

  useEffect(() => {
    void conferir()
    const timer = window.setInterval(() => { void conferir() }, INTERVALO_MS)
    return () => window.clearInterval(timer)
  }, [conferir])

  useReloadOnSync(conferir)
}
