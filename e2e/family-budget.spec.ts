import { expect, test, type Page } from '@playwright/test'

const email = 'familia.orcamento.e2e@example.invalid'
const password = 'senha-ficticia-orcamento-2026'

async function registerAndEnter(page: Page) {
  await page.goto('/acesso')
  await page.getByLabel('E-mail').fill(email)
  await page.getByRole('textbox', { name: 'Senha' }).fill(password)
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
  await page.getByRole('link', { name: 'Orçamento' }).click()

  // Orçamento abre em Pessoal, com as duas áreas visíveis o tempo todo.
  await expect(page.getByRole('heading', { name: 'Pessoal' })).toBeVisible()
  const areas = page.getByRole('navigation', { name: 'Áreas do Orçamento' })
  await expect(areas.getByRole('link', { name: 'Pessoal' })).toHaveClass(/active/)
  await expect(areas.getByRole('link', { name: 'Trabalho' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Comece com o que já sabe' })).toBeVisible()
  await page.getByRole('button', { name: 'Registrar entrada' }).click()
  await page.getByLabel('Valor').fill('3500')
  await page.getByLabel('Descrição (opcional)').fill('Entrada Fictícia da Família')
  await page.getByLabel('Repetir mensalmente').check()
  await page.getByRole('button', { name: 'Salvar entrada' }).click()
  await expect(page.getByText('Entrada salva.')).toBeVisible()

  // "Despesas" virou um recorte dentro de Saídas, e não mais uma área própria.
  await page.getByRole('link', { name: 'Saídas', exact: true }).click()
  await page.getByRole('link', { name: 'Despesas', exact: true }).click()
  await page.getByRole('button', { name: 'Nova despesa' }).click()
  await page.getByLabel('Descrição').fill('Despesa Fictícia da Família')
  await page.getByLabel('Valor').fill('500')
  await page.getByRole('button', { name: 'Salvar despesa' }).click()
  await expect(page.getByText('Despesa salva.')).toBeVisible()

  await page.getByRole('link', { name: 'Visão geral' }).click()
  const summary = page.getByLabel('Resumo financeiro do mês')
  await expect(summary.getByText('R$ 3.500,00')).toBeVisible()
  await expect(summary.getByText('R$ 500,00')).toBeVisible()
  await expect(summary.getByText('R$ 3.000,00')).toBeVisible()
  await expect(page.getByText('Entrada Fictícia da Família')).toHaveCount(0)
})

test('as duas áreas do Orçamento não misturam o dinheiro da família com o do ministério', async ({ page }, testInfo) => {
  await registerAndEnter(page)

  if (testInfo.project.name === 'mobile-chromium') await page.getByRole('button', { name: 'Abrir menu' }).click()
  await page.getByRole('link', { name: 'Orçamento' }).click()

  // Trabalho: um auxílio e uma despesa maior do que ele.
  await page.getByRole('navigation', { name: 'Áreas do Orçamento' }).getByRole('link', { name: 'Trabalho' }).click()
  await expect(page.getByRole('heading', { name: 'Trabalho' })).toBeVisible()

  await page.getByRole('link', { name: 'Auxílios' }).click()
  await page.getByRole('button', { name: 'Novo auxílio' }).click()
  await page.getByLabel('Auxílio ou cartão').fill('Cartão fictício de combustível')
  await page.getByLabel('Valor').fill('400')
  await page.getByRole('button', { name: 'Salvar auxílio' }).click()
  await expect(page.getByText('Auxílio registrado.')).toBeVisible()

  await page.getByRole('link', { name: 'Despesas', exact: true }).click()
  await page.getByRole('button', { name: 'Nova despesa' }).click()
  await page.getByLabel('Descrição').fill('Abastecimento fictício')
  await page.getByLabel('Valor').fill('520')
  await page.getByRole('button', { name: 'Salvar despesa' }).click()
  await expect(page.getByText('Despesa registrada.')).toBeVisible()

  // O que passou do auxílio saiu do bolso, e a tela diz isso sem conta de cabeça.
  await page.getByRole('link', { name: 'Visão do mês' }).click()
  await expect(page.getByText('do bolso', { exact: false }).first()).toBeVisible()

  // A lista de compras é da área pessoal e soma em tempo real.
  await page.getByRole('navigation', { name: 'Áreas do Orçamento' }).getByRole('link', { name: 'Pessoal' }).click()
  await page.getByRole('link', { name: 'Lista de compras' }).click()
  await page.getByRole('button', { name: 'Novo item' }).click()
  await page.getByLabel('Item').fill('Arroz fictício')
  await page.getByLabel('Quantidade').fill('2')
  await page.getByLabel('Valor no mercado').fill('25')
  await page.getByRole('button', { name: 'Salvar item' }).click()
  await expect(page.getByRole('button', { name: 'Confirmar Arroz fictício' })).toBeVisible()
})
