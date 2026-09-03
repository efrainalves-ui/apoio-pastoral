import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png'],
      manifest: {
        name: 'Apoio Pastoral',
        short_name: 'Apoio Pastoral',
        description: 'Central pessoal, privada e offline para apoio ao ministério pastoral.',
        lang: 'pt-BR',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#f4f1e8',
        theme_color: '#173f35',
        categories: ['productivity', 'lifestyle'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
      },
      devOptions: { enabled: true, navigateFallbackAllowlist: [/^\/$/, /^\/app/] },
    }),
  ],
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    // A suíte unitária precisa ser hermética. Sem isto, o .env.local de quem
    // estiver conduzindo a homologação faria o pacote de sincronização concluir
    // que existe serviço remoto configurado e tentar rede no meio dos testes,
    // e o resultado passaria a depender da máquina. Os testes que precisam de
    // um ambiente específico o declaram com vi.stubEnv.
    env: { VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '', VITE_APP_ENV: '' },
    setupFiles: ['./src/test/setup.ts'],
    // Folga real, e não margem de sorte.
    //
    // Uma execução isolada reprovou sem que ninguém soubesse qual teste tinha
    // sido. A investigação achou o mecanismo: quatro testes rodam entre 1,5 e
    // 3,9 segundos contra um teto padrão de 5 — e reduzir o teto para 2
    // segundos reprova exatamente esses quatro. A margem existia, mas era fina
    // o bastante para a carga da máquina consumir.
    //
    // O tempo limite é uma trava contra travamento, não uma medida de
    // desempenho: apertá-lo não deixa a suíte mais rigorosa, só a deixa
    // instável — e uma reprovação que ninguém reproduz é pior do que nenhuma,
    // porque ensina a equipe a ignorar reprovação.
    testTimeout: 20_000,
    hookTimeout: 20_000,
    css: true,
    coverage: { provider: 'v8', reporter: ['text', 'html'] },
  },
})
