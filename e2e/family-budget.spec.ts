import { expect, test, type Page } from '@playwright/test'

const email = 'familia.orcamento.e2e@example.invalid'
const password = 'senha-ficticia-orcamento-2026'

async function registerAndEnter(page: Page) {
  await page.goto('/acesso')
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha').fill(password)
  await page.getByRole('button', { name: 'Criar conta' }).click()
  await page.getByRole('button', { name: 'Já guardei em local seguro' }).click()
  await page.getByLabel('Nome do distrito').fill('Distrito Fictício do Orçamento')
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByRole('button', { name: 'Cadastrar manualmente' }).click()
  await page.getByRole('link', { name: 'Ir para o início' }).click()
}

test('orçamento pessoal funciona no computador e no celular sem misturar dados da igreja', async ({ page }, testInfo) => {
  await registerAndEnter(page)

  if (testInfo.project.name === 'mobile-chromium') await page.getByRole('button', { name: 'Abrir menu' }).click()
  await page.getByRole('link', { name: 'Orçamento Familiar' }).click()

  await expect(page.getByRole('heading', { name: 'Orçamento Familiar' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Comece com o que já sabe' })).toBeVisible()
  await page.getByRole('button', { name: 'Registrar entrada' }).click()
  await page.getByLabel('Valor').fill('3500')
  await page.getByLabel('Descrição (opcional)').fill('Entrada Fictícia da Família')
  await page.getByLabel('Repetir mensalmente').check()
  await page.getByRole('button', { name: 'Salvar entrada' }).click()
  await expect(page.getByText('Entrada salva.')).toBeVisible()

  await page.getByRole('link', { name: 'Despesas', exact: true }).click()
  await page.getByRole('button', { name: 'Nova despesa' }).click()
  await page.getByLabel('Descrição').fill('Despesa Fictícia da Família')
  await page.getByLabel('Valor').fill('500')
  await page.getByRole('button', { name: 'Salvar despesa' }).click()
  await expect(page.getByText('Despesa salva.')).toBeVisible()

  await page.getByRole('link', { name: 'Visão do mês' }).click()
  const summary = page.getByLabel('Resumo financeiro do mês')
  await expect(summary.getByText('R$ 3.500,00')).toBeVisible()
  await expect(summary.getByText('R$ 500,00')).toBeVisible()
  await expect(summary.getByText('R$ 3.000,00')).toBeVisible()
  await expect(page.getByText('Entrada Fictícia da Família')).toHaveCount(0)
})
