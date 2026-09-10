import { expect, test, type Page } from '@playwright/test'
import { navigateInsideApp } from './navigation'

const email = 'pastor.orcamento@example.invalid'
const password = 'senha-ficticia-segura-2026'

async function entrar(page: Page) {
  await page.goto('/acesso')
  await page.getByLabel('E-mail').fill(email)
  await page.getByRole('textbox', { name: 'Senha' }).fill(password)
  await page.getByRole('button', { name: 'Criar conta' }).click()
  await page.getByRole('button', { name: 'Já guardei em local seguro' }).click()
  await page.getByLabel('Nome do distrito').fill('Distrito Fictício do Orçamento')
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByRole('button', { name: 'Cadastrar manualmente' }).click()
  await page.getByRole('link', { name: 'Ir para o início' }).click()
  await expect(page.getByRole('heading', { name: 'Visão do distrito' })).toBeVisible()
}

test('metas, planejamento e lista de compras funcionam de ponta a ponta', async ({ page }) => {
  test.setTimeout(180_000)
  await entrar(page)
  await navigateInsideApp(page, '/app/orcamento/resumo', page.getByRole('heading', { name: 'Pessoal' }))

  /*
    Planejamento mensal: o orçamento por categoria e o aviso de estouro. O
    aviso existe porque planejar mais do que se ganha é o erro que o
    planejamento deveria evitar, e não repetir.
  */
  await page.getByRole('link', { name: 'Metas e Planejamento' }).click()
  await page.getByRole('button', { name: 'Planejamento mensal' }).click()
  await page.getByLabel('Família', { exact: true }).fill('5.000,00')
  await page.getByLabel('Alimentação', { exact: true }).fill('1.200,00')
  await page.getByRole('button', { name: 'Salvar planejamento' }).click()
  await expect(page.getByText('Planejamento salvo.')).toBeVisible()

  // Meta com aporte: o progresso e a previsão saem do que foi guardado.
  await page.getByRole('button', { name: 'Metas e sonhos' }).click()
  await page.getByRole('button', { name: 'Nova meta' }).click()
  await page.getByLabel('Nome *').fill('Viagem Fictícia')
  await page.getByLabel('Valor da meta *').fill('12.000,00')
  await page.getByLabel('Quanto pretende guardar por mês').fill('700')
  await page.locator('#conteudo').getByRole('button', { name: 'Criar' }).click()
  await expect(page.getByText('Meta criada.')).toBeVisible()

  await page.getByRole('button', { name: '+ Aporte' }).click()
  await page.getByLabel('Valor do aporte').fill('3.200,00')
  await page.getByRole('button', { name: 'Guardar' }).click()
  await expect(page.getByText('Aporte guardado.')).toBeVisible()
  await expect(page.getByText(/Faltam R\$\s?8\.800,00/)).toBeVisible()

  // A reserva se informa em despesa mensal e meses, não em reais.
  await page.getByRole('button', { name: 'Reserva de emergência' }).click()
  await page.getByRole('button', { name: 'Nova reserva' }).click()
  await page.getByLabel('Nome *').fill('Reserva Fictícia')
  await page.getByLabel('Despesa essencial média por mês *').fill('4.000,00')
  await expect(page.getByText(/Objetivo: R\$\s?24\.000,00/)).toBeVisible()
  await page.locator('#conteudo').getByRole('button', { name: 'Criar' }).click()
  await expect(page.getByText('Meta criada.')).toBeVisible()
})

test('a compra vira uma saída só, e finalizar de novo não duplica', async ({ page }) => {
  test.setTimeout(180_000)
  await entrar(page)
  await navigateInsideApp(page, '/app/orcamento/compras', page.getByRole('heading', { name: 'Monte sua lista' }))

  // Só uma prateleira, para a lista caber na tela do teste.
  for (const prateleira of ['Massas e farinhas', 'Básicos da despensa', 'Temperos', 'Café da manhã',
    'Geladeira e laticínios', 'Proteínas', 'Frutas', 'Verduras, legumes e raízes', 'Congelados',
    'Bebidas', 'Lanches', 'Limpeza', 'Higiene pessoal', 'Bebê e criança', 'Casa e descartáveis', 'Pet']) {
    await page.getByRole('button', { name: prateleira, exact: true }).click()
  }
  await page.getByRole('button', { name: 'Usar minha lista padrão' }).click()

  await expect(page.getByLabel('Orçamento da compra')).toBeVisible()
  await page.getByLabel('Limite da compra').fill('200')
  await page.getByLabel('Limite da compra').blur()

  const arroz = page.locator('.item-compra').filter({ hasText: 'Arroz branco' })
  await arroz.getByLabel(/Preço de/).fill('25,00')
  await arroz.getByLabel(/Preço de/).blur()
  await arroz.getByLabel(/Quantidade de/).fill('2')
  await arroz.getByRole('button', { name: /^Marcar/ }).click()

  // Quantidade vezes preço, somado no carrinho e descontado do limite.
  const carrinho = page.getByLabel('Orçamento da compra')
  await expect(carrinho).toContainText('50,00')
  await expect(carrinho).toContainText('150,00')

  page.once('dialog', (dialog) => void dialog.accept())
  await page.getByRole('button', { name: 'Finalizar compra' }).click()
  await expect(page.getByText('Compra registrada em Alimentação · Supermercado.')).toBeVisible()

  /*
    Uma compra, uma saída. Finalizar de novo não pode dobrar o valor: a compra
    guarda o lançamento que criou e o botão desaparece.
  */
  await expect(page.getByRole('button', { name: 'Finalizar compra' })).toHaveCount(0)

  await page.getByRole('link', { name: 'Saídas', exact: true }).click()
  const linhas = page.locator('.linha-lancamento').filter({ hasText: 'Compra do mês' })
  await expect(linhas).toHaveCount(1)
  await expect(linhas.first()).toContainText('50,00')
})
