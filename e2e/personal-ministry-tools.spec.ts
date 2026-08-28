import { expect, test, type Page } from '@playwright/test'

async function registerAndEnter(page: Page) {
  await page.goto('/acesso')
  await page.getByLabel('E-mail').fill('ferramentas.pessoais.e2e@example.invalid')
  await page.getByLabel('Senha').fill('senha-ficticia-ferramentas-2026')
  await page.getByRole('button', { name: 'Criar conta' }).click()
  await page.getByRole('button', { name: 'Já guardei em local seguro' }).click()
  await page.getByLabel('Nome do distrito').fill('Distrito Fictício das Ferramentas')
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByRole('button', { name: 'Cadastrar manualmente' }).click()
  await page.getByRole('link', { name: 'Ir para o início' }).click()
}

async function openMenuOnMobile(page: Page, projectName: string) {
  if (projectName === 'mobile-chromium') await page.getByRole('button', { name: 'Abrir menu' }).click()
}

test('pedidos de oração, leitura e cerimônias são acessíveis no computador e no celular', async ({ page }, testInfo) => {
  await registerAndEnter(page)

  await openMenuOnMobile(page, testInfo.project.name)
  await page.getByRole('link', { name: 'Pedidos de Oração', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Pedidos de Oração' })).toBeVisible()
  await page.getByRole('button', { name: 'Novo pedido' }).click()
  await expect(page.getByText('Pedido sem identificação')).toBeVisible()

  await openMenuOnMobile(page, testInfo.project.name)
  await page.getByRole('link', { name: 'Leitura', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Leitura' })).toBeVisible()
  await page.getByRole('button', { name: 'Adicionar livro' }).first().click()
  await page.getByLabel('Título').fill('Livro Fictício E2E')
  await page.getByLabel('Autor').fill('Autor Fictício E2E')
  await page.getByRole('button', { name: 'Salvar livro' }).click()
  await expect(page.getByRole('heading', { name: 'Livro Fictício E2E' })).toBeVisible()

  await openMenuOnMobile(page, testInfo.project.name)
  await page.getByRole('link', { name: 'Agenda', exact: true }).click()
  await page.getByRole('link', { name: 'Novo compromisso' }).click()
  const category = page.getByLabel('Categoria')
  for (const label of ['Batismo', 'Santa Ceia', 'Casamento', 'Dedicação de criança']) {
    await category.selectOption({ label })
    await expect(page.getByRole('heading', { name: `Organização · ${label}` })).toBeVisible()
    await expect(page.getByLabel('Responsável')).toBeVisible()
    await expect(page.getByText('Checklist da cerimônia')).toBeVisible()
  }
})
