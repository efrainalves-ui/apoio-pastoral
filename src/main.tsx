import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import { App } from './app/App'
import { AuthVaultProvider } from './auth/AuthVaultContext'
import { aplicarTema, temaGuardado } from './app/tema'
import './styles/index.css'

// Antes de pintar a primeira tela: aplicar depois faria a página piscar no tema
// errado a cada abertura.
aplicarTema(temaGuardado())

/**
 * A versão nova entra sozinha, e sem ninguém precisar apagar dados.
 *
 * A estratégia já era `autoUpdate`: o service worker novo assume assim que é
 * descoberto. O problema era o *descobrir* — o navegador só procura quando a
 * página carrega, então um aplicativo instalado, aberto por dias, seguia
 * servindo a versão antiga indefinidamente. A saída visível para o usuário era
 * apagar os dados do site, que é justamente o que ele nunca deveria precisar
 * fazer.
 *
 * Agora ele procura ao voltar para a frente e de hora em hora. Procurar não é
 * baixar: quando não há versão nova, a checagem é uma requisição condicional
 * que o servidor responde com "nada mudou".
 */
const UMA_HORA = 60 * 60 * 1000

registerSW({
  immediate: true,
  onRegisteredSW(_url, registro) {
    if (!registro) return
    const procurar = () => { void registro.update().catch(() => { /* sem rede: a próxima tentativa resolve */ }) }
    window.setInterval(procurar, UMA_HORA)
    document.addEventListener('visibilitychange', () => { if (!document.hidden) procurar() })
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthVaultProvider><App /></AuthVaultProvider>
    </BrowserRouter>
  </StrictMode>,
)
