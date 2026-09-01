import { expect, test, type Page } from '@playwright/test'
import { navigateInsideApp } from './navigation'

const email = 'navegacao.comissoes.e2e@example.invalid'
const password = 'senha-ficticia-comissoes-2027'

async function registerAndPrepareChurch(page: Page) {
  await page.goto('/acesso')
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha').fill(password)
  await page.getByRole('button', { name: 'Criar conta' }).click()
  await page.getByRole('button', { name: 'Já guardei em local seguro' }).click()
  await page.getByLabel('Nome do distrito').fill('Distrito Fictício de Navegação')
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByRole('button', { name: 'Cadastrar manualmente' }).click()
  await page.getByRole('link', { name: 'Revisar igrejas' }).click()
  await page.getByRole('link', { name: 'Nova igreja' }).click()
  await page.getByLabel('Nome da igreja *').fill('Igreja Fictícia de Navegação')
  await page.getByLabel('Tipo *').selectOption('organized_church')
  await page.getByRole('button', { name: 'Salvar igreja' }).click()
  await expect(page.getByRole('heading', { name: 'Igreja Fictícia de Navegação', exact: true })).toBeVisible()

  for (const name of ['Ana Fictícia', 'Bruno Fictício', 'Carla Fictícia']) {
    await navigateInsideApp(page, '/app/pessoas/nova', page.getByLabel('Nome completo *'))
    await page.getByLabel('Nome completo *').fill(name)
    await page.getByLabel('Igreja *').selectOption({ label: 'Igreja Fictícia de Navegação' })
    await page.getByRole('button', { name: 'Salvar pessoa' }).click()
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible()
  }
}

async function configureChurch(page: Page) {
  await page.getByRole('link', { name: 'Configurar igreja' }).click()
  await expect(page.getByText('Depois de salvar, você voltará automaticamente para criar a reunião.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Salvar configuração' })).toBeEnabled()
  await expect(page.getByText('Em igreja organizada: pode ser escolhido um ancião, quando necessário.')).toBeVisible()
  await page.getByLabel('Quórum da Comissão Diretiva').fill('2')
  await page.getByLabel('Quórum da Reunião Administrativa').fill('3')
  // Os membros da Comissão Diretiva ficam no segundo grupo; o primeiro é o dos anciãos.
  await page.getByRole('checkbox', { name: 'Ana Fictícia' }).nth(1).check()
  await page.getByRole('checkbox', { name: 'Bruno Fictício' }).nth(1).check()
  await page.getByRole('checkbox', { name: 'Carla Fictícia' }).nth(1).check()
  await page.getByLabel('Secretário(a)').selectOption({ label: 'Bruno Fictício' })
  await page.getByRole('button', { name: 'Salvar configuração' }).click()
}

