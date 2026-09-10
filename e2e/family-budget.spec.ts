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
  await expect(page.getByLabel('Saldo do mês')).toBeVisible()

  /*
    Entradas e Saídas no modelo novo. A categoria se escolhe em duas etapas —
    a família primeiro, o item depois — porque duzentas e cinquenta opções não
    cabem num seletor de celular.
  */
  await page.getByRole('link', { name: 'Entradas', exact: true }).click()
  await page.getByRole('button', { name: 'Nova entrada' }).click()
  await page.getByLabel('Descrição *').fill('Entrada Fictícia da Família')
  await page.getByLabel('Valor *').fill('3.500,00')
  await page.getByRole('button', { name: 'Escolher categoria' }).click()
  await page.getByRole('button', { name: /Salário e remuneração/ }).click()
  await page.getByRole('button', { name: 'Salário', exact: true }).click()
  await page.getByRole('button', { name: 'Recebida', exact: true }).click()
  await page.getByRole('button', { name: 'Salvar entrada' }).click()
  await expect(page.getByText('Lançamento salvo.')).toBeVisible()
  await expect(page.getByText('Entrada Fictícia da Família')).toBeVisible()

  await page.getByRole('link', { name: 'Saídas', exact: true }).click()
  await page.getByRole('button', { name: 'Nova saída' }).click()
  await page.getByLabel('Descrição *').fill('Despesa Fictícia da Família')
  await page.getByLabel('Valor *').fill('500')
  await page.getByRole('button', { name: 'Escolher categoria' }).click()
  await page.getByRole('button', { name: /^Alimentação/ }).click()
  await page.getByRole('button', { name: 'Supermercado', exact: true }).click()
  await page.getByRole('button', { name: 'Paga', exact: true }).click()
  await page.getByRole('button', { name: 'Salvar saída' }).click()
  await expect(page.getByText('Lançamento salvo.')).toBeVisible()

  // Saldo e livre: o painel soma pelos mesmos cálculos que a lista mostra.
  await page.getByRole('link', { name: 'Visão geral' }).click()
  const saldo = page.getByLabel('Saldo do mês')
  await expect(saldo).toContainText('3.000,00')
  await expect(saldo).toContainText('3.500,00')
  await expect(saldo).toContainText('500,00')
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

  /*
    A lista de compras é da área pessoal e agora nasce do catálogo: o fluxo
    inteiro dela — carrinho, limite e a saída única — está em
    `orcamento-pessoal.spec.ts`. Aqui basta confirmar que ela é pessoal.
  */
  await page.getByRole('navigation', { name: 'Áreas do Orçamento' }).getByRole('link', { name: 'Pessoal' }).click()
  await page.getByRole('link', { name: 'Lista de compras' }).click()
  await expect(page.getByRole('heading', { name: 'Monte sua lista' })).toBeVisible()
})
