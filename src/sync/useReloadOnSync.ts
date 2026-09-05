import { useEffect } from 'react'

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
export function useReloadOnSync(carregar: () => void | Promise<void>): void {
  useEffect(() => {
    void carregar()
    const aoChegarDados = () => { void carregar() }
    window.addEventListener(EVENTO_DADOS_SINCRONIZADOS, aoChegarDados)
    return () => { window.removeEventListener(EVENTO_DADOS_SINCRONIZADOS, aoChegarDados) }
  }, [carregar])
}
