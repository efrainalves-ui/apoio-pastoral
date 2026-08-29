import { expect, test, type Page } from '@playwright/test'
import { navigateInsideApp } from './navigation'

async function registerWithFictitiousDistrict(page: Page) {
  await page.goto('/acesso')
  await page.getByLabel('E-mail').fill('planejamento.evangelismo.e2e@example.invalid')
  await page.getByLabel('Senha').fill('senha-ficticia-planejamento-2026')
  await page.getByRole('button', { name: 'Criar conta' }).click()
  await page.getByRole('button', { name: 'Já guardei em local seguro' }).click()
  await page.getByLabel('Nome do distrito').fill('Distrito Fictício do Planejamento')
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByRole('button', { name: 'Cadastrar manualmente' }).click()
  await page.getByRole('link', { name: 'Ir para o início' }).click()
  await navigateInsideApp(page, '/app/distrito/igrejas/nova', page.getByLabel(/Nome da igreja/))
  await page.getByLabel(/Nome da igreja/).fill('Igreja Modelo Fictícia')
  await page.getByLabel(/Tipo/).selectOption('organized_church')
  await page.getByRole('button', { name: 'Salvar igreja' }).click()
  await expect(page.getByRole('heading', { name: 'Igreja Modelo Fictícia' })).toBeVisible()
}

test('planeja uma meta e uma campanha integradas no computador e no celular', async ({ page }) => {
  await registerWithFictitiousDistrict(page)
  await navigateInsideApp(page, '/app/planejamento', page.getByText('Igreja Modelo Fictícia', { exact: true }))
  await expect(page.getByRole('heading', { name: 'Planejamento Anual' })).toBeVisible()
  await page.getByRole('link', { name: 'Nova meta' }).click()
  await page.getByLabel('Título').fill('Meta Anual Fictícia')
  await page.getByLabel('Prazo').fill('2026-10-31')
  await page.getByLabel('Responsável').fill('Responsável Fictício')
  await page.getByText('Igreja Modelo Fictícia', { exact: true }).click()
  await page.getByRole('button', { name: 'Salvar meta anual' }).click()
  await expect(page.getByRole('heading', { name: 'Meta Anual Fictícia' })).toBeVisible()

  await page.getByRole('link', { name: 'Criar campanha', exact: true }).click()
  await page.getByLabel('Nome da campanha').fill('Campanha Fictícia Integrada')
  await page.getByLabel('Data de início').fill('2026-09-01')
  await page.getByLabel('Data de término').fill('2026-09-08')
  await page.getByLabel('Responsável geral').fill('Responsável Fictício')
  await page.getByText('Igreja Modelo Fictícia', { exact: true }).click()
  await page.getByRole('button', { name: 'Salvar campanha e Agenda' }).click()
  await expect(page.getByRole('heading', { name: 'Campanha Fictícia Integrada' })).toBeVisible()
  await expect(page.getByText('Meta Anual Fictícia')).toBeVisible()

  await page.getByLabel('Nome do ponto').fill('Ponto Fictício Central')
  await page.locator('#point-date').fill('2026-09-02')
  await page.locator('#point-responsible').fill('Pessoa Fictícia A')
  await page.getByRole('button', { name: 'Adicionar ponto e Agenda' }).click()
  await expect(page.getByText('Ponto Fictício Central')).toBeVisible()

  await page.getByLabel('Título da tarefa').fill('Preparar recepção fictícia')
  await page.getByLabel('Prazo').last().fill('2026-09-01')
  await page.getByText('Aparecer como lembrete na Agenda').click()
  await page.getByRole('button', { name: 'Criar tarefa' }).click()
  await expect(page.getByText('Preparar recepção fictícia')).toBeVisible()

  await page.getByLabel('Descrição', { exact: true }).fill('Material fictício')
  await page.getByLabel('Valor', { exact: true }).fill('120')
  await page.getByRole('button', { name: 'Adicionar item' }).click()
  await expect(page.getByText('Material fictício')).toBeVisible()

  await navigateInsideApp(page, '/app/agenda', page.getByRole('heading', { name: 'Agenda', exact: true }))
  await expect(page.getByText('Campanha Fictícia Integrada').first()).toBeVisible()
  const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  expect(horizontalOverflow).toBe(false)
})
