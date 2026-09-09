import { useEffect, useLayoutEffect, useRef } from 'react'

/**
 * Sincronizou e a tela continuou igual.
 *
 * As telas carregam os dados uma vez, ao montar. Enquanto sincronizar era um
 * botão que a pessoa apertava e esperava, dava para conviver com isso — mas
 * agora a sincronização acontece sozinha, e uma tela que não se refaz passa a
 * mentir: o compromisso chegou do outro aparelho, está no banco, e a agenda
 * segue mostrando a lista de antes. O pastor conclui que a sincronização não
 * funciona, quando o que não funciona é a tela.
 *
 * Este aviso fecha esse buraco sem que cada tela precise saber o que é
 * sincronização: quem carrega dados troca o seu `useEffect` por este gancho e
 * passa a recarregar quando chega coisa nova.
 */
export const EVENTO_DADOS_SINCRONIZADOS = 'apoio-pastoral:dados-sincronizados'

/** Avisa as telas abertas de que chegou dado novo de outro aparelho. */
export function notificarDadosSincronizados(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(EVENTO_DADOS_SINCRONIZADOS))
}

/**
 * Carrega ao montar, e de novo sempre que a sincronização trouxer novidade.
 *
 * A dependência é a própria função de carregar, como no `useEffect` que este
 * gancho substitui: quem a monta com `useCallback` continua controlando quando
 * ela muda.
 */
export function useReloadOnSync(carregar: () => void | Promise<void>, hasUnsavedChanges?: () => boolean, onReloadBlocked?: () => void): void {
  const dirtyCheck = useRef(hasUnsavedChanges)
  const blockedHandler = useRef(onReloadBlocked)
  useLayoutEffect(() => {
    dirtyCheck.current = hasUnsavedChanges
    blockedHandler.current = onReloadBlocked
  }, [hasUnsavedChanges, onReloadBlocked])

  useEffect(() => {
    /*
      Uma falha ao carregar não pode virar rejeição sem dono.
      Acontece de verdade quando a tela sai antes de a leitura terminar — o
      banco fecha, a promessa quebra, e ninguém está mais ali para tratar. A
      falha em si já é da conta de cada tela, que guarda o próprio aviso de
      erro; o que não serve a ninguém é o estouro solto no console.
    */
    const carregarSemFalhaSolta = () => { void Promise.resolve(carregar()).catch(() => undefined) }
    const aoSincronizar = () => {
      if (dirtyCheck.current?.()) {
        blockedHandler.current?.()
        return
      }
      carregarSemFalhaSolta()
    }
    carregarSemFalhaSolta()
    window.addEventListener(EVENTO_DADOS_SINCRONIZADOS, aoSincronizar)
    return () => { window.removeEventListener(EVENTO_DADOS_SINCRONIZADOS, aoSincronizar) }
  }, [carregar])

  useEffect(() => {
    if (!hasUnsavedChanges) return
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges()) return
      event.preventDefault()
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => { window.removeEventListener('beforeunload', beforeUnload) }
  }, [hasUnsavedChanges])
}