test('cartões e criação de reuniões conduzem ao fluxo correto', async ({ page }) => {
  await registerAndPrepareChurch(page)
  await navigateInsideApp(page, '/app/comissoes', page.getByRole('heading', { name: 'Comissões', exact: true }))
  const commissionChurch = page.getByRole('combobox', { name: /^Igreja(?:$|\s)/ })
  await expect(commissionChurch).toContainText('Igreja Fictícia de Navegação')

  await expect(page.getByRole('button', { name: 'Preparar demonstração fictícia completa' })).toHaveCount(0)
  const boardCard = page.getByRole('link', { name: 'Abrir Comissão Diretiva' })
  const administrativeCard = page.getByRole('link', { name: 'Abrir Reunião Administrativa' })
  await expect(boardCard).toHaveClass(/commission-type-card__primary/)
  await expect(administrativeCard).toHaveClass(/commission-type-card__primary/)

  await boardCard.click()
  await expect(page).toHaveURL(/\/app\/comissoes\/diretiva\?churchId=/)
  await expect(page.getByText('Antes de criar uma reunião, configure os responsáveis e o quórum desta igreja.')).toBeVisible()

  await page.getByRole('link', { name: 'Voltar a Comissões' }).click()
  await page.getByRole('button', { name: 'Nova reunião da Comissão Diretiva' }).click()
  await expect(page).toHaveURL(/\/app\/comissoes\/diretiva\?.*nova=1/)
  await expect(page.getByRole('link', { name: 'Configurar igreja' })).toHaveClass(/button--primary/)

  await configureChurch(page)
  await expect(page).toHaveURL(/\/app\/comissoes\/[0-9a-f-]+$/)
  await expect(page.getByText('Comissão Diretiva', { exact: true }).first()).toBeVisible()
  // Sem escolher ninguém, quem preside é o pastor.
  await expect(page.getByLabel('Presidente')).toHaveValue('pastor')


  await page.getByRole('link', { name: 'Voltar a Comissões' }).click()
  await page.getByRole('link', { name: 'Abrir Reunião Administrativa' }).click()
  await expect(page.getByRole('heading', { name: 'Reunião Administrativa', exact: true })).toBeVisible()

  await page.getByRole('link', { name: 'Voltar a Comissões' }).click()
  await page.getByRole('button', { name: 'Nova reunião da Reunião Administrativa' }).click()
  await expect(page).toHaveURL(/\/app\/comissoes\/[0-9a-f-]+$/)
  await expect(page.getByText('Reunião Administrativa', { exact: true }).first()).toBeVisible()
})

test('separa preparar a pauta, realizar a comissão e gerar a ata', async ({ page }) => {
  await registerAndPrepareChurch(page)
  await navigateInsideApp(page, '/app/comissoes', page.getByRole('heading', { name: 'Comissões', exact: true }))
  await page.getByRole('button', { name: 'Nova reunião da Comissão Diretiva' }).click()
  await configureChurch(page)
  await expect(page).toHaveURL(/\/app\/comissoes\/[0-9a-f-]+$/)

  // Etapa 1: só preparação. A votação nem aparece aqui.
  await expect(page.getByRole('heading', { name: 'Dados da reunião' })).toBeVisible()
  await expect(page.getByLabel('Favoráveis')).toHaveCount(0)
  await page.getByRole('checkbox', { name: 'Ana Fictícia' }).check()
  await page.getByRole('checkbox', { name: 'Bruno Fictício' }).check()
  await page.getByLabel('Assunto').fill('Compra fictícia de cadeiras')
  await page.getByLabel('Proposta').fill('comprar cadeiras fictícias para o salão')
  await page.getByRole('button', { name: 'Adicionar à pauta' }).click()
  await expect(page.getByText('1. Compra fictícia de cadeiras').first()).toBeVisible()

  // A ata ainda não pode ser gerada: nada foi votado.
  await page.getByRole('button', { name: '3. Gerar ata' }).click()
  await expect(page.getByText('Registre a decisão de 1 assunto(s) na etapa 2 antes de gerar a ata.')).toBeVisible()

  // Etapa 2: um assunto por vez, com a decisão registrada na hora.
  await page.getByRole('button', { name: '2. Realizar comissão' }).click()
  await expect(page.getByText('Assunto 1 de 1')).toBeVisible()
  await page.getByLabel('Favoráveis').fill('2')
  await page.getByRole('button', { name: 'Registrar decisão' }).click()
  await expect(page.getByText('Decisão registrada.', { exact: true })).toBeVisible()
  await expect(page.getByText('Aprovado').first()).toBeVisible()

  // Etapa 3: revisão final e ata.
  await page.getByRole('button', { name: '3. Gerar ata' }).click()
  await expect(page.getByRole('heading', { name: 'Revisão final dos textos' })).toBeVisible()
  await expect(page.getByText('VOTADO comprar cadeiras fictícias para o salão.').first()).toBeVisible()
  await page.getByRole('button', { name: 'Finalizar ata' }).click()
  await expect(page.getByText('Ata finalizada. O histórico desta reunião está protegido.')).toBeVisible()
})
