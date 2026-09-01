import { expect, test, type Page } from '@playwright/test'
import { navigateInsideApp } from './navigation'

const email = 'navegacao.inicio.e2e@example.invalid'
const password = 'senha-ficticia-navegacao-2026'

async function register(page: Page) {
  await page.goto('/acesso')
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha').fill(password)
  await page.getByRole('button', { name: 'Criar conta' }).click()
  await page.getByRole('button', { name: 'Já guardei em local seguro' }).click()
  await page.getByLabel('Nome do distrito').fill('Distrito Fictício da Navegação')
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByRole('button', { name: 'Cadastrar manualmente' }).click()
  await page.getByRole('link', { name: 'Ir para o início' }).click()
  await expect(page.getByRole('heading', { name: 'Visão do distrito' })).toBeVisible()
}

test('barra inferior, busca do cabeçalho e botão de criar funcionam', async ({ page }, testInfo) => {
  await register(page)

  if (testInfo.project.name === 'mobile-chromium') {
    // A Bíblia do Produto define exatamente estas cinco entradas, nesta ordem.
    const bottom = page.getByLabel('Navegação principal móvel')
    await expect(bottom).toBeVisible()
    await expect(bottom.getByRole('link')).toHaveText(['Início', 'Agenda', 'Pessoas', 'Distrito', 'Mais'])
    await bottom.getByRole('link', { name: 'Distrito' }).click()
    await expect(page).toHaveURL(/\/app\/distrito$/)
    await bottom.getByRole('link', { name: 'Início' }).click()
    await expect(page).toHaveURL(/\/app$/)
  }

  const search = page.getByRole('searchbox', { name: 'Buscar pessoa, família ou igreja' })
  await expect(search).toBeVisible()
  await search.fill('Distrito Fictício')
  await search.press('Enter')
  await expect(page).toHaveURL(/\/app\/busca\?termo=/)
  await expect(page.getByRole('heading', { name: 'Busca global' })).toBeVisible()

  const create = page.getByRole('button', { name: 'Criar' })
  await expect(create).toHaveAttribute('aria-expanded', 'false')
  await create.click()
  await expect(create).toHaveAttribute('aria-expanded', 'true')

  const quickMenu = page.getByRole('navigation', { name: 'Criar' })
  await expect(quickMenu.getByRole('link', { name: 'Nova pessoa' })).toBeVisible()
  await expect(quickMenu.getByRole('link', { name: 'Novo pedido de oração' })).toBeVisible()
  await quickMenu.getByRole('link', { name: 'Novo compromisso' }).click()

  await expect(page).toHaveURL(/\/app\/agenda\/novo/)
  await expect(page.getByLabel('Título')).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Criar' })).toHaveCount(0)
})

test('o início mostra os blocos práticos do dia sem classificar ninguém', async ({ page }) => {
  await register(page)

  await expect(page.getByRole('heading', { name: 'Tarefas', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Pedidos de oração', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Interessados e estudos', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Igrejas que precisam de atenção', exact: true })).toBeVisible()

  await expect(page.getByRole('link', { name: /Abrir tarefas/ })).toHaveAttribute('href', '/app/cuidados#tarefas')
  await expect(page.getByRole('link', { name: /Ver pedidos para acompanhar/ })).toHaveAttribute('href', '/app/pedidos-oracao')
  await expect(page.getByRole('link', { name: /Abrir interessados e estudos/ })).toHaveAttribute('href', '/app/missionario')

  const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  expect(horizontalOverflow).toBe(false)
})

test('a revisão de alterações concorrentes abre e explica a decisão', async ({ page }) => {
  await register(page)

  await navigateInsideApp(page, '/app/sincronizacao/conflitos', page.getByRole('heading', { name: 'Revisar alterações concorrentes' }))
  await expect(page.getByText('Nada foi apagado: escolha o que deve ficar valendo.')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Nenhuma revisão pendente' })).toBeVisible()
})
