import { expect, test, type Page } from '@playwright/test'
import { navigateInsideApp } from './navigation'

const email = 'navegacao.inicio.e2e@example.invalid'
const password = 'senha-ficticia-navegacao-2026'

async function register(page: Page) {
  await page.goto('/acesso')
  await page.getByLabel('E-mail').fill(email)
  await page.getByRole('textbox', { name: 'Senha' }).fill(password)
  await page.getByRole('button', { name: 'Criar conta' }).click()
  await page.getByRole('button', { name: 'Já guardei em local seguro' }).click()
  await page.getByLabel('Nome do distrito').fill('Distrito Fictício da Navegação')
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByRole('button', { name: 'Cadastrar manualmente' }).click()
  await page.getByRole('link', { name: 'Ir para o início' }).click()
  await expect(page.getByRole('heading', { name: 'Visão do distrito' })).toBeVisible()
}

test('barra inferior, atalhos do topo e botão de criar funcionam', async ({ page }, testInfo) => {
  await register(page)

  if (testInfo.project.name === 'mobile-chromium') {
    // A Bíblia do Produto define exatamente estas cinco entradas, nesta ordem.
    const bottom = page.getByLabel('Navegação principal móvel')
    await expect(bottom).toBeVisible()
    await expect(bottom.getByRole('link')).toHaveText(['Início', 'Agenda', 'Distrito', 'Visitação'])
    await bottom.getByRole('link', { name: 'Visitação' }).click()
    await expect(page).toHaveURL(/\/app\/visitacao$/)
    await bottom.getByRole('link', { name: 'Início' }).click()
    await expect(page).toHaveURL(/\/app$/)
  }

  // O topo tem só dois atalhos, os dois em ícone.
  await expect(page.getByRole('searchbox', { name: 'Buscar pessoa, família ou igreja' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Nova visita' })).toHaveCount(0)

  // As configurações só têm o ícone e não repetem o menu principal.
  await expect(page.getByRole('link', { name: 'Mais' })).toHaveCount(0)
  await navigateInsideApp(page, '/app/configuracoes', page.getByRole('heading', { name: 'Configurações', exact: true }))
  const mais = page.locator('main')
  for (const repetido of ['Visitas e cuidados', 'Pedidos de Oração', 'Famílias', 'Cuidados pastorais', 'Importar pessoas', 'Fidelidade', 'Leitura', 'Orçamento', 'Materiais', 'Relatórios', 'Aniversários', 'Interessados e estudos bíblicos', 'Duplas missionárias', 'Escola Sabatina, PG e UAPG']) {
    await expect(mais.getByRole('link', { name: repetido })).toHaveCount(0)
  }
  await expect(mais.getByRole('link', { name: 'Backup' })).toBeVisible()
  await navigateInsideApp(page, '/app', page.getByRole('heading', { name: 'Visão do distrito' }))

  const create = page.getByRole('button', { name: 'Criar' })
  await expect(create).toHaveAttribute('aria-expanded', 'false')
  await create.click()
  await expect(create).toHaveAttribute('aria-expanded', 'true')

  const quickMenu = page.getByRole('navigation', { name: 'Criar' })
  await expect(quickMenu.getByRole('link', { name: 'Nova pessoa' })).toBeVisible()
  await expect(quickMenu.getByRole('link', { name: 'Novo pedido de oração' })).toBeVisible()
  await quickMenu.getByRole('link', { name: 'Novo compromisso' }).click()

  await expect(page).toHaveURL(/\/app\/agenda\/novo/)
  // A categoria vem primeiro: é ela que decide o que o formulário pergunta.
  await expect(page.getByLabel('Categoria')).toBeVisible()
  await page.getByLabel('Categoria').selectOption({ label: 'Pregação' })
  await expect(page.getByLabel('Título')).toHaveCount(0)
  await expect(page.getByLabel('Local')).toHaveCount(0)
  await expect(page.getByRole('combobox', { name: /^Igreja/ })).toBeVisible()
  await page.getByLabel('Categoria').selectOption({ label: 'Reunião' })
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
  await expect(page.getByRole('link', { name: /Ver pedidos para acompanhar/ })).toHaveAttribute('href', '/app/visitacao?aba=oracao')
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
