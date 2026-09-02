import { useEffect } from 'react'

/** Quinze minutos sem tocar em nada fecham o cofre. */
export const INACTIVITY_MS = 15 * 60 * 1000
/** Cinco minutos em segundo plano também. */
export const BACKGROUND_MS = 5 * 60 * 1000

export interface LockCheck {
  agora: number
  ultimaAtividade: number
  escondidoDesde: number | null
}

/**
 * Bloquear o cofre é diferente de sair: o conteúdo fica fechado neste aparelho
 * e volta com a senha, sem encerrar a sessão do serviço. Um aparelho esquecido
 * aberto em cima da mesa é o caso comum — e o conteúdo aqui é pastoral.
 */
export function shouldLock({ agora, ultimaAtividade, escondidoDesde }: LockCheck): boolean {
  if (agora - ultimaAtividade >= INACTIVITY_MS) return true
  return escondidoDesde !== null && agora - escondidoDesde >= BACKGROUND_MS
}

/** Fecha o cofre sozinho depois de inatividade ou de um tempo em segundo plano. */
export function useAutoLock(ativo: boolean, lock: () => void): void {
  useEffect(() => {
    if (!ativo) return
    let ultimaAtividade = Date.now()
    let escondidoDesde: number | null = null

    const marcar = () => { ultimaAtividade = Date.now() }
    const conferir = () => {
      if (shouldLock({ agora: Date.now(), ultimaAtividade, escondidoDesde })) lock()
    }
    const aoTrocarVisibilidade = () => {
      if (document.hidden) { escondidoDesde = Date.now(); return }
      conferir()
      escondidoDesde = null
      marcar()
    }

    const relogio = window.setInterval(conferir, 30_000)
    for (const evento of ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const) {
      window.addEventListener(evento, marcar, { passive: true })
    }
    document.addEventListener('visibilitychange', aoTrocarVisibilidade)

    return () => {
      window.clearInterval(relogio)
      for (const evento of ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const) {
        window.removeEventListener(evento, marcar)
      }
      document.removeEventListener('visibilitychange', aoTrocarVisibilidade)
    }
  }, [ativo, lock])
}
