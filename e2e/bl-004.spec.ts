import { expect, test, type Page } from '@playwright/test'
import { navigateInsideApp } from './navigation'

const email = 'bl004.e2e@example.invalid'
const password = 'senha-ficticia-bl004-2026'

async function register(page: Page) {
  await page.goto('/acesso')
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha').fill(password)
  await page.getByRole('button', { name: 'Criar conta' }).click()
  await page.getByRole('button', { name: 'Já guardei em local seguro' }).click()
  await page.getByLabel('Nome do distrito').fill('Distrito E2E Fictício')
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByRole('button', { name: 'Cadastrar manualmente' }).click()
  await page.getByRole('link', { name: 'Ir para o início' }).click()
  await expect(page.getByRole('heading', { name: 'Visão do distrito' })).toBeVisible()
}

async function openDistrict(page: Page) {
  await navigateInsideApp(page, '/app/distrito', page.getByRole('heading', { name: 'Distrito E2E Fictício' }))
}

async function createDistrictAndChurch(page: Page) {
  await openDistrict(page)
  await expect(page.getByRole('heading', { name: 'Distrito E2E Fictício' })).toBeVisible()

  await page.getByRole('link', { name: 'Nova igreja' }).click()
  await page.getByRole('button', { name: 'Salvar igreja' }).click()
  await expect(page.getByText('Informe o nome da igreja.')).toBeVisible()
  await page.getByLabel(/Nome da igreja/).fill('Ponto Modelo Fictício')
  await page.getByLabel(/Tipo/).selectOption('preaching_point')
  await page.getByLabel(/Endereço/).fill('Rua de Teste, 40')
  await page.getByRole('button', { name: 'Adicionar horário' }).click()
  await page.getByRole('button', { name: 'Salvar igreja' }).click()
  await expect(page.getByRole('heading', { name: 'Ponto Modelo Fictício' })).toBeVisible()
}

test('CRUD e histórico de evolução da igreja', async ({ page }) => {
  await register(page)
  await createDistrictAndChurch(page)

  await page.getByRole('link', { name: 'Editar' }).click()
  await page.getByLabel(/Tipo/).selectOption('group')
  await page.getByLabel(/Situação/).selectOption('archived')
  await page.getByRole('button', { name: 'Salvar igreja' }).click()

  await expect(page.getByText(/Grupo · \d+ membro/)).toBeVisible()
  await page.getByRole('button', { name: 'Histórico' }).click()
  await expect(page.getByText('Tipo alterado de Ponto de pregação para Grupo')).toBeVisible()
  await expect(page.getByText('Situação alterada de Ativa para Arquivada')).toBeVisible()
})

test('distrito e igreja continuam disponíveis offline', async ({ page, context }) => {
  await register(page)
  await createDistrictAndChurch(page)
  await context.setOffline(true)
  await page.reload()
  await page.getByLabel('Senha').fill(password)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.getByRole('heading', { name: 'Visão do distrito', exact: true })).toBeVisible()
  await openDistrict(page)
  await expect(page.getByRole('heading', { name: 'Distrito E2E Fictício' })).toBeVisible()
  await expect(page.getByText('Ponto Modelo Fictício')).toBeVisible()
})
