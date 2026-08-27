import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import { App } from './app/App'
import { AuthVaultProvider } from './auth/AuthVaultContext'
import './styles/index.css'

registerSW({ immediate: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthVaultProvider><App /></AuthVaultProvider>
    </BrowserRouter>
  </StrictMode>,
)
