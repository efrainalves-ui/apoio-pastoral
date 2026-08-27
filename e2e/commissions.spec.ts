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

  for (const name of ['Ana Fictícia', 'Bruno Fictício', 'Carla Fictícia']) {
    await navigateInsideApp(page, '/app/pessoas/nova')
    await page.getByLabel('Nome completo *').fill(name)
    await page.getByLabel('Igreja *').selectOption({ label: 'Igreja Fictícia de Navegação' })
    await page.getByRole('button', { name: 'Salvar pessoa' }).click()
  }
}

async function configureChurch(page: Page) {
  await page.getByRole('link', { name: 'Configurar igreja' }).click()
  await expect(page.getByText('Depois de salvar, você voltará automaticamente para criar a reunião.')).toBeVisible()
  await page.getByLabel('Quórum da Comissão Diretiva').fill('2')
  await page.getByLabel('Quórum da Reunião Administrativa').fill('3')
  await page.getByRole('checkbox', { name: 'Ana Fictícia' }).check()
  await page.getByRole('checkbox', { name: 'Bruno Fictício' }).check()
  await page.getByLabel('Presidente').selectOption({ label: 'Ana Fictícia' })
  await page.getByLabel('Secretário(a)').selectOption({ label: 'Bruno Fictício' })
  await page.getByRole('button', { name: 'Salvar configuração' }).click()
}

test('cartões e criação de reuniões conduzem ao fluxo correto', async ({ page }) => {
  await registerAndPrepareChurch(page)
  await navigateInsideApp(page, '/app/comissoes')

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
  await expect(page.getByText('Comissão Diretiva', { exact: true })).toBeVisible()

  await page.getByRole('link', { name: 'Voltar a Comissões' }).click()
  await page.getByRole('link', { name: 'Abrir Reunião Administrativa' }).click()
  await expect(page.getByRole('heading', { name: 'Reunião Administrativa' })).toBeVisible()

  await page.getByRole('link', { name: 'Voltar a Comissões' }).click()
  await page.getByRole('button', { name: 'Nova reunião da Reunião Administrativa' }).click()
  await expect(page).toHaveURL(/\/app\/comissoes\/[0-9a-f-]+$/)
  await expect(page.getByText('Reunião Administrativa', { exact: true })).toBeVisible()
})
